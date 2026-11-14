
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


from datetime import datetime, timezone

from src.api import get_experiment_service
from src.application_status import ApplicationStatusProvider
from src.experiment_service import ExperimentService, holdout


def install_test_experiment_service(tmp_path, monkeypatch, arm):
    now = datetime.now(timezone.utc)
    provider = ApplicationStatusProvider()

    applicant_key = None

    for index in range(10000):
        candidate = f"API_TEST_{index}"
        bucket = holdout.hash_bucket(candidate, secret=API_TEST_SECRET)

        if holdout.arm_from_bucket(bucket) == arm:
            applicant_key = candidate
            break

    assert applicant_key is not None

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_API_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    service = ExperimentService(
        status_provider=provider,
        db_path=tmp_path / "api-experiment.db",
        secret=API_TEST_SECRET,
    )

    monkeypatch.setitem(
        app.dependency_overrides,
        get_experiment_service,
        lambda: service,
    )

    return service, applicant_key, now


API_TEST_SECRET = b"api-test-secret-at-least-32-bytes-long"


def test_experiment_assign_returns_only_opaque_reference(
    tmp_path, monkeypatch
):
    service, applicant_key, now = install_test_experiment_service(
        tmp_path, monkeypatch, "TREATMENT"
    )

    response = client.post(
        "/experiments/assign",
        json={
            "bank": "BANK_A",
            "applicant_key": applicant_key,
            "application_id": "APPLICATION_API_TEST",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "ASSIGNED"
    assert data["assigned"] is True
    assert isinstance(data["assignment_ref"], str)

    assert "applicant_key" not in data
    assert "arm" not in data
    assert "index_application_id" not in data
    assert "hash_bucket" not in data


def test_dispatch_check_allows_treatment(
    tmp_path, monkeypatch
):
    service, applicant_key, now = install_test_experiment_service(
        tmp_path, monkeypatch, "TREATMENT"
    )

    assignment = service.assign_if_eligible(
        "BANK_A",
        applicant_key,
        "APPLICATION_API_TEST",
        now,
    )

    response = client.post(
        "/experiments/dispatch-check",
        json={
            "assignment_ref": assignment["assignment"]["assignment_ref"],
            "bank": "BANK_A",
            "application_id": "APPLICATION_API_TEST",
        },
    )

    assert response.status_code == 200
    assert response.json()["allowed_for_next_gates"] is True
    assert response.json()["reason"] == "ALLOW_PASS_TO_NEXT_GATES"

    assert "applicant_key" not in response.json()
    assert "arm" not in response.json()


def test_dispatch_check_blocks_control(
    tmp_path, monkeypatch
):
    service, applicant_key, now = install_test_experiment_service(
        tmp_path, monkeypatch, "CONTROL"
    )

    assignment = service.assign_if_eligible(
        "BANK_A",
        applicant_key,
        "APPLICATION_API_TEST",
        now,
    )

    response = client.post(
        "/experiments/dispatch-check",
        json={
            "assignment_ref": assignment["assignment"]["assignment_ref"],
            "bank": "BANK_A",
            "application_id": "APPLICATION_API_TEST",
        },
    )

    assert response.status_code == 200
    assert response.json()["allowed_for_next_gates"] is False
    assert response.json()["reason"] == "BLOCK_CONTROL_HOLDOUT"


def test_dispatch_check_blocks_unknown_reference(
    tmp_path, monkeypatch
):
    install_test_experiment_service(
        tmp_path, monkeypatch, "TREATMENT"
    )

    response = client.post(
        "/experiments/dispatch-check",
        json={
            "assignment_ref": "UNKNOWN_REFERENCE",
            "bank": "BANK_A",
            "application_id": "APPLICATION_API_TEST",
        },
    )

    assert response.status_code == 200
    assert response.json()["allowed_for_next_gates"] is False
    assert response.json()["reason"] == "BLOCK_UNKNOWN_ASSIGNMENT_REF"


def test_experiment_assign_rejects_unexpected_fields(
    tmp_path, monkeypatch
):
    install_test_experiment_service(
        tmp_path, monkeypatch, "TREATMENT"
    )

    response = client.post(
        "/experiments/assign",
        json={
            "bank": "BANK_A",
            "applicant_key": "API_TEST_1",
            "application_id": "APPLICATION_API_TEST",
            "arm": "TREATMENT",
        },
    )

    assert response.status_code == 422

