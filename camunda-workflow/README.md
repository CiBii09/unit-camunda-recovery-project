# Camunda workflow models

This directory contains the versioned Camunda 8/Zeebe models and worker implementation for SMS recovery. Do not commit generated deployment artifacts.

## Structure

`bpmn/` stores BPMN process models and related documentation. `sms-recovery-dispatch.bpmn` routes a worker result with `dispatchDecision=SAFE_HOLD` to a persistent Tasklist review task. Completing that task returns to the dispatch worker, which re-reads both safety controls before any new gateway request.

`dmn/` stores decision tables used by the process.

`tests/` stores model validation and end-to-end verification data.

## Safety gate and process variables

The `dispatch-sms-task` worker reads `GET /api/v1/safety/status` before suppression and again immediately before dispatch. It fails closed into `SAFE_HOLD` if either control is active or the status API is unavailable. The job completion writes the decision and reason into Zeebe process variables; the original process variables remain on the instance.

Configure `WORKER_SAFETY_CONTROLS_BASE_URL` to the backend origin (default `http://localhost:8080`) and `WORKER_SMS_GATEWAY_BASE_URL` to the mock/approved gateway (default `http://localhost:4500`). An active Kill-Switch also forces Queue Pause. Resetting the Kill-Switch does not automatically unpause the queue or release a held process; an operator must resume the queue and complete the Tasklist review after verifying the system is safe.

The worker persists completion variables alongside its idempotency record. A redelivered completed job replays those variables to Zeebe, preventing a successful dispatch from losing its process decision after a transient completion-command failure.

## Local verification

Run the backend API from `backend/` with `uvicorn src.api:app --host 0.0.0.0 --port 8080`, and start the mock gateway with `node mock-gateway/server.js` from the repository root. Run backend tests with `pytest backend/tests/test_safety_control_api.py` and worker tests with `gradlew.bat test` from `camunda-workflow/camunda-recovery-worker/camunda-recovery-worker`.

The BPMN model uses a manual Tasklist review as the safe-hold boundary. Resumption is deliberately operator-controlled; a gateway request already accepted by the SMS provider cannot be recalled.

For Windows PowerShell startup commands, Kill-Switch/API screenshots, and the 1,000-job worker simulation, see [DEMO_SAFETY_CONTROLS.md](./DEMO_SAFETY_CONTROLS.md).
