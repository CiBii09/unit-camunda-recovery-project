
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"
EVENTS_DIR = SCHEMAS_DIR / "events"
COMMON_PATH = SCHEMAS_DIR / "common_event.schema.json"


def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def sample_event(event_type):
    return {
        "bank": "BANK001",
        "applicant_key": "APP-USER-001",
        "application_id": "APPLICATION-001",
        "event_id": "EVENT-001",
        "event_type": event_type,
        "source": "mobile_app",
        "schema_version": "1.0",
        "event_time": "2026-11-12T09:00:00Z",
        "ingestion_time": "2026-11-12T09:00:05Z",
        "sequence": 1
    }


@pytest.fixture
def schema_registry():
    common_schema = load_json(COMMON_PATH)
    return Registry().with_resource(
        common_schema["$id"],
        Resource.from_contents(common_schema)
    )


def get_event_schemas():
    return sorted(EVENTS_DIR.glob("*.schema.json"))


def test_all_12_event_schema_files_exist():
    assert len(get_event_schemas()) == 12


@pytest.mark.parametrize(
    "schema_path",
    get_event_schemas(),
    ids=lambda path: path.stem
)
def test_event_schema_structure(schema_path):
    schema = load_json(schema_path)

    Draft202012Validator.check_schema(schema)

    assert "$id" in schema
    assert "$schema" in schema
    assert "$ref" in schema["allOf"][0]


@pytest.mark.parametrize(
    "schema_path",
    get_event_schemas(),
    ids=lambda path: path.stem
)
def test_event_schema_accepts_correct_event_type(schema_path, schema_registry):
    schema = load_json(schema_path)
    expected_event_type = schema_path.stem.replace(".schema", "").upper()

    validator = Draft202012Validator(
        schema,
        registry=schema_registry,
        format_checker=FormatChecker()
    )

    event = sample_event(expected_event_type)

    assert validator.is_valid(event)


@pytest.mark.parametrize(
    "schema_path",
    get_event_schemas(),
    ids=lambda path: path.stem
)
def test_event_schema_rejects_wrong_event_type(schema_path, schema_registry):
    schema = load_json(schema_path)
    expected_event_type = schema_path.stem.replace(".schema", "").upper()

    validator = Draft202012Validator(
        schema,
        registry=schema_registry,
        format_checker=FormatChecker()
    )

    event = sample_event("WRONG_EVENT_TYPE")

    assert event["event_type"] != expected_event_type
    assert not validator.is_valid(event)
