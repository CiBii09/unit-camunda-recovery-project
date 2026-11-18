import sqlite3

from datetime import datetime, timezone
from pathlib import Path


class DashboardMetricsService:
    """
    Persistent metrics for Event Intake API.

    One row is recorded for each processed event request.
    No applicant identifiers or raw event payloads are stored.
    """

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = (
                Path(__file__).resolve().parents[1]
                / "data"
                / "dashboard_metrics.db"
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
                CREATE TABLE IF NOT EXISTS event_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    is_safe_hold INTEGER NOT NULL,
                    is_stale INTEGER NOT NULL,
                    has_sequence_gap INTEGER NOT NULL,
                    has_validation_error INTEGER NOT NULL,
                    recorded_at TEXT NOT NULL
                )
            """)

    def record_event_result(self, result):
        if not isinstance(result, dict):
            raise ValueError("result must be a dictionary")

        validation = result.get("validation")
        staleness = result.get("staleness")
        sequence = result.get("sequence")

        is_safe_hold = result.get("status") == "SAFE_HOLD"

        is_stale = (
            isinstance(staleness, dict)
            and staleness.get("safe_hold") is True
        )

        has_sequence_gap = (
            isinstance(sequence, dict)
            and sequence.get("safe_hold") is True
        )

        has_validation_error = (
            isinstance(validation, dict)
            and validation.get("valid") is False
        )

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO event_metrics (
                    status,
                    is_safe_hold,
                    is_stale,
                    has_sequence_gap,
                    has_validation_error,
                    recorded_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(result.get("status", "UNKNOWN")),
                    int(is_safe_hold),
                    int(is_stale),
                    int(has_sequence_gap),
                    int(has_validation_error),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def get_metrics(self):
        with self._connect() as connection:
            row = connection.execute("""
                SELECT
                    COUNT(*) AS total_events,
                    COALESCE(SUM(is_safe_hold), 0) AS total_safe_holds,
                    COALESCE(SUM(is_stale), 0) AS stale_data_count,
                    COALESCE(SUM(has_sequence_gap), 0) AS sequence_gaps,
                    COALESCE(SUM(has_validation_error), 0)
                        AS validation_errors
                FROM event_metrics
            """).fetchone()

        return {
            "total_events": row["total_events"],
            "total_safe_holds": row["total_safe_holds"],
            "stale_data_count": row["stale_data_count"],
            "sequence_gaps": row["sequence_gaps"],
            "validation_errors": row["validation_errors"],
            "system_status": "healthy",
        }
