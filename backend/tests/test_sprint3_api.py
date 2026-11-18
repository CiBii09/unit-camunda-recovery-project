import pytest
from fastapi.testclient import TestClient

from src import api
from src.dashboard_metrics_service import DashboardMetricsService
from src.help_queue_service import HelpQueueService


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(
        api,
        "help_queue_service",
        HelpQueueService(tmp_path / "help_queue_test.db"),
    )
    monkeypatch.setattr(
        api,
        "dashboard_metrics_service",
        DashboardMetricsService(tmp_path / "metrics_test.db"),
    )

    return TestClient(api.app)


def sample_event():
    return {
        "event_id": "SPRINT3_EVENT_001",
        "event_type": "APPLICATION_STARTED",
        "bank": "BANK_A",
        "applicant_key": "APP_SPRINT3_001",
        "application_id": "APPLICATION_SPRINT3_001",
        "source": "MOCK_SYSTEM",
        "schema_version": "1.0",
        "event_time": "2026-11-18T10:00:00Z",
        "ingestion_time": "2026-11-18T10:00:05Z",
        "sequence": 1,
    }


def sample_safe_hold_result():
    return {
        "status": "SAFE_HOLD",
        "reason": "Application status is stale",
        "validation": {"valid": True},
        "staleness": {"safe_hold": True},
        "sequence": None,
        "application_status": None,
    }


def create_test_task():
    return api.help_queue_service.create_task(
        sample_event(),
        sample_safe_hold_result(),
    )


def test_dashboard_metrics_endpoint(client):
    api.dashboard_metrics_service.record_event_result(
        sample_safe_hold_result()
    )

    response = client.get("/api/metrics")

    assert response.status_code == 200

    data = response.json()
    assert data["total_events"] == 1
    assert data["total_safe_holds"] == 1
    assert data["stale_data_count"] == 1
    assert data["system_status"] == "healthy"


def test_help_queue_endpoint_returns_open_tasks(client):
    create_test_task()

    response = client.get("/api/help-queue")

    assert response.status_code == 200

    data = response.json()
    assert data["count"] == 1
    assert len(data["tasks"]) == 1
    assert data["tasks"][0]["status"] == "OPEN"
    assert data["tasks"][0]["event_type"] == "APPLICATION_STARTED"
    assert "age_seconds" in data["tasks"][0]


def test_help_queue_does_not_expose_applicant_identity(client):
    create_test_task()

    response = client.get("/api/help-queue")

    task = response.json()["tasks"][0]

    assert "applicant_key" not in task
    assert "application_id" not in task
    assert "event_json" not in task


def test_cancel_task_updates_status(client):
    task = create_test_task()

    response = client.post(
        f"/api/tasks/{task['id']}/resolve",
        json={
            "action": "CANCEL",
            "note": "Đã kiểm tra và hủy xử lý.",
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["resolved"] is True
    assert data["task"]["status"] == "CANCELLED"
    assert data["task"]["id"] == task["id"]


def test_retry_task_resolves_when_event_is_accepted(
    client,
    monkeypatch,
):
    task = create_test_task()

    class FakeEventProcessor:
        def process_event(self, event):
            return {
                "status": "ACCEPTED",
                "reason": "Event accepted",
                "validation": {"valid": True},
                "staleness": {"safe_hold": False},
                "sequence": {"safe_hold": False},
            }

    monkeypatch.setattr(
        api,
        "event_processor",
        FakeEventProcessor(),
    )

    response = client.post(
        f"/api/tasks/{task['id']}/resolve",
        json={
            "action": "RETRY",
            "note": "Dữ liệu đã được cập nhật.",
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["resolved"] is True
    assert data["retry_result"]["status"] == "ACCEPTED"
    assert data["task"]["status"] == "RESOLVED"


def test_resolve_unknown_task_returns_404(client):
    response = client.post(
        "/api/tasks/unknown-task-id/resolve",
        json={"action": "CANCEL", "note": "Test"},
    )

    assert response.status_code == 404


def test_invalid_resolve_action_returns_422(client):
    task = create_test_task()

    response = client.post(
        f"/api/tasks/{task['id']}/resolve",
        json={"action": "DELETE", "note": "Invalid action"},
    )

    assert response.status_code == 422


def test_cors_allows_react_frontend(client):
    response = client.options(
        "/api/metrics",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert (
        response.headers.get("access-control-allow-origin")
        == "http://localhost:5173"
    )


def test_safe_hold_event_creates_metrics_and_help_queue_task(
    client,
    monkeypatch,
):
    class FakeEventProcessor:
        def process_event(self, event):
            return sample_safe_hold_result()

    monkeypatch.setattr(
        api,
        "event_processor",
        FakeEventProcessor(),
    )

    response = client.post("/events", json=sample_event())

    assert response.status_code == 200
    assert response.json()["status"] == "SAFE_HOLD"

    metrics = client.get("/api/metrics").json()
    queue = client.get("/api/help-queue").json()

    assert metrics["total_events"] == 1
    assert metrics["total_safe_holds"] == 1
    assert queue["count"] == 1
