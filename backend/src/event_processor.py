from src.event_validator import validate_event
from src.deduplication import Deduplication
from src.event_sequence import EventSequenceTracker
from src.stale_check import check_staleness


class EventProcessor:
    """
    Module tích hợp xử lý Event Intake.

    Quy trình:
    1. Validate event.
    2. Kiểm tra event trùng lặp.
    3. Lấy trạng thái hồ sơ hiện tại từ provider.
    4. Kiểm tra độ mới của trạng thái (tối đa 60 giây).
    5. Kiểm tra sequence.
    6. Đăng ký event đã tiếp nhận.

    SAFE_HOLD khi không thể xác minh trạng thái hiện tại.
    ACCEPTED chỉ có nghĩa là Event Intake đã tiếp nhận,
    không đồng nghĩa với quyền gửi SMS.
    """

    def __init__(self, status_provider=None):
        self.deduplication = Deduplication()
        self.sequence_tracker = EventSequenceTracker()
        self.status_provider = status_provider

    def process_event(
        self,
        event,
        status_time=None,
        now=None,
        max_age_seconds=60
    ):
        # 1. Validate event
        validation = validate_event(event)

        if not validation["valid"]:
            return {
                "status": "REJECTED",
                "safe_hold": True,
                "reason": "Event validation failed",
                "validation": validation,
                "sequence": None,
                "staleness": None,
                "application_status": None
            }

        # 2. Deduplicate event
        if self.deduplication.is_duplicate(event):
            return {
                "status": "DUPLICATE",
                "safe_hold": False,
                "reason": "Event has already been processed",
                "validation": validation,
                "sequence": None,
                "staleness": None,
                "application_status": None
            }

        application_status = None

        # 3. Retrieve authoritative application status when provider exists
        if self.status_provider is not None:
            try:
                application_status = self.status_provider.check_status(
                    bank=event["bank"],
                    applicant_key=event["applicant_key"],
                    application_id=event["application_id"],
                    now=now,
                    max_age_seconds=max_age_seconds
                )
            except Exception:
                return {
                    "status": "SAFE_HOLD",
                    "safe_hold": True,
                    "reason": "Application status provider unavailable",
                    "validation": validation,
                    "sequence": None,
                    "staleness": None,
                    "application_status": None
                }

            if (
                not application_status
                or application_status.get("safe_hold") is True
                or application_status.get("available") is not True
            ):
                return {
                    "status": "SAFE_HOLD",
                    "safe_hold": True,
                    "reason": (
                        application_status.get("reason", "Application status unavailable")
                        if isinstance(application_status, dict)
                        else "Invalid application status response"
                    ),
                    "validation": validation,
                    "sequence": None,
                    "staleness": None,
                    "application_status": application_status
                }

            record = application_status.get("record")

            if not isinstance(record, dict):
                return {
                    "status": "SAFE_HOLD",
                    "safe_hold": True,
                    "reason": "Application status record is missing",
                    "validation": validation,
                    "sequence": None,
                    "staleness": None,
                    "application_status": application_status
                }

            status_time = record.get("updated_at")

        # 4. Check status freshness
        staleness_result = check_staleness(
            status_time,
            now=now,
            max_age_seconds=max_age_seconds
        )

        if staleness_result["safe_hold"]:
            return {
                "status": "SAFE_HOLD",
                "safe_hold": True,
                "reason": staleness_result["reason"],
                "validation": validation,
                "sequence": None,
                "staleness": staleness_result,
                "application_status": application_status
            }

        # 5. Check event sequence
        sequence_result = self.sequence_tracker.process_event(event)

        # 6. Register event after freshness check
        # Keep gap events recorded so missing sequences can resolve the gap.
        self.deduplication.register_event(event)

        if sequence_result["safe_hold"]:
            return {
                "status": "SAFE_HOLD",
                "safe_hold": True,
                "reason": "Event sequence gap or conflict detected",
                "validation": validation,
                "sequence": sequence_result,
                "staleness": staleness_result,
                "application_status": application_status
            }

        # 7. Event Intake accepted.
        # This is NOT permission to send a message.
        return {
            "status": "ACCEPTED",
            "safe_hold": False,
            "reason": "Event passed all processing checks",
            "validation": validation,
            "sequence": sequence_result,
            "staleness": staleness_result,
            "application_status": application_status
        }

    def total_processed(self):
        return self.deduplication.total_processed()
