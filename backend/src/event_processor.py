
from src.event_validator import validate_event
from src.deduplication import Deduplication
from src.event_sequence import EventSequenceTracker
from src.stale_check import check_staleness


class EventProcessor:
    """
    Module tích hợp xử lý Event.

    Quy trình:
    1. Validate event.
    2. Kiểm tra event trùng lặp.
    3. Kiểm tra độ mới của dữ liệu trạng thái.
    4. Kiểm tra sequence.
    5. Đăng ký event đã được tiếp nhận.

    Event không đủ điều kiện sẽ được đưa vào SAFE_HOLD.
    """

    def __init__(self):
        self.deduplication = Deduplication()
        self.sequence_tracker = EventSequenceTracker()

    def process_event(
        self,
        event,
        status_time=None,
        now=None,
        max_age_seconds=60
    ):
        # 1. Validate dữ liệu đầu vào
        validation = validate_event(event)

        if not validation["valid"]:
            return {
                "status": "REJECTED",
                "safe_hold": True,
                "reason": "Event validation failed",
                "validation": validation,
                "sequence": None,
                "staleness": None
            }

        # 2. Kiểm tra event_id đã được xử lý chưa
        if self.deduplication.is_duplicate(event):
            return {
                "status": "DUPLICATE",
                "safe_hold": False,
                "reason": "Event has already been processed",
                "validation": validation,
                "sequence": None,
                "staleness": None
            }

        # 3. Kiểm tra độ mới của dữ liệu trạng thái
        # Chỉ sử dụng thời điểm kiểm tra trạng thái có thẩm quyền.
        # Không thay bằng event_time hoặc ingestion_time.
        staleness_result = check_staleness(
            status_time,
            now=now,
            max_age_seconds=max_age_seconds
        )

        # 4. Nếu dữ liệu cũ hoặc không xác định:
        # SAFE_HOLD và KHÔNG ghi nhận event vào dedup/sequence.
        # Cho phép đánh giá lại cùng event sau khi dữ liệu được làm mới.
        if staleness_result["safe_hold"]:
            return {
                "status": "SAFE_HOLD",
                "safe_hold": True,
                "reason": staleness_result["reason"],
                "validation": validation,
                "sequence": None,
                "staleness": staleness_result
            }

        # 5. Kiểm tra thứ tự event
        sequence_result = self.sequence_tracker.process_event(event)

        # 6. Ghi nhận event sau khi đã qua kiểm tra freshness.
        # Event có sequence gap vẫn được ghi nhận để có thể
        # phát hiện và giải quyết gap khi event còn thiếu đến.
        self.deduplication.register_event(event)

        if sequence_result["safe_hold"]:
            return {
                "status": "SAFE_HOLD",
                "safe_hold": True,
                "reason": "Event sequence gap or conflict detected",
                "validation": validation,
                "sequence": sequence_result,
                "staleness": staleness_result
            }

        # 7. Event vượt qua các kiểm tra kỹ thuật.
        # ACCEPTED không đồng nghĩa với quyền gửi SMS.
        return {
            "status": "ACCEPTED",
            "safe_hold": False,
            "reason": "Event passed all processing checks",
            "validation": validation,
            "sequence": sequence_result,
            "staleness": staleness_result
        }

    def total_processed(self):
        return self.deduplication.total_processed()
