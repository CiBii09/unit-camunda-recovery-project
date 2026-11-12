
from fastapi import FastAPI

from src.event_processor import EventProcessor


app = FastAPI(
    title="UNIT Camunda Recovery - Event Intake API",
    description="API for receiving and processing application events.",
    version="1.0.0"
)

# Create one processor instance for this API process.
event_processor = EventProcessor()


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

    No authoritative status service is connected yet.
    Therefore, valid events are placed in SAFE_HOLD.
    """
    result = event_processor.process_event(
        event=event,
        status_time=None
    )

    return result

