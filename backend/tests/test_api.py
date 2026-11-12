
from fastapi.testclient import TestClient

from src.api import app


client = TestClient(app)


def valid_event():
    return {
        "bank": "BANK_A",
        "applicant_key": "APP_001",
        "application_id": "APPLICATION_001",
        "event_id": "EVENT_API_001",
        "event_type": "APPLICATION_STARTED",
        "source": "MOCK_SYSTEM",
        "schema_version": "1.0",
        "event_time": "2026-11-12T12:00:00Z",
        "ingestion_time": "2026-11-12T12:00:05Z",
        "sequence": 1
    }


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_valid_event_without_status_is_safe_hold():
    response = client.post("/events", json=valid_event())

    assert response.status_code == 200
    assert response.json()["status"] == "SAFE_HOLD"
    assert response.json()["safe_hold"] is True
    assert response.json()["validation"]["valid"] is True


def test_event_missing_bank_is_rejected():
    event = valid_event()
    del event["bank"]

    response = client.post("/events", json=event)

    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"
    assert response.json()["validation"]["valid"] is False


def test_unknown_event_type_is_rejected():
    event = valid_event()
    event["event_type"] = "UNKNOWN_EVENT"

    response = client.post("/events", json=event)

    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"


def test_non_object_request_returns_422():
    response = client.post("/events", json=["invalid", "event"])

    assert response.status_code == 422

