
from datetime import datetime, timedelta, timezone

from src.event_processor import EventProcessor


def sample_event(event_id="EVENT-001", sequence=1):
    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-001",
        "event_id": event_id,
        "event_type": "APPLICATION_STARTED",
        "source": "mobile_app",
        "schema_version": "1.0",
        "event_time": "2026-11-12T09:00:00Z",
        "ingestion_time": "2026-11-12T09:00:05Z",
        "sequence": sequence
    }


def test_valid_event_is_accepted():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)

    result = processor.process_event(
        sample_event(),
        status_time=(now - timedelta(seconds=30)).isoformat(),
        now=now
    )

    assert result["status"] == "ACCEPTED"
    assert result["safe_hold"] is False


def test_duplicate_event_is_detected():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now - timedelta(seconds=30)).isoformat()

    first_result = processor.process_event(
        sample_event(),
        status_time=status_time,
        now=now
    )

    second_result = processor.process_event(
        sample_event(),
        status_time=status_time,
        now=now
    )

    assert first_result["status"] == "ACCEPTED"
    assert second_result["status"] == "DUPLICATE"


def test_invalid_event_is_rejected():
    processor = EventProcessor()
    event = sample_event()
    del event["event_id"]

    result = processor.process_event(event)

    assert result["status"] == "REJECTED"
    assert result["safe_hold"] is True


def test_sequence_gap_causes_safe_hold():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now - timedelta(seconds=30)).isoformat()

    first_result = processor.process_event(
        sample_event("EVENT-001", 1),
        status_time=status_time,
        now=now
    )

    second_result = processor.process_event(
        sample_event("EVENT-003", 3),
        status_time=status_time,
        now=now
    )

    assert first_result["status"] == "ACCEPTED"
    assert second_result["status"] == "SAFE_HOLD"
    assert second_result["sequence"]["missing_sequences"] == [2]


def test_stale_status_causes_safe_hold():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)

    result = processor.process_event(
        sample_event(),
        status_time=(now - timedelta(seconds=61)).isoformat(),
        now=now
    )

    assert result["status"] == "SAFE_HOLD"
    assert result["staleness"]["fresh"] is False


def test_missing_status_time_causes_safe_hold():
    processor = EventProcessor()

    result = processor.process_event(
        sample_event(),
        status_time=None
    )

    assert result["status"] == "SAFE_HOLD"
    assert result["staleness"]["safe_hold"] is True


def test_status_at_exactly_60_seconds_is_fresh():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)

    result = processor.process_event(
        sample_event(),
        status_time=(now - timedelta(seconds=60)).isoformat(),
        now=now
    )

    assert result["status"] == "ACCEPTED"
    assert result["staleness"]["fresh"] is True
def test_safe_hold_event_can_be_reprocessed_after_status_refresh():
    processor = EventProcessor()
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)

    event = sample_event()

    # Lần đầu: dữ liệu trạng thái đã cũ 61 giây
    first_result = processor.process_event(
        event,
        status_time=(now - timedelta(seconds=61)).isoformat(),
        now=now
    )

    assert first_result["status"] == "SAFE_HOLD"
    assert processor.total_processed() == 0

    # Lần hai: cùng event, nhưng trạng thái đã được cập nhật
    second_result = processor.process_event(
        event,
        status_time=(now - timedelta(seconds=30)).isoformat(),
        now=now
    )

    assert second_result["status"] == "ACCEPTED"
    assert second_result["safe_hold"] is False
    assert processor.total_processed() == 1
