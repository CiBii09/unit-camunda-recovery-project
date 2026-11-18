from datetime import datetime, timezone

import pytest

from src.help_queue_service import HelpQueueService


@pytest.fixture
def service(tmp_path):
    db_path = tmp_path / "help_queue_test.db"
    return HelpQueueService(db_path=db_path)


@pytest.fixture
def safe_hold_event():
    return {
        "event_id": "EVT-001",
        "event_type": "application_started",
        "bank": "TEST_BANK",
        "applicant_key": "PRIVATE-APPLICANT-001",
        "application_id": "APP-001",
        "sequence": 1,
    }


@pytest.fixture
def safe_hold_result():
    return {
        "status": "SAFE_HOLD",
        "reason": "Application status data is stale",
        "application_status": {
            "record": {
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
    }


def test_create_safe_hold_task(service, safe_hold_event, safe_hold_result):
    task = service.create_task(safe_hold_event, safe_hold_result)

    assert task["id"]
    assert task["opaqueRef"].startswith("REF-")
    assert task["event_type"] == "application_started"
    assert task["status"] == "OPEN"
    assert task["updated_at"]
    assert task["data_updated_at"]
    assert task["age_seconds"] is not None


def test_public_task_does_not_expose_private_event_data(
    service, safe_hold_event, safe_hold_result
):
    task = service.create_task(safe_hold_event, safe_hold_result)

    serialized_task = str(task)

    assert "PRIVATE-APPLICANT-001" not in serialized_task
    assert "applicant_key" not in task
    assert "event_json" not in task
    assert "event" not in task


def test_duplicate_event_returns_existing_task(
    service, safe_hold_event, safe_hold_result
):
    first = service.create_task(safe_hold_event, safe_hold_result)
    second = service.create_task(safe_hold_event, safe_hold_result)

    assert first["id"] == second["id"]
    assert first["opaqueRef"] == second["opaqueRef"]
    assert len(service.list_tasks()) == 1


def test_create_task_rejects_non_safe_hold_result(
    service, safe_hold_event
):
    with pytest.raises(ValueError, match="Only SAFE_HOLD"):
        service.create_task(
            safe_hold_event,
            {"status": "ACCEPTED"},
        )


def test_cancel_task_updates_status(
    service, safe_hold_event, safe_hold_result
):
    task = service.create_task(safe_hold_event, safe_hold_result)

    result = service.resolve_task(
        task["id"],
        action="CANCEL",
        note="Staff confirmed cancellation",
    )

    assert result["resolved"] is True
    assert result["task"]["status"] == "CANCELLED"

    repeated = service.resolve_task(
        task["id"],
        action="CANCEL",
        note="Repeated cancellation",
    )

    assert repeated["resolved"] is False
    assert repeated["task"]["status"] == "CANCELLED"


def test_retry_accepted_resolves_task(
    service, safe_hold_event, safe_hold_result
):
    task = service.create_task(safe_hold_event, safe_hold_result)

    def retry_handler(event):
        assert event["event_id"] == "EVT-001"
        return {
            "status": "ACCEPTED",
            "reason": "Event accepted after retry",
        }

    result = service.resolve_task(
        task["id"],
        action="RETRY",
        note="Data checked by staff",
        retry_handler=retry_handler,
    )

    assert result["resolved"] is True
    assert result["task"]["status"] == "RESOLVED"
    assert result["retry_result"]["status"] == "ACCEPTED"


@pytest.mark.parametrize(
    "retry_status",
    ["SAFE_HOLD", "DUPLICATE", "REJECTED"],
)
def test_retry_unsuccessful_keeps_task_open(
    service, safe_hold_event, safe_hold_result, retry_status
):
    task = service.create_task(safe_hold_event, safe_hold_result)

    result = service.resolve_task(
        task["id"],
        action="RETRY",
        retry_handler=lambda event: {
            "status": retry_status,
            "reason": "Retry did not succeed",
        },
    )

    assert result["resolved"] is False
    assert result["task"]["status"] == "OPEN"


def test_list_tasks_can_filter_by_status(
    service, safe_hold_event, safe_hold_result
):
    task = service.create_task(safe_hold_event, safe_hold_result)

    assert len(service.list_tasks(status="OPEN")) == 1

    service.resolve_task(
        task["id"],
        action="CANCEL",
        note="Cancelled for test",
    )

    assert service.list_tasks(status="OPEN") == []
    assert len(service.list_tasks(status="CANCELLED")) == 1
    assert len(service.list_tasks(status=None)) == 1


def test_resolve_unknown_task_returns_none(service):
    result = service.resolve_task(
        "unknown-task-id",
        action="CANCEL",
    )

    assert result is None
