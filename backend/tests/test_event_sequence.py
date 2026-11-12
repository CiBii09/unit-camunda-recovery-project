
import pytest

from src.event_sequence import EventSequenceTracker


def make_event(sequence, application_id="APP001"):
    return {
        "bank": "BANK001",
        "applicant_key": "PERSON001",
        "application_id": application_id,
        "sequence": sequence,
    }


def test_events_arrive_in_order():
    tracker = EventSequenceTracker()

    for sequence in [1, 2, 3]:
        result = tracker.process_event(make_event(sequence))
        assert result["status"] == "IN_ORDER"

    assert result["contiguous_sequence"] == 3


def test_detect_missing_sequence():
    tracker = EventSequenceTracker()

    tracker.process_event(make_event(1))
    result = tracker.process_event(make_event(3))

    assert result["status"] == "GAP_DETECTED"
    assert result["safe_hold"] is True
    assert result["missing_sequences"] == [2]


def test_late_event_resolves_gap():
    tracker = EventSequenceTracker()

    tracker.process_event(make_event(1))
    tracker.process_event(make_event(3))

    result = tracker.process_event(make_event(2))

    assert result["status"] == "GAP_RESOLVED"
    assert result["safe_hold"] is False
    assert result["contiguous_sequence"] == 3


def test_duplicate_sequence_is_detected():
    tracker = EventSequenceTracker()

    tracker.process_event(make_event(1))
    result = tracker.process_event(make_event(1))

    assert result["status"] == "DUPLICATE_SEQUENCE"
    assert result["safe_hold"] is True


def test_applications_are_tracked_separately():
    tracker = EventSequenceTracker()

    tracker.process_event(make_event(1, "APP001"))
    result = tracker.process_event(make_event(1, "APP002"))

    assert result["status"] == "IN_ORDER"


def test_invalid_sequence_is_rejected():
    tracker = EventSequenceTracker()

    with pytest.raises(ValueError):
        tracker.process_event(make_event(0))

    with pytest.raises(ValueError):
        tracker.process_event(make_event("2"))


def test_missing_required_field_is_rejected():
    tracker = EventSequenceTracker()

    with pytest.raises(ValueError):
        tracker.process_event({
            "application_id": "APP001",
            "sequence": 1,
        })

def test_multiple_gaps_remain_safe_hold_until_all_are_resolved():
    tracker = EventSequenceTracker()

    tracker.process_event(make_event(1))

    result = tracker.process_event(make_event(3))
    assert result["safe_hold"] is True
    assert result["missing_sequences"] == [2]

    result = tracker.process_event(make_event(5))
    assert result["safe_hold"] is True
    assert result["missing_sequences"] == [2, 4]

    result = tracker.process_event(make_event(2))
    assert result["safe_hold"] is True
    assert result["missing_sequences"] == [4]

    result = tracker.process_event(make_event(4))
    assert result["status"] == "GAP_RESOLVED"
    assert result["safe_hold"] is False
    assert result["missing_sequences"] == []
    assert result["contiguous_sequence"] == 5

