from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

from src.event_processor import EventProcessor


def sample_event(event_id="EVENT-001", sequence=1, application_id="APPLICATION-001"):
    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": application_id,
        "event_id": event_id,
        "event_type": "APPLICATION_STARTED",
        "source": "mobile_app",
        "schema_version": "1.0",
        "event_time": "2026-11-12T09:00:00Z",
        "ingestion_time": "2026-11-12T09:00:05Z",
        "sequence": sequence,
    }


def test_concurrent_same_event_id_is_processed_only_once():
    processor = EventProcessor()

    worker_count = 32
    barrier = Barrier(worker_count)
    event = sample_event()
    now = datetime.now(timezone.utc)
    fresh_status_time = now.isoformat()

    def process_same_event(_):
        barrier.wait()
        return processor.process_event(
            event,
            status_time=fresh_status_time,
            now=now,
        )

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(process_same_event, range(worker_count)))

    statuses = [result["status"] for result in results]

    assert statuses.count("ACCEPTED") == 1
    assert statuses.count("DUPLICATE") == worker_count - 1
    assert processor.total_processed() == 1


def test_concurrent_different_event_ids_can_all_be_processed():
    processor = EventProcessor()

    worker_count = 100
    barrier = Barrier(worker_count)
    status_time = datetime.now(timezone.utc).isoformat()

    events = [
        sample_event(
            event_id=f"EVENT-{index:03d}",
            sequence=1,
            application_id=f"APPLICATION-{index:03d}",
        )
        for index in range(worker_count)
    ]

    def process_event(event):
        barrier.wait()
        return processor.process_event(
            event,
            status_time=status_time,
        )

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        results = list(executor.map(process_event, events))

    assert all(result["status"] == "ACCEPTED" for result in results)
    assert processor.total_processed() == worker_count


def test_safe_hold_event_can_be_retried_after_status_refresh():
    processor = EventProcessor()

    event = sample_event()
    now = datetime.now(timezone.utc)

    stale_status_time = (
        now - timedelta(seconds=61)
    ).isoformat()

    fresh_status_time = (
        now - timedelta(seconds=10)
    ).isoformat()

    first_result = processor.process_event(
        event,
        status_time=stale_status_time,
        now=now,
    )

    assert first_result["status"] == "SAFE_HOLD"
    assert processor.total_processed() == 0

    second_result = processor.process_event(
        event,
        status_time=fresh_status_time,
        now=now,
    )

    assert second_result["status"] == "ACCEPTED"
    assert processor.total_processed() == 1
