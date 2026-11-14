"""30 deterministic synthetic policy tests; NOT an integration test of Camunda/API."""
import json
from pathlib import Path
import pytest

CASES=json.loads(Path(__file__).with_name("test_cases_30.json").read_text(encoding="utf-8"))
DEFAULT={
 "approved":True,"template_valid":True,"consent":True,"verified":True,
 "status":"AWAITING_APPLICANT","duplicate_event":False,"duplicate_episode":False,
 "accepted_attempt":False,"unknown_acceptance":False,"duplicate_request":False,
 "reminders_7d":0,"hours_since_last":999,"hour":10,
 "event_age_seconds":0,"status_age_seconds":0,"suppressed":False,
 "stop":False,"source_ok":True,"authorization_age_seconds":0
}
def decide(s):
    # Proposed Sprint-1 fail-closed reference policy, NOT production decision logic.
    if s["stop"]: return "BLOCK_STOP"
    if s["suppressed"]: return "BLOCK_SUPPRESSION"
    if s["status"]!="AWAITING_APPLICANT": return "BLOCK_STATUS"
    if not s["source_ok"]: return "HOLD_SOURCE"
    if s["status_age_seconds"]>60: return "HOLD_STALE"
    if s["authorization_age_seconds"]>5: return "BLOCK_AUTH_EXPIRED"
    if not s["consent"]: return "BLOCK_CONSENT"
    if not s["verified"]: return "BLOCK_CONTACT"
    if not s["approved"]: return "BLOCK_APPROVAL"
    if not s["template_valid"]: return "BLOCK_TEMPLATE"
    if s["duplicate_event"]: return "BLOCK_DUP_EVENT"
    if s["duplicate_episode"]: return "BLOCK_DUP_EPISODE"
    if s["accepted_attempt"]: return "BLOCK_DUP_ATTEMPT"
    if s["duplicate_request"]: return "BLOCK_DUP_REQUEST"
    if s["unknown_acceptance"]: return "HOLD_RECONCILIATION"
    if s["reminders_7d"]>=2: return "BLOCK_CAP"
    if s["reminders_7d"]>0 and s["hours_since_last"]<48: return "BLOCK_SPACING"
    if not 9<=s["hour"]<18: return "BLOCK_WINDOW"
    return "ALLOW"

@pytest.mark.parametrize("case",CASES,ids=[c["id"] for c in CASES])
def test_synthetic_policy(case):
    state={**DEFAULT,**case["overrides"]}
    actual=decide(state)
    assert actual==case["expected"],f'{case["id"]}: expected {case["expected"]}, got {actual}'
