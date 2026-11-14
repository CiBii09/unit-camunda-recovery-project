import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from src.application_status import ApplicationStatusProvider
from src.event_processor import EventProcessor
from src.experiment_service import ExperimentService


app = FastAPI(
    title="UNIT Camunda Recovery - Event Intake API",
    description="API for receiving events and checking experiment eligibility.",
    version="1.1.0",
)

# Mock provider for local development and testing.
# This is NOT a real bank integration.
application_status_provider = ApplicationStatusProvider()

event_processor = EventProcessor(
    status_provider=application_status_provider
)


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExperimentAssignRequest(StrictRequest):
    bank: str = Field(min_length=1)
    applicant_key: str = Field(min_length=1)
    application_id: str = Field(min_length=1)


class ExperimentDispatchCheckRequest(StrictRequest):
    assignment_ref: str = Field(min_length=1)
    bank: str = Field(min_length=1)
    application_id: str = Field(min_length=1)


def get_experiment_service():
    """
    Create the experiment service using configured environment settings.

    No default secret is generated. Missing configuration fails closed.
    """
    secret = os.getenv("HOLDOUT_SECRET")

    if not secret or len(secret.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=503,
            detail="Experiment service is not configured",
        )

    configured_db_path = os.getenv("EXPERIMENT_DB_PATH")

    if configured_db_path:
        db_path = Path(configured_db_path)
    else:
        db_path = (
            Path(__file__).resolve().parents[1]
            / "data"
            / "experiment.db"
        )

    try:
        return ExperimentService(
            status_provider=application_status_provider,
            db_path=db_path,
            secret=secret,
        )
    except (TypeError, ValueError, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Experiment service configuration is invalid",
        ) from exc


@app.get("/health")
def health_check():
    """Check whether the Backend API is running."""
    return {
        "status": "healthy",
        "service": "UNIT Camunda Recovery Event Intake API",
    }


@app.post("/events")
def receive_event(event: dict):
    """
    Receive and process an application event.

    Current application status must be available and fresh.
    Missing or unavailable status results in SAFE_HOLD.
    """
    return event_processor.process_event(event=event)


@app.post("/experiments/assign")
def assign_experiment(
    request: ExperimentAssignRequest,
    service: ExperimentService = Depends(get_experiment_service),
):
    """
    Assign an eligible applicant to the experiment.

    The API response exposes only an opaque assignment reference.
    Internal applicant identity and experiment arm are never returned.
    """
    result = service.assign_if_eligible(
        bank=request.bank,
        applicant_key=request.applicant_key,
        application_id=request.application_id,
    )

    response = {
        "status": result.get("status", "SAFE_HOLD"),
        "assigned": bool(result.get("assigned", False)),
        "reason": result.get("reason", "Assignment result unavailable"),
    }

    if result.get("application_status") is not None:
        response["application_status"] = result["application_status"]

    if response["assigned"]:
        assignment = result.get("assignment") or {}
        assignment_ref = assignment.get("assignment_ref")

        if not isinstance(assignment_ref, str) or not assignment_ref.strip():
            return {
                "status": "SAFE_HOLD",
                "assigned": False,
                "reason": "Assignment reference unavailable",
            }

        response["assignment_ref"] = assignment_ref

    return response


@app.post("/experiments/dispatch-check")
def experiment_dispatch_check(
    request: ExperimentDispatchCheckRequest,
    service: ExperimentService = Depends(get_experiment_service),
):
    """
    Re-check experiment and suppression gates before each SMS dispatch.

    Camunda sends only assignment_ref, bank and application_id.
    """
    result = service.check_before_dispatch_by_ref(
        assignment_ref=request.assignment_ref,
        bank=request.bank,
        application_id=request.application_id,
    )

    response = {
        "allowed_for_next_gates": bool(
            result.get("allowed_for_next_gates", False)
        ),
        "reason": result.get("reason", "BLOCK_EXPERIMENT_GATE_ERROR"),
    }

    if result.get("application_status") is not None:
        response["application_status"] = result["application_status"]

    return response
