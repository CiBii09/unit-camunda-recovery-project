from datetime import datetime, timedelta, timezone

import pytest

from src.application_status import ApplicationStatusProvider
from src.experiment_service import ExperimentService, holdout


SECRET = b"test-secret-for-experiment-service-32-bytes"


def make_service(tmp_path, status="STARTED", updated_at=None):
    now = datetime.now(timezone.utc)
    provider = ApplicationStatusProvider()
    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": "APP_TEST",
        "application_id": "APPLICATION_TEST",
        "status": status,
        "updated_at": (updated_at or now).isoformat(),
        "version": 1,
    })

    service = ExperimentService(
        status_provider=provider,
        db_path=tmp_path / "experiment.db",
        secret=SECRET,
    )
    return service, provider, now


def key_for_arm(service, arm):
    for index in range(10000):
        key = f"APP_{index}"
        bucket = holdout.hash_bucket(key, secret=service.secret)
        if holdout.arm_from_bucket(bucket) == arm:
            return key
    raise AssertionError(f"Could not find applicant key for {arm}")


def test_eligible_status_gets_stable_assignment(tmp_path):
    service, provider, now = make_service(tmp_path)

    first = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_TEST", now
    )

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": "APP_TEST",
        "application_id": "APPLICATION_SECOND",
        "status": "PROGRESSING",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    second = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_SECOND", now
    )

    assert first["status"] == "ASSIGNED"
    assert second["status"] == "ASSIGNED"
    assert first["assignment"]["arm"] == second["assignment"]["arm"]
    assert first["assignment"]["index_application_id"] == "APPLICATION_TEST"
    assert second["assignment"]["index_application_id"] == "APPLICATION_TEST"


@pytest.mark.parametrize(
    "status",
    ["COMPLETED", "REJECTED", "WITHDRAWN", "EXPIRED", "BLOCKED"],
)
def test_terminal_status_is_not_assigned(tmp_path, status):
    service, _, now = make_service(tmp_path, status=status)

    result = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_TEST", now
    )

    assert result["status"] == "NOT_ELIGIBLE"
    assert result["assigned"] is False


def test_stale_status_fails_closed(tmp_path):
    stale_time = datetime.now(timezone.utc) - timedelta(minutes=5)
    service, _, now = make_service(tmp_path, updated_at=stale_time)

    result = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_TEST", now
    )

    assert result["status"] == "SAFE_HOLD"
    assert result["assigned"] is False


def test_missing_status_fails_closed(tmp_path):
    service, _, now = make_service(tmp_path)

    result = service.assign_if_eligible(
        "BANK_A", "UNKNOWN", "APPLICATION_UNKNOWN", now
    )

    assert result["status"] == "SAFE_HOLD"
    assert result["assigned"] is False


def test_control_is_blocked_before_next_gates(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "CONTROL")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )
    assert assignment["assignment"]["arm"] == "CONTROL"

    decision = service.check_before_dispatch(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    assert decision["allowed_for_next_gates"] is False
    assert decision["reason"] == "BLOCK_CONTROL_HOLDOUT"


def test_treatment_passes_only_holdout_gate(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "TREATMENT")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "PROGRESSING",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )
    assert assignment["assignment"]["arm"] == "TREATMENT"

    decision = service.check_before_dispatch(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    assert decision["allowed_for_next_gates"] is True
    assert decision["reason"] == "ALLOW_PASS_TO_NEXT_GATES"


def test_treatment_with_suppression_is_blocked(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "TREATMENT")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    conn = holdout.connect(str(service.db_path))
    try:
        holdout.add_suppression(
            conn,
            applicant_key,
            reason="OPT_OUT",
            source="TEST",
            now=now.replace(tzinfo=None),
        )
    finally:
        conn.close()

    decision = service.check_before_dispatch(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    assert decision["allowed_for_next_gates"] is False
    assert "BLOCK_SUPPRESSED" in decision["reason"]


def test_short_secret_is_rejected(tmp_path):
    provider = ApplicationStatusProvider()

    with pytest.raises(ValueError):
        ExperimentService(
            status_provider=provider,
            db_path=tmp_path / "experiment.db",
            secret=b"short",
        )

def test_assignment_ref_is_stable_across_applications(tmp_path):
    service, provider, now = make_service(tmp_path)

    first = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_TEST", now
    )

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": "APP_TEST",
        "application_id": "APPLICATION_SECOND",
        "status": "PROGRESSING",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    second = service.assign_if_eligible(
        "BANK_A", "APP_TEST", "APPLICATION_SECOND", now
    )

    assert first["assigned"] is True
    assert second["assigned"] is True

    first_ref = first["assignment"]["assignment_ref"]
    second_ref = second["assignment"]["assignment_ref"]

    assert isinstance(first_ref, str)
    assert len(first_ref) >= 32
    assert first_ref == second_ref


def test_dispatch_by_ref_allows_treatment(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "TREATMENT")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    result = service.check_before_dispatch_by_ref(
        assignment["assignment"]["assignment_ref"],
        "BANK_A",
        "APPLICATION_TEST",
        now,
    )

    assert result["allowed_for_next_gates"] is True
    assert result["reason"] == "ALLOW_PASS_TO_NEXT_GATES"


def test_dispatch_by_ref_blocks_control(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "CONTROL")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    result = service.check_before_dispatch_by_ref(
        assignment["assignment"]["assignment_ref"],
        "BANK_A",
        "APPLICATION_TEST",
        now,
    )

    assert result["allowed_for_next_gates"] is False
    assert result["reason"] == "BLOCK_CONTROL_HOLDOUT"


def test_dispatch_by_ref_rejects_unknown_reference(tmp_path):
    service, _, now = make_service(tmp_path)

    result = service.check_before_dispatch_by_ref(
        "UNKNOWN_REFERENCE",
        "BANK_A",
        "APPLICATION_TEST",
        now,
    )

    assert result["allowed_for_next_gates"] is False
    assert result["reason"] == "BLOCK_UNKNOWN_ASSIGNMENT_REF"


def test_dispatch_by_ref_rejects_bank_mismatch(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "TREATMENT")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    result = service.check_before_dispatch_by_ref(
        assignment["assignment"]["assignment_ref"],
        "BANK_B",
        "APPLICATION_TEST",
        now,
    )

    assert result["allowed_for_next_gates"] is False
    assert result["reason"] == "BLOCK_ASSIGNMENT_BANK_MISMATCH"


def test_dispatch_by_ref_rechecks_current_application(tmp_path):
    service, provider, now = make_service(tmp_path)
    applicant_key = key_for_arm(service, "TREATMENT")

    provider.update_status({
        "bank": "BANK_A",
        "applicant_key": applicant_key,
        "application_id": "APPLICATION_TEST",
        "status": "STARTED",
        "updated_at": now.isoformat(),
        "version": 1,
    })

    assignment = service.assign_if_eligible(
        "BANK_A", applicant_key, "APPLICATION_TEST", now
    )

    result = service.check_before_dispatch_by_ref(
        assignment["assignment"]["assignment_ref"],
        "BANK_A",
        "APPLICATION_DIFFERENT",
        now,
    )

    assert result["allowed_for_next_gates"] is False
    assert result["reason"] == "BLOCK_STATUS_UNAVAILABLE"
