
from src.event_validator import validate_event


def sample_event():
    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-001",
        "event_id": "EVENT-001",
        "event_type": "APPLICATION_STARTED",
        "source": "mobile_app",
        "schema_version": "1.0",
        "event_time": "2026-11-12T09:00:00Z",
        "ingestion_time": "2026-11-12T09:00:05Z",
        "sequence": 1
    }


def test_valid_event():
    event = sample_event()

    result = validate_event(event)

    assert result["valid"] is True
    assert result["errors"] == []


def test_missing_event_id():
    event = sample_event()
    del event["event_id"]

    result = validate_event(event)

    assert result["valid"] is False


def test_invalid_event_time():
    event = sample_event()
    event["event_time"] = "not-a-date"

    result = validate_event(event)

    assert result["valid"] is False


def test_empty_application_id():
    event = sample_event()
    event["application_id"] = ""

    result = validate_event(event)

    assert result["valid"] is False
def test_unknown_event_type():
    event = sample_event()
    event["event_type"] = "UNKNOWN_EVENT"

    result = validate_event(event)

    assert result["valid"] is False
    assert result["errors"][0]["field"] == "event_type"


def test_non_object_event():
    result = validate_event("not a JSON object")

    assert result["valid"] is False
def test_missing_sequence():
    event = sample_event()
    del event["sequence"]

    result = validate_event(event)

    assert result["valid"] is False
    assert any(
        error["field"] == "sequence"
        for error in result["errors"]
    )


def test_sequence_zero_is_rejected():
    event = sample_event()
    event["sequence"] = 0

    result = validate_event(event)

    assert result["valid"] is False
    assert any(
        error["field"] == "sequence"
        for error in result["errors"]
    )