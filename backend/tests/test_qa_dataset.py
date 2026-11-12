
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest


CSV_PATH = (
    Path(__file__).resolve().parents[2]
    / "testing-data"
    / "person7_qa"
    / "UNIT_QA_Fixed_Package"
    / "02_Test_Data_1000.csv"
)

EXPECTED_EVENT_TYPES = {
    "APPLICATION_BLOCKED",
    "APPLICATION_COMPLETED",
    "APPLICATION_EXPIRED",
    "APPLICATION_PROGRESS",
    "APPLICATION_REJECTED",
    "APPLICATION_STARTED",
    "APPLICATION_WITHDRAWN",
    "AWAITING_APPLICANT",
    "AWAITING_BANK",
    "CONTACT_PREFERENCE_UPDATED",
    "EVIDENCE_ACCEPTED",
    "STEP_SUBMITTED",
}

REQUIRED_COLUMNS = {
    "Record_ID",
    "Applicant_ID",
    "Application_ID",
    "Bank_ID",
    "Event_Type",
    "Event_ID",
    "Event_Sequence",
    "Event_Time_UTC",
    "Ingestion_Time_UTC",
    "Source_Version",
}


def load_qa_rows():
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy file QA: {CSV_PATH}")

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def excel_serial_to_datetime(value):
    return (
        datetime(1899, 12, 30, tzinfo=timezone.utc)
        + timedelta(days=float(value))
    )


@pytest.fixture(scope="module")
def qa_rows():
    return load_qa_rows()


def test_qa_csv_contains_1000_records(qa_rows):
    assert len(qa_rows) == 1000


def test_qa_csv_has_required_columns():
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        columns = set(reader.fieldnames or [])

    assert REQUIRED_COLUMNS.issubset(columns)


def test_all_12_event_types_are_present(qa_rows):
    actual_types = {row["Event_Type"] for row in qa_rows}
    assert actual_types == EXPECTED_EVENT_TYPES


def test_required_event_fields_are_not_empty(qa_rows):
    for row in qa_rows:
        for field in [
            "Applicant_ID",
            "Application_ID",
            "Bank_ID",
            "Event_Type",
            "Event_ID",
            "Event_Sequence",
            "Event_Time_UTC",
            "Ingestion_Time_UTC",
        ]:
            assert row[field].strip(), (
                f"Record {row['Record_ID']} thiếu {field}"
            )


def test_event_sequence_is_numeric(qa_rows):
    for row in qa_rows:
        assert int(row["Event_Sequence"]) >= 0


def test_excel_timestamps_can_be_converted(qa_rows):
    for row in qa_rows:
        event_time = excel_serial_to_datetime(row["Event_Time_UTC"])
        ingestion_time = excel_serial_to_datetime(
            row["Ingestion_Time_UTC"]
        )

        assert event_time.tzinfo is not None
        assert ingestion_time.tzinfo is not None


def test_ingestion_time_is_not_before_event_time(qa_rows):
    for row in qa_rows:
        event_time = excel_serial_to_datetime(row["Event_Time_UTC"])
        ingestion_time = excel_serial_to_datetime(row["Ingestion_Time_UTC"])

        assert ingestion_time >= event_time, (
            f"Thời gian ingestion trước event tại {row['Record_ID']}"
        )
