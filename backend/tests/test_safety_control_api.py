import pytest
from fastapi.testclient import TestClient

from src import api
from src.safety_control_service import SafetyControlService


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(
        api,
        "safety_control_service",
        SafetyControlService(tmp_path / "safety_controls_test.db"),
    )
    return TestClient(api.app)


def test_safety_state_persists_and_kill_switch_forces_queue_pause(client):
    enabled = client.post(
        "/api/v1/safety/kill-switch",
        json={
            "enabled": True,
            "reason": "Gateway error threshold exceeded",
            "operatorId": "operator-1",
        },
    )

    assert enabled.status_code == 200
    assert enabled.json()["killSwitchActive"] is True
    assert enabled.json()["queuePaused"] is True
    persisted_service = SafetyControlService(api.safety_control_service.db_path)
    persisted_status = persisted_service.get_status()
    assert persisted_status["killSwitchActive"] is True
    assert persisted_status["queuePaused"] is True

    resumed = client.post(
        "/api/v1/safety/queue-pause",
        json={
            "paused": False,
            "reason": "Attempt to resume while kill-switch is active",
            "operatorId": "operator-1",
        },
    )

    assert resumed.status_code == 200
    assert resumed.json()["queuePaused"] is True
    assert client.get("/api/v1/safety/status").json()["killSwitchActive"] is True

    reset = client.post(
        "/api/v1/safety/kill-switch",
        json={
            "enabled": False,
            "reason": "Controlled reset",
            "operatorId": "operator-1",
        },
    )

    assert reset.status_code == 200
    assert reset.json()["killSwitchActive"] is False
    assert reset.json()["queuePaused"] is True

    queue_resumed = client.post(
        "/api/v1/safety/queue-pause",
        json={
            "paused": False,
            "reason": "Resume after reset",
            "operatorId": "operator-1",
        },
    )
    assert queue_resumed.json()["queuePaused"] is False


def test_safety_control_changes_are_audited(client):
    response = client.post(
        "/api/v1/safety/queue-pause",
        json={
            "paused": True,
            "reason": "Pause for reconciliation",
            "operatorId": "operator-2",
        },
    )

    audit = client.get("/api/v1/safety/audit-logs")

    assert response.status_code == 200
    assert audit.status_code == 200
    assert audit.json()["total"] == 1
    assert audit.json()["logs"][0]["auditLogId"] == response.json()["auditLogId"]
    assert audit.json()["logs"][0]["actionType"] == "QUEUE_PAUSED"


def test_safety_control_rejects_missing_or_invalid_fields(client):
    response = client.post(
        "/api/v1/safety/kill-switch",
        json={"enabled": True, "reason": "Emergency"},
    )

    assert response.status_code == 422
