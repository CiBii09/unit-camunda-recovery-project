
import pytest

from src.deduplication import Deduplication


def test_first_event_is_registered():
    dedup = Deduplication()

    event = {"event_id": "EVT-001"}

    assert dedup.register_event(event) is True


def test_duplicate_event_is_rejected():
    dedup = Deduplication()

    event = {"event_id": "EVT-001"}

    assert dedup.register_event(event) is True
    assert dedup.register_event(event) is False


def test_different_events_are_accepted():
    dedup = Deduplication()

    event_1 = {"event_id": "EVT-001"}
    event_2 = {"event_id": "EVT-002"}

    assert dedup.register_event(event_1) is True
    assert dedup.register_event(event_2) is True


def test_missing_event_id_is_rejected():
    dedup = Deduplication()

    with pytest.raises(ValueError):
        dedup.register_event({})


def test_total_processed_events():
    dedup = Deduplication()

    dedup.register_event({"event_id": "EVT-001"})
    dedup.register_event({"event_id": "EVT-002"})
    dedup.register_event({"event_id": "EVT-001"})

    assert dedup.total_processed() == 2
