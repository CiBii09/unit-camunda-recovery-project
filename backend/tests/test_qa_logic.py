
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

from src.deduplication import Deduplication
from src.stale_check import check_staleness


CSV_PATH = (
    Path(__file__).resolve().parents[2]
    / "testing-data"
    / "person7_qa"
    / "UNIT_QA_Fixed_Package"
    / "02_Test_Data_1000.csv"
)


def load_qa_rows():
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def test_all_qa_events_are_registered_once():
    rows = load_qa_rows()
    dedup = Deduplication()

    for row in rows:
        event = {"event_id": row["Event_ID"]}
        assert dedup.register_event(event) is True

    assert dedup.total_processed() == 1000


def test_replayed_qa_events_are_detected_as_duplicates():
    rows = load_qa_rows()
    dedup = Deduplication()

    for row in rows:
        dedup.register_event({"event_id": row["Event_ID"]})

    for row in rows:
        event = {"event_id": row["Event_ID"]}
        assert dedup.is_duplicate(event) is True
        assert dedup.register_event(event) is False

    assert dedup.total_processed() == 1000


def test_qa_status_age_matches_60_second_rule():
    rows = load_qa_rows()
    now = datetime.now(timezone.utc)

    for row in rows:
        age = float(row["Status_Age_Seconds"])
        status_time = (
            now - timedelta(seconds=age)
        ).isoformat()

        result = check_staleness(
            status_time,
            now=now,
            max_age_seconds=60
        )

        if age <= 60:
            assert result["fresh"] is True
            assert result["safe_hold"] is False
        else:
            assert result["fresh"] is False
            assert result["safe_hold"] is True


def test_exactly_60_seconds_is_fresh():
    now = datetime.now(timezone.utc)
    status_time = (now - timedelta(seconds=60)).isoformat()

    result = check_staleness(status_time, now=now)

    assert result["fresh"] is True
    assert result["safe_hold"] is False


def test_more_than_60_seconds_is_safe_hold():
    now = datetime.now(timezone.utc)
    status_time = (now - timedelta(seconds=60.1)).isoformat()

    result = check_staleness(status_time, now=now)

    assert result["fresh"] is False
    assert result["safe_hold"] is True
