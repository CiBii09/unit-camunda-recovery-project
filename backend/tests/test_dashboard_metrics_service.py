from src.dashboard_metrics_service import DashboardMetricsService


def test_empty_metrics(tmp_path):
    metrics = DashboardMetricsService(
        db_path=tmp_path / "empty_metrics.db"
    )

    result = metrics.get_metrics()

    assert result == {
        "total_events": 0,
        "total_safe_holds": 0,
        "stale_data_count": 0,
        "sequence_gaps": 0,
        "validation_errors": 0,
        "system_status": "healthy",
    }


def test_record_safe_hold_and_stale_metrics(tmp_path):
    metrics = DashboardMetricsService(
        db_path=tmp_path / "stale_metrics.db"
    )

    metrics.record_event_result({
        "status": "SAFE_HOLD",
        "validation": {"valid": True},
        "staleness": {"safe_hold": True},
        "sequence": None,
    })

    result = metrics.get_metrics()

    assert result["total_events"] == 1
    assert result["total_safe_holds"] == 1
    assert result["stale_data_count"] == 1
    assert result["sequence_gaps"] == 0
    assert result["validation_errors"] == 0


def test_record_sequence_gap_metrics(tmp_path):
    metrics = DashboardMetricsService(
        db_path=tmp_path / "sequence_metrics.db"
    )

    metrics.record_event_result({
        "status": "SAFE_HOLD",
        "validation": {"valid": True},
        "staleness": {"safe_hold": False},
        "sequence": {"safe_hold": True},
    })

    result = metrics.get_metrics()

    assert result["total_safe_holds"] == 1
    assert result["sequence_gaps"] == 1
    assert result["stale_data_count"] == 0


def test_record_validation_error_metrics(tmp_path):
    metrics = DashboardMetricsService(
        db_path=tmp_path / "validation_metrics.db"
    )

    metrics.record_event_result({
        "status": "REJECTED",
        "validation": {"valid": False},
        "staleness": None,
        "sequence": None,
    })

    result = metrics.get_metrics()

    assert result["validation_errors"] == 1
    assert result["total_safe_holds"] == 0


def test_metrics_persist_after_service_restart(tmp_path):
    db_path = tmp_path / "persistent_metrics.db"

    first_service = DashboardMetricsService(db_path=db_path)

    first_service.record_event_result({
        "status": "SAFE_HOLD",
        "validation": {"valid": True},
        "staleness": {"safe_hold": True},
        "sequence": None,
    })

    second_service = DashboardMetricsService(db_path=db_path)

    result = second_service.get_metrics()

    assert result["total_events"] == 1
    assert result["total_safe_holds"] == 1
    assert result["stale_data_count"] == 1


def test_metrics_reject_invalid_result(tmp_path):
    metrics = DashboardMetricsService(
        db_path=tmp_path / "invalid_metrics.db"
    )

    import pytest

    with pytest.raises(ValueError):
        metrics.record_event_result(None)
