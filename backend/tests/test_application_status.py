from datetime import datetime, timedelta, timezone

import pytest

from src.application_status import (
    AUTHORITATIVE_STATUSES,
    ApplicationStatusProvider,
)


NOW = datetime(2026, 11, 13, 15, 0, 0, tzinfo=timezone.utc)


def sample_record(status="AWAITING_APPLICANT", updated_at=None, version=1):
    if updated_at is None:
        updated_at = NOW.isoformat()

    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-001",
        "status": status,
        "updated_at": updated_at,
        "version": version,
    }


def create_provider(record=None):
    provider = ApplicationStatusProvider()

    if record is not None:
        provider.update_status(record)

    return provider


def test_all_authoritative_statuses_are_defined():
    assert len(AUTHORITATIVE_STATUSES) == 9


def test_update_and_get_application_status():
    provider = create_provider(sample_record())

    result = provider.get_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
    )

    assert result["status"] == "AWAITING_APPLICANT"
    assert result["version"] == 1


def test_fresh_status_is_available():
    provider = create_provider(sample_record())

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is True
    assert result["safe_hold"] is False
    assert result["age_seconds"] == 0


def test_status_at_exactly_60_seconds_is_fresh():
    record = sample_record(
        updated_at=(NOW - timedelta(seconds=60)).isoformat()
    )
    provider = create_provider(record)

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is True
    assert result["safe_hold"] is False


def test_status_older_than_60_seconds_is_safe_hold():
    record = sample_record(
        updated_at=(NOW - timedelta(seconds=61)).isoformat()
    )
    provider = create_provider(record)

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is False
    assert result["safe_hold"] is True
    assert result["reason"] == "Application status is stale"


def test_missing_application_status_is_safe_hold():
    provider = ApplicationStatusProvider()

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is False
    assert result["safe_hold"] is True
    assert result["reason"] == "Application status not found"


def test_future_status_timestamp_is_safe_hold():
    record = sample_record(
        updated_at=(NOW + timedelta(seconds=10)).isoformat()
    )
    provider = create_provider(record)

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is False
    assert result["safe_hold"] is True


def test_invalid_status_is_rejected_when_updating():
    provider = ApplicationStatusProvider()

    with pytest.raises(ValueError):
        provider.update_status(sample_record(status="UNKNOWN_STATUS"))


def test_status_version_must_increase():
    provider = create_provider(sample_record(version=2))

    with pytest.raises(ValueError):
        provider.update_status(sample_record(version=2))


def test_status_without_timezone_is_rejected():
    provider = ApplicationStatusProvider()

    with pytest.raises(ValueError):
        provider.update_status(
            sample_record(updated_at="2026-11-13T15:00:00")
        )


def test_unknown_status_in_stored_record_causes_safe_hold():
    provider = create_provider(sample_record())

    key = ("BANK001", "APP-USER-001", "APPLICATION-001")
    provider.records[key]["status"] = "UNKNOWN_STATUS"

    result = provider.check_status(
        "BANK001",
        "APP-USER-001",
        "APPLICATION-001",
        now=NOW,
    )

    assert result["available"] is False
    assert result["safe_hold"] is True
