from fastapi import FastAPI

from src.event_processor import EventProcessor
from src.application_status import ApplicationStatusProvider


app = FastAPI(
    title="UNIT Camunda Recovery - Event Intake API",
    description="API for receiving and processing application events.",
    version="1.0.0"
)

# Mock provider for local development and testing.
# This is NOT a real bank integration.
application_status_provider = ApplicationStatusProvider()

event_processor = EventProcessor(
    status_provider=application_status_provider
)


@app.get("/health")
def health_check():
    """Check whether the Backend API is running."""
    return {
        "status": "healthy",
        "service": "UNIT Camunda Recovery Event Intake API"
    }


@app.post("/events")
def receive_event(event: dict):
    """
    Receive and process an application event.

    Current application status must be available and fresh.
    Missing or unavailable status results in SAFE_HOLD.
    """
    return event_processor.process_event(event=event)
