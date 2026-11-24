import sqlite3
import uuid

from datetime import datetime, timezone
from pathlib import Path


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class SafetyControlService:
    """Persistent Kill-Switch and Queue Pause state with an audit trail."""

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = (
                Path(__file__).resolve().parents[1]
                / "data"
                / "safety_controls.db"
            )

        self.db_path = str(db_path)
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        self._initialize_database()

    def _connect(self):
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize_database(self):
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS safety_control_state (
                    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                    kill_switch_active INTEGER NOT NULL,
                    queue_paused INTEGER NOT NULL,
                    last_updated_by TEXT NOT NULL,
                    last_updated_at TEXT NOT NULL
                )
            """)
            connection.execute("""
                INSERT OR IGNORE INTO safety_control_state (
                    singleton_id,
                    kill_switch_active,
                    queue_paused,
                    last_updated_by,
                    last_updated_at
                )
                VALUES (1, 0, 0, 'SYSTEM', ?)
            """, (utc_now(),))
            connection.execute("""
                CREATE TABLE IF NOT EXISTS safety_audit_logs (
                    audit_log_id TEXT PRIMARY KEY,
                    action_type TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)

    @staticmethod
    def _state_payload(row):
        return {
            "killSwitchActive": bool(row["kill_switch_active"]),
            "queuePaused": bool(row["queue_paused"]),
            "dataFreshnessSeconds": 0,
            "isDataStale": False,
            "lastUpdatedBy": row["last_updated_by"],
            "lastUpdatedAt": row["last_updated_at"],
        }

    def get_status(self):
        with self._connect() as connection:
            row = connection.execute("""
                SELECT kill_switch_active, queue_paused,
                       last_updated_by, last_updated_at
                FROM safety_control_state
                WHERE singleton_id = 1
            """).fetchone()
        return self._state_payload(row)

    def set_kill_switch(self, enabled, reason, operator_id):
        now = utc_now()
        action_type = (
            "KILL_SWITCH_ENABLED" if enabled else "KILL_SWITCH_DISABLED"
        )

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute("""
                SELECT queue_paused
                FROM safety_control_state
                WHERE singleton_id = 1
            """).fetchone()
            queue_paused = bool(current["queue_paused"]) or enabled
            connection.execute("""
                UPDATE safety_control_state
                SET kill_switch_active = ?,
                    queue_paused = ?,
                    last_updated_by = ?,
                    last_updated_at = ?
                WHERE singleton_id = 1
            """, (int(enabled), int(queue_paused), operator_id, now))
            audit_log_id = self._append_audit(
                connection, action_type, operator_id, reason, now
            )
            row = connection.execute("""
                SELECT kill_switch_active, queue_paused,
                       last_updated_by, last_updated_at
                FROM safety_control_state
                WHERE singleton_id = 1
            """).fetchone()

        return {
            "status": "SUCCESS",
            **self._state_payload(row),
            "auditLogId": audit_log_id,
            "timestamp": now,
        }

    def set_queue_paused(self, paused, reason, operator_id):
        now = utc_now()

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute("""
                SELECT kill_switch_active
                FROM safety_control_state
                WHERE singleton_id = 1
            """).fetchone()
            kill_switch_active = bool(current["kill_switch_active"])
            effective_paused = paused or kill_switch_active
            if kill_switch_active and not paused:
                action_type = "QUEUE_RESUME_BLOCKED_BY_KILL_SWITCH"
            else:
                action_type = "QUEUE_PAUSED" if effective_paused else "QUEUE_RESUMED"

            connection.execute("""
                UPDATE safety_control_state
                SET queue_paused = ?,
                    last_updated_by = ?,
                    last_updated_at = ?
                WHERE singleton_id = 1
            """, (int(effective_paused), operator_id, now))
            audit_log_id = self._append_audit(
                connection, action_type, operator_id, reason, now
            )
            row = connection.execute("""
                SELECT kill_switch_active, queue_paused,
                       last_updated_by, last_updated_at
                FROM safety_control_state
                WHERE singleton_id = 1
            """).fetchone()

        return {
            "status": "SUCCESS",
            **self._state_payload(row),
            "auditLogId": audit_log_id,
            "timestamp": now,
        }

    @staticmethod
    def _append_audit(connection, action_type, actor, reason, timestamp):
        audit_log_id = f"AUD-{uuid.uuid4().hex[:16].upper()}"
        connection.execute("""
            INSERT INTO safety_audit_logs (
                audit_log_id, action_type, actor, reason, timestamp
            )
            VALUES (?, ?, ?, ?, ?)
        """, (audit_log_id, action_type, actor, reason, timestamp))
        return audit_log_id

    def get_audit_logs(self):
        with self._connect() as connection:
            rows = connection.execute("""
                SELECT audit_log_id, action_type, actor, reason, timestamp
                FROM safety_audit_logs
                ORDER BY timestamp DESC, rowid DESC
            """).fetchall()

        logs = [
            {
                "auditLogId": row["audit_log_id"],
                "actionType": row["action_type"],
                "actor": row["actor"],
                "reason": row["reason"],
                "timestamp": row["timestamp"],
            }
            for row in rows
        ]
        return {"total": len(logs), "logs": logs}
