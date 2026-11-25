from threading import Lock


class Deduplication:
    """
    Prototype phát hiện event trùng lặp bằng event_id.

    Lưu ý: dữ liệu hiện được lưu trong RAM.
    Khi triển khai thật cần thay bằng database
    có unique constraint và xử lý đồng thời.
    """

    def __init__(self):
        self.processed_events = set()
        self._lock = Lock()

    def is_duplicate(self, event):
        event_id = event.get("event_id")

        if not event_id or not isinstance(event_id, str):
            raise ValueError("event_id is required")

        with self._lock:
            return event_id in self.processed_events

    def register_event(self, event):
        event_id = event.get("event_id")

        if not event_id or not isinstance(event_id, str):
            raise ValueError("event_id is required")

        with self._lock:
            if event_id in self.processed_events:
                return False

            self.processed_events.add(event_id)
            return True

    def total_processed(self):
        with self._lock:
            return len(self.processed_events)
