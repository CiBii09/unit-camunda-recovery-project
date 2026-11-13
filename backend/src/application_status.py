from datetime import datetime, timezone


AUTHORITATIVE_STATUSES = {
    "STARTED",
    "PROGRESSING",
    "AWAITING_APPLICANT",
    "AWAITING_BANK",
    "COMPLETED",
    "REJECTED",
    "WITHDRAWN",
    "EXPIRED",
    "BLOCKED",
}


class ApplicationStatusProvider:
    """
    Prototype provider for retrieving current application status.

    This implementation uses in-memory mock data for local testing.
    It is NOT a real bank integration.
    """

    def __init__(self, records=None):
        self.records = records or {}

    @staticmethod
    def _make_key(bank, applicant_key, application_id):
        return bank, applicant_key, application_id

    def get_status(self, bank, applicant_key, application_id):
        """
        Retrieve the latest status for one application.

        Returns None when no matching record exists.
        """
        key = self._make_key(bank, applicant_key, application_id)
        record = self.records.get(key)

        if record is None:
            return None

        return dict(record)

    def update_status(self, record):
        """
        Add or update a mock application status record.
        """
        if not isinstance(record, dict):
            raise ValueError("record must be a dictionary")

        required_fields = (
            "bank",
            "applicant_key",
            "application_id",
            "status",
            "updated_at",
            "version",
        )

        for field in required_fields:
            if field not in record:
                raise ValueError(f"Missing required field: {field}")

        for field in ("bank", "applicant_key", "application_id"):
            if not isinstance(record[field], str) or not record[field].strip():
                raise ValueError(f"Invalid field: {field}")

        if record["status"] not in AUTHORITATIVE_STATUSES:
            raise ValueError("Unsupported application status")

        if (
            not isinstance(record["version"], int)
            or isinstance(record["version"], bool)
            or record["version"] < 1
        ):
            raise ValueError("version must be a positive integer")

        if not isinstance(record["updated_at"], str):
            raise ValueError("updated_at must be an ISO 8601 string")

        try:
            parsed_time = datetime.fromisoformat(
                record["updated_at"].replace("Z", "+00:00")
            )
            if parsed_time.tzinfo is None:
                raise ValueError("updated_at must include timezone")
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid updated_at timestamp") from exc

        key = self._make_key(
            record["bank"],
            record["applicant_key"],
            record["application_id"],
        )

        existing = self.records.get(key)

        if existing is not None and record["version"] <= existing["version"]:
            raise ValueError("version must be greater than the existing version")

        self.records[key] = dict(record)
        return dict(record)

    def check_status(self, bank, applicant_key, application_id, now=None,
                     max_age_seconds=60):
        """
        Retrieve and validate the current application status.

        Missing, invalid, stale or future-dated status fails closed.
        """
        record = self.get_status(bank, applicant_key, application_id)

        if record is None:
            return {
                "available": False,
                "safe_hold": True,
                "status": None,
                "record": None,
                "reason": "Application status not found",
            }

        if (
            record.get("bank") != bank
            or record.get("applicant_key") != applicant_key
            or record.get("application_id") != application_id
        ):
            return {
                "available": False,
                "safe_hold": True,
                "status": None,
                "record": None,
                "reason": "Application identity mismatch",
            }

        if record.get("status") not in AUTHORITATIVE_STATUSES:
            return {
                "available": False,
                "safe_hold": True,
                "status": None,
                "record": None,
                "reason": "Unknown application status",
            }

        if (
            not isinstance(record.get("version"), int)
            or isinstance(record.get("version"), bool)
            or record["version"] < 1
        ):
            return {
                "available": False,
                "safe_hold": True,
                "status": None,
                "record": None,
                "reason": "Invalid status version",
            }

        if not isinstance(max_age_seconds, (int, float)) or isinstance(max_age_seconds, bool) or max_age_seconds <= 0:
            raise ValueError("max_age_seconds must be a positive number")

        try:
            updated_at = datetime.fromisoformat(
                record["updated_at"].replace("Z", "+00:00")
            )

            if updated_at.tzinfo is None:
                raise ValueError("Timezone is required")

            current_time = now or datetime.now(timezone.utc)

            if current_time.tzinfo is None:
                raise ValueError("Current time must include timezone")

            age_seconds = (current_time - updated_at).total_seconds()

            if age_seconds < 0:
                raise ValueError("Status timestamp is in the future")

        except (KeyError, TypeError, ValueError):
            return {
                "available": False,
                "safe_hold": True,
                "status": None,
                "record": None,
                "reason": "Invalid or future status timestamp",
            }

        if age_seconds > max_age_seconds:
            return {
                "available": False,
                "safe_hold": True,
                "status": record["status"],
                "record": record,
                "age_seconds": age_seconds,
                "reason": "Application status is stale",
            }

        return {
            "available": True,
            "safe_hold": False,
            "status": record["status"],
            "record": record,
            "age_seconds": age_seconds,
            "reason": "Application status is fresh",
        }
