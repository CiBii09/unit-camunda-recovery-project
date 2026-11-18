import json
import sqlite3
import uuid

from datetime import datetime, timezone
from pathlib import Path


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def calculate_age_seconds(timestamp):
    if not isinstance(timestamp, str) or not timestamp:
        return None

    try:
        parsed = datetime.fromisoformat(
            timestamp.replace("Z", "+00:00")
        )

        if parsed.tzinfo is None:
            return None

        age = (datetime.now(timezone.utc) - parsed).total_seconds()

        if age < 0:
            return None

        return round(age, 2)
    except (TypeError, ValueError):
        return None


class HelpQueueService:
    """
    SQLite-backed storage for events requiring staff intervention.

    Internal applicant identifiers and raw event payloads are never
    included in public task responses.
    """

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = (
                Path(__file__).resolve().parents[1]
                / "data"
                / "help_queue.db"
            )

        self.db_path = str(db_path)

        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(
                parents=True,
                exist_ok=True,
            )

        self._initialize_database()

    def _connect(self):
        connection = sqlite3.connect(
            self.db_path,
            timeout=10,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize_database(self):
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS help_queue_tasks (
                    task_id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL UNIQUE,
                    opaque_ref TEXT NOT NULL UNIQUE,
                    event_json TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    data_updated_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    resolution_note TEXT,
                    last_retry_result TEXT
                )
            """)

            connection.execute("""
                CREATE INDEX IF NOT EXISTS idx_help_queue_status
                ON help_queue_tasks(status, created_at)
            """)

    @staticmethod
    def _extract_data_updated_at(result):
        if not isinstance(result, dict):
            return None

        application_status = result.get("application_status")

        if not isinstance(application_status, dict):
            return None

        record = application_status.get("record")

        if not isinstance(record, dict):
            return None

        return record.get("updated_at")

    def create_task(self, event, result):
        """
        Create one OPEN task for a SAFE_HOLD event.

        Repeated calls for the same event_id return the existing task.
        """
        if not isinstance(event, dict):
            raise ValueError("event must be a dictionary")

        if not isinstance(result, dict):
            raise ValueError("result must be a dictionary")

        if result.get("status") != "SAFE_HOLD":
            raise ValueError("Only SAFE_HOLD events create help queue tasks")

        event_id = event.get("event_id")
        event_type = event.get("event_type")

        if not isinstance(event_id, str) or not event_id.strip():
            raise ValueError("event_id is required")

        if not isinstance(event_type, str) or not event_type.strip():
            raise ValueError("event_type is required")

        now = utc_now()
        task_id = str(uuid.uuid4())
        opaque_ref = "REF-" + uuid.uuid4().hex[:12].upper()

        reason = result.get("reason") or "Staff intervention required"

        if not isinstance(reason, str):
            reason = "Staff intervention required"

        data_updated_at = self._extract_data_updated_at(result)

        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO help_queue_tasks (
                    task_id,
                    event_id,
                    opaque_ref,
                    event_json,
                    event_type,
                    reason,
                    status,
                    data_updated_at,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
                """,
                (
                    task_id,
                    event_id,
                    opaque_ref,
                    json.dumps(event, ensure_ascii=False),
                    event_type,
                    reason,
                    data_updated_at,
                    now,
                    now,
                ),
            )

            row = connection.execute(
                """
                SELECT * FROM help_queue_tasks
                WHERE event_id = ?
                """,
                (event_id,),
            ).fetchone()

        return self._public_task(row)

    def list_tasks(self, status="OPEN"):
        """
        Return public task information only.
        """
        with self._connect() as connection:
            if status is None:
                rows = connection.execute(
                    """
                    SELECT * FROM help_queue_tasks
                    ORDER BY created_at DESC
                    """
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT * FROM help_queue_tasks
                    WHERE status = ?
                    ORDER BY created_at DESC
                    """,
                    (status,),
                ).fetchall()

        return [self._public_task(row) for row in rows]

    def get_task_internal(self, task_id):
        """
        Internal lookup. Do not expose this result directly to frontend.
        """
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM help_queue_tasks
                WHERE task_id = ?
                """,
                (task_id,),
            ).fetchone()

        if row is None:
            return None

        task = dict(row)
        task["event"] = json.loads(task.pop("event_json"))
        return task

    def resolve_task(
        self,
        task_id,
        action,
        note="",
        retry_handler=None,
    ):
        """
        CANCEL marks a task as CANCELLED.

        RETRY reprocesses the original event through retry_handler.
        The task is resolved only when the handler returns ACCEPTED.
        SAFE_HOLD, DUPLICATE, and REJECTED remain OPEN.
        """
        if action not in {"RETRY", "CANCEL"}:
            raise ValueError("action must be RETRY or CANCEL")

        if not isinstance(note, str):
            raise ValueError("note must be a string")

        task = self.get_task_internal(task_id)

        if task is None:
            return None

        if task["status"] != "OPEN":
            return {
                "task": self._public_task(task),
                "action": action,
                "resolved": False,
                "reason": "Task is not OPEN",
            }

        now = utc_now()

        if action == "CANCEL":
            with self._connect() as connection:
                connection.execute(
                    """
                    UPDATE help_queue_tasks
                    SET status = 'CANCELLED',
                        resolution_note = ?,
                        updated_at = ?
                    WHERE task_id = ? AND status = 'OPEN'
                    """,
                    (note, now, task_id),
                )

            updated_task = self.get_task_internal(task_id)

            return {
                "task": self._public_task(updated_task),
                "action": "CANCEL",
                "resolved": True,
                "reason": "Task cancelled",
            }

        if retry_handler is None:
            raise ValueError("retry_handler is required for RETRY")

        retry_result = retry_handler(task["event"])

        if not isinstance(retry_result, dict):
            raise ValueError("retry_handler must return a dictionary")

        retry_status = retry_result.get("status", "UNKNOWN")
        data_updated_at = self._extract_data_updated_at(retry_result)

        if retry_status == "ACCEPTED":
            new_status = "RESOLVED"
            resolved = True
        else:
            new_status = "OPEN"
            resolved = False

        reason = retry_result.get("reason", "Retry completed")

        with self._connect() as connection:
            connection.execute(
                """
                UPDATE help_queue_tasks
                SET status = ?,
                    reason = ?,
                    data_updated_at = COALESCE(?, data_updated_at),
                    resolution_note = ?,
                    last_retry_result = ?,
                    updated_at = ?
                WHERE task_id = ? AND status = 'OPEN'
                """,
                (
                    new_status,
                    str(reason),
                    data_updated_at,
                    note,
                    retry_status,
                    now,
                    task_id,
                ),
            )

        updated_task = self.get_task_internal(task_id)

        return {
            "task": self._public_task(updated_task),
            "action": "RETRY",
            "resolved": resolved,
            "retry_result": retry_result,
            "reason": (
                "Task resolved after successful retry"
                if resolved
                else "Task remains OPEN because retry did not return ACCEPTED"
            ),
        }

    @staticmethod
    def _public_task(row):
        if row is None:
            return None

        task = dict(row)

        return {
            "id": task["task_id"],
            "opaqueRef": task["opaque_ref"],
            "name": task["event_type"],
            "event_type": task["event_type"],
            "reason": task["reason"],
            "status": task["status"],
            "created_at": task["created_at"],
            "updated_at": task["updated_at"],
            "data_updated_at": task["data_updated_at"],
            "age_seconds": calculate_age_seconds(
                task["data_updated_at"]
            ),
        }
