
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"
COMMON_SCHEMA_PATH = SCHEMAS_DIR / "common_event.schema.json"
EVENTS_SCHEMA_DIR = SCHEMAS_DIR / "events"


def load_schema(path):
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy Schema: {path}")

    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def get_event_schema_path(event_type):
    if not isinstance(event_type, str):
        return None

    for path in EVENTS_SCHEMA_DIR.glob("*.schema.json"):
        expected_type = path.name.replace(".schema.json", "").upper()

        if event_type == expected_type:
            return path

    return None


def validate_event(event):
    if not isinstance(event, dict):
        return {
            "valid": False,
            "errors": [
                {
                    "field": "",
                    "message": "Event must be a JSON object"
                }
            ]
        }

    event_type = event.get("event_type")
    schema_path = get_event_schema_path(event_type)

    if schema_path is None:
        return {
            "valid": False,
            "errors": [
                {
                    "field": "event_type",
                    "message": f"Unknown or unsupported event_type: {event_type}"
                }
            ]
        }

    common_schema = load_schema(COMMON_SCHEMA_PATH)
    event_schema = load_schema(schema_path)

    registry = Registry().with_resource(
        common_schema["$id"],
        Resource.from_contents(common_schema)
    )

    validator = Draft202012Validator(
        event_schema,
        registry=registry,
        format_checker=FormatChecker()
    )

    errors = sorted(
        validator.iter_errors(event),
        key=lambda error: list(error.path)
    )

    formatted_errors = []

    for error in errors:
        if error.validator == "required":
            missing_field = next(
                (
                    field
                    for field in error.validator_value
                    if field not in error.instance
                ),
                ""
            )
            field_name = missing_field
        else:
            field_name = ".".join(
                str(part) for part in error.path
            )

        formatted_errors.append({
            "field": field_name,
            "message": error.message
        })

    return {
        "valid": len(formatted_errors) == 0,
        "errors": formatted_errors
    }
