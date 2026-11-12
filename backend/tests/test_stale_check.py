
from datetime import datetime, timezone, timedelta

import pytest

from src.stale_check import check_staleness


def test_status_within_60_seconds_is_fresh():
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now - timedelta(seconds=30)).isoformat()

    result = check_staleness(status_time, now)

    assert result["fresh"] is True
    assert result["safe_hold"] is False


def test_status_exactly_60_seconds_is_fresh():
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now - timedelta(seconds=60)).isoformat()

    result = check_staleness(status_time, now)

    assert result["fresh"] is True
    assert result["safe_hold"] is False


def test_status_older_than_60_seconds_is_safe_hold():
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now - timedelta(seconds=61)).isoformat()

    result = check_staleness(status_time, now)

    assert result["fresh"] is False
    assert result["safe_hold"] is True


def test_missing_status_time_is_safe_hold():
    result = check_staleness(None)

    assert result["fresh"] is False
    assert result["safe_hold"] is True


def test_invalid_status_time_is_safe_hold():
    result = check_staleness("not-a-date")

    assert result["fresh"] is False
    assert result["safe_hold"] is True


def test_future_status_time_is_safe_hold():
    now = datetime(2026, 11, 12, 10, 0, 0, tzinfo=timezone.utc)
    status_time = (now + timedelta(seconds=10)).isoformat()

    result = check_staleness(status_time, now)

    assert result["fresh"] is False
    assert result["safe_hold"] is True


def test_timezone_is_required():
    result = check_staleness("2026-11-12T10:00:00")

    assert result["fresh"] is False
    assert result["safe_hold"] is True


def test_invalid_max_age_is_rejected():
    with pytest.raises(ValueError):
        check_staleness(
            "2026-11-12T10:00:00Z",
            max_age_seconds=0
        )
