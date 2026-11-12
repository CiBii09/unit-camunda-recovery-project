
from datetime import datetime, timezone


def check_staleness(status_time, now=None, max_age_seconds=60):
    """
    Kiểm tra dữ liệu trạng thái có còn mới hay không.

    Quy tắc:
    - Tuổi dữ liệu <= 60 giây: FRESH.
    - Tuổi dữ liệu > 60 giây: SAFE_HOLD.
    - Thiếu hoặc sai thời gian: SAFE_HOLD.
    - Thời gian cập nhật nằm trong tương lai: SAFE_HOLD.
    """

    if not isinstance(max_age_seconds, (int, float)) or isinstance(max_age_seconds, bool) or max_age_seconds <= 0:
        raise ValueError("max_age_seconds must be a positive number")

    if not status_time or not isinstance(status_time, str):
        return {
            "fresh": False,
            "safe_hold": True,
            "age_seconds": None,
            "reason": "Missing or invalid status_time"
        }

    try:
        parsed_time = datetime.fromisoformat(
            status_time.replace("Z", "+00:00")
        )

        if parsed_time.tzinfo is None:
            raise ValueError("Timezone information is required")

        if now is None:
            current_time = datetime.now(timezone.utc)
        else:
            current_time = now

        if current_time.tzinfo is None:
            raise ValueError("Current time must include timezone")

        age_seconds = (current_time - parsed_time).total_seconds()

        if age_seconds < 0:
            return {
                "fresh": False,
                "safe_hold": True,
                "age_seconds": age_seconds,
                "reason": "Status timestamp is in the future"
            }

        if age_seconds > max_age_seconds:
            return {
                "fresh": False,
                "safe_hold": True,
                "age_seconds": age_seconds,
                "reason": "Status data is stale"
            }

        return {
            "fresh": True,
            "safe_hold": False,
            "age_seconds": age_seconds,
            "reason": "Status data is fresh"
        }

    except (ValueError, TypeError):
        return {
            "fresh": False,
            "safe_hold": True,
            "age_seconds": None,
            "reason": "Invalid status timestamp"
        }
