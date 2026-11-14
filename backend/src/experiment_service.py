
import importlib.util
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


ELIGIBLE_STATUSES = {
    "STARTED",
    "PROGRESSING",
    "AWAITING_APPLICANT",
    "AWAITING_BANK",
}

INELIGIBLE_STATUSES = {
    "COMPLETED",
    "REJECTED",
    "WITHDRAWN",
    "EXPIRED",
    "BLOCKED",
}


def _load_holdout_module():
    repo_root = Path(__file__).resolve().parents[2]
    module_path = (
        repo_root
        / "testing-data"
        / "statistics"
        / "annex-e-experiment"
        / "src"
        / "holdout_suppression.py"
    )

    spec = importlib.util.spec_from_file_location(
        "unit_holdout_suppression", module_path
    )
    if spec is None or spec.loader is None:
        raise ImportError("Cannot load Holdout/Suppression module")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


holdout = _load_holdout_module()


class ExperimentService:
    """
    Backend service for applicant-level experiment assignment
    and Holdout/Suppression dispatch checks.

    Passing this gate is NOT authorization to send SMS.
    Other contact, campaign, quiet-hour and budget gates remain required.
    """

    def __init__(
        self,
        status_provider,
        db_path,
        secret=None,
        treatment_bp=holdout.DEFAULT_TREATMENT_BP,
        max_age_seconds=60,
    ):
        configured_secret = (
            secret if secret is not None else os.getenv("HOLDOUT_SECRET")
        )

        if isinstance(configured_secret, str):
            configured_secret = configured_secret.encode("utf-8")

        if (
            not isinstance(configured_secret, bytes)
            or len(configured_secret) < 32
        ):
            raise ValueError(
                "HOLDOUT_SECRET must contain at least 32 bytes"
            )

        if (
            not isinstance(treatment_bp, int)
            or isinstance(treatment_bp, bool)
            or not 1 <= treatment_bp <= 9999
        ):
            raise ValueError(
                "treatment_bp must be an integer from 1 to 9999"
            )

        if (
            not isinstance(max_age_seconds, (int, float))
            or isinstance(max_age_seconds, bool)
            or max_age_seconds <= 0
        ):
            raise ValueError("max_age_seconds must be positive")

        self.status_provider = status_provider
        self.db_path = Path(db_path)
        self.secret = configured_secret
        self.treatment_bp = treatment_bp
        self.max_age_seconds = max_age_seconds

    @staticmethod
    def _utc_now(now=None):
        value = now or datetime.now(timezone.utc)

        if value.tzinfo is None:
            raise ValueError("now must be timezone-aware")

        return value.astimezone(timezone.utc)

    @staticmethod
    def _holdout_time(aware_time):
        return aware_time.astimezone(timezone.utc).replace(tzinfo=None)

    def _ensure_schema(self, conn):
        """
        Backward-compatible migration.

        Existing assignment rows receive an opaque reference.
        Their bank remains NULL until a verified assignment request
        binds the legacy row to a bank.
        """
        columns = {
            row[1]
            for row in conn.execute(
                "PRAGMA table_info(experiment_assignment)"
            ).fetchall()
        }

        if "assignment_ref" not in columns:
            conn.execute(
                "ALTER TABLE experiment_assignment "
                "ADD COLUMN assignment_ref TEXT"
            )

        if "bank" not in columns:
            conn.execute(
                "ALTER TABLE experiment_assignment ADD COLUMN bank TEXT"
            )

        rows = conn.execute(
            """
            SELECT assignment_id
            FROM experiment_assignment
            WHERE assignment_ref IS NULL
            """
        ).fetchall()

        for row in rows:
            conn.execute(
                """
                UPDATE experiment_assignment
                SET assignment_ref = ?
                WHERE assignment_id = ?
                  AND assignment_ref IS NULL
                """,
                (secrets.token_urlsafe(32), row[0]),
            )

        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
            idx_experiment_assignment_ref
            ON experiment_assignment(assignment_ref)
            WHERE assignment_ref IS NOT NULL
            """
        )

        conn.commit()

    def _connect(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = holdout.connect(str(self.db_path))

        try:
            self._ensure_schema(conn)
        except Exception:
            conn.close()
            raise

        return conn

    def _get_fresh_status(
        self, bank, applicant_key, application_id, now
    ):
        if self.status_provider is None:
            return None, "Application status provider is unavailable"

        try:
            result = self.status_provider.check_status(
                bank=bank,
                applicant_key=applicant_key,
                application_id=application_id,
                now=now,
                max_age_seconds=self.max_age_seconds,
            )
        except Exception:
            return None, "Application status provider error"

        if (
            not isinstance(result, dict)
            or result.get("available") is not True
            or result.get("safe_hold") is not False
            or not isinstance(result.get("record"), dict)
        ):
            reason = (
                result.get(
                    "reason", "Application status is unavailable"
                )
                if isinstance(result, dict)
                else "Invalid application status response"
            )
            return None, reason

        record = result["record"]
        status = result.get("status")

        if (
            record.get("bank") != bank
            or record.get("applicant_key") != applicant_key
            or record.get("application_id") != application_id
        ):
            return None, "Application identity mismatch"

        if (
            status != record.get("status")
            or status not in ELIGIBLE_STATUSES | INELIGIBLE_STATUSES
        ):
            return None, "Application status mismatch or unsupported status"

        return result, None

    def assign_if_eligible(
        self, bank, applicant_key, application_id, now=None
    ):
        try:
            current_time = self._utc_now(now)
        except Exception:
            return {
                "status": "SAFE_HOLD",
                "assigned": False,
                "reason": "Invalid current timestamp",
            }

        status_result, error = self._get_fresh_status(
            bank, applicant_key, application_id, current_time
        )

        if error:
            return {
                "status": "SAFE_HOLD",
                "assigned": False,
                "reason": error,
            }

        status = status_result["status"]

        if status in INELIGIBLE_STATUSES:
            return {
                "status": "NOT_ELIGIBLE",
                "assigned": False,
                "application_status": status,
                "reason": "Application status is not eligible for experiment",
            }

        if status not in ELIGIBLE_STATUSES:
            return {
                "status": "SAFE_HOLD",
                "assigned": False,
                "reason": "Unknown application eligibility status",
            }

        conn = None

        try:
            conn = self._connect()

            assignment = holdout.assign(
                conn=conn,
                applicant_key=applicant_key,
                application_id=application_id,
                eligible=True,
                now=self._holdout_time(current_time),
                treatment_bp=self.treatment_bp,
                secret=self.secret,
            )

            if assignment is None:
                return {
                    "status": "NOT_ASSIGNED",
                    "assigned": False,
                    "reason": "Suppressed or not eligible for assignment",
                }

            row = conn.execute(
                """
                SELECT assignment_id, assignment_ref, bank
                FROM experiment_assignment
                WHERE experiment_id = ?
                  AND applicant_key = ?
                """,
                (holdout.EXPERIMENT_ID, applicant_key),
            ).fetchone()

            if row is None:
                raise RuntimeError("Assignment record not found")

            assignment_id, assignment_ref, stored_bank = row

            if stored_bank is not None and stored_bank != bank:
                return {
                    "status": "SAFE_HOLD",
                    "assigned": False,
                    "reason": "Assignment bank mismatch",
                }

            if assignment_ref is None:
                assignment_ref = secrets.token_urlsafe(32)

            conn.execute(
                """
                UPDATE experiment_assignment
                SET bank = ?, assignment_ref = ?
                WHERE assignment_id = ?
                """,
                (bank, assignment_ref, assignment_id),
            )
            conn.commit()

            assignment["assignment_ref"] = assignment_ref

        except Exception:
            return {
                "status": "SAFE_HOLD",
                "assigned": False,
                "reason": "Experiment assignment failed",
            }

        finally:
            if conn is not None:
                conn.close()

        return {
            "status": "ASSIGNED",
            "assigned": True,
            "application_status": status,
            "assignment": assignment,
            "reason": "Stable applicant-level assignment retrieved",
        }

    def check_before_dispatch(
        self, bank, applicant_key, application_id, now=None
    ):
        """
        Internal check using applicant identity.
        Retained for backward compatibility and existing tests.
        """
        try:
            current_time = self._utc_now(now)
        except Exception:
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_INVALID_TIMESTAMP",
            }

        status_result, error = self._get_fresh_status(
            bank, applicant_key, application_id, current_time
        )

        if error:
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_STATUS_UNAVAILABLE",
                "detail": error,
            }

        status = status_result["status"]

        if status not in ELIGIBLE_STATUSES:
            return {
                "allowed_for_next_gates": False,
                "reason": f"BLOCK_APPLICATION_STATUS:{status}",
            }

        conn = None

        try:
            conn = self._connect()

            allowed, reason = holdout.check_before_send(
                conn,
                applicant_key,
                now=self._holdout_time(current_time),
            )

        except Exception:
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_EXPERIMENT_GATE_ERROR",
            }

        finally:
            if conn is not None:
                conn.close()

        return {
            "allowed_for_next_gates": bool(allowed),
            "reason": reason,
            "application_status": status,
        }

    def check_before_dispatch_by_ref(
        self, assignment_ref, bank, application_id, now=None
    ):
        """
        Resolve applicant identity internally from an opaque reference.

        Camunda does not need to send applicant_key or know the experiment arm.
        """
        if (
            not isinstance(assignment_ref, str)
            or not assignment_ref.strip()
            or not isinstance(bank, str)
            or not bank.strip()
            or not isinstance(application_id, str)
            or not application_id.strip()
        ):
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_INVALID_REQUEST",
            }

        try:
            current_time = self._utc_now(now)
        except Exception:
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_INVALID_TIMESTAMP",
            }

        conn = None

        try:
            conn = self._connect()

            row = conn.execute(
                """
                SELECT applicant_key, bank
                FROM experiment_assignment
                WHERE assignment_ref = ?
                """,
                (assignment_ref,),
            ).fetchone()

            if row is None:
                return {
                    "allowed_for_next_gates": False,
                    "reason": "BLOCK_UNKNOWN_ASSIGNMENT_REF",
                }

            applicant_key, stored_bank = row

            if stored_bank is None or stored_bank != bank:
                return {
                    "allowed_for_next_gates": False,
                    "reason": "BLOCK_ASSIGNMENT_BANK_MISMATCH",
                }

        except Exception:
            return {
                "allowed_for_next_gates": False,
                "reason": "BLOCK_EXPERIMENT_GATE_ERROR",
            }

        finally:
            if conn is not None:
                conn.close()

        # Re-check the CURRENT application, not the original index application.
        return self.check_before_dispatch(
            bank=bank,
            applicant_key=applicant_key,
            application_id=application_id,
            now=current_time,
        )
