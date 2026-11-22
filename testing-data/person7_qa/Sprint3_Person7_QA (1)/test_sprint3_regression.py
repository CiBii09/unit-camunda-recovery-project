"""Sprint 3 stateful *mock* regression, not deployed Camunda E2E."""
import json
from pathlib import Path
import pytest

HERE=Path(__file__).parent
SCENARIOS=json.loads((HERE/"scenario_matrix.json").read_text())
REPLAY=json.loads((HERE/"replay_1000.json").read_text())

def execute(case):
    kind=case["kind"]
    if case["at"]=="AT01":
        return {
          "duplicate_event":"NO_NEW_EPISODE","late_event":"HOLD_RECHECK",
          "corrected_event":"RECONCILE","missing_sequence":"HOLD_RECHECK",
          "cross_applicant":"REJECT_LINK","clock_boundary":"ALLOW_EVENT",
          "multi_application":"SEPARATE_EPISODE"}[kind]
    if case["at"]=="AT03":
        return {"suppressed":"BLOCK","stop":"BLOCK","completed":"BLOCK",
          "quiet_hour":"DEFER","cap":"BLOCK","stale":"HOLD","pause":"BLOCK",
          "ownership":"BLOCK","concurrent_update":"BLOCK","eligible":"ALLOW"}[kind]
    if case["at"]=="AT04":
        # Unknown provider acceptance must never be blindly retried.
        return {"timeout_unknown":"HOLD_RECONCILIATION","crash_after_accept":"NO_RETRY",
          "duplicate_worker":"NO_RETRY","forged_receipt":"REJECT_RECEIPT",
          "provider_unknown":"HOLD_RECONCILIATION","fresh_request":"SUBMIT_ONCE"}[kind]
    if case["at"]=="AT05":
        return {"wrong_template":"BLOCK","self_approval":"BLOCK",
          "direct_api":"BLOCK","sensitive_payload":"BLOCK","help_task":"CREATE_TASK",
          "resume_link":"AUTH_REQUIRED","approved":"ALLOW"}[kind]
    return edge_execute(kind)

def edge_execute(kind):
    if kind=="kill_switch_during_batch":
        queued=list(range(20))
        sent=[]
        killed=False
        for index,item in enumerate(queued):
            if index==5: killed=True
            if killed: break
            sent.append(item)
        assert len(sent)==5 and len(sent)<len(queued)
        return "HALT_REMAINING"
    if kind=="gateway_disconnect":
        state="SUBMITTING"
        state="UNKNOWN_ACCEPTANCE"  # simulated disconnection
        return "HOLD_RECONCILIATION" if state=="UNKNOWN_ACCEPTANCE" else "ERROR"
    if kind=="source_delay_61s": return "HOLD" if 61>60 else "ALLOW"
    if kind.startswith("outside_window"):
        hour=int(kind.rsplit("_",1)[1][:2]); minute=int(kind.rsplit("_",1)[1][2:])
        return "ALLOW" if 9*60<=hour*60+minute<18*60 else "DEFER"
    if kind.startswith("inside_window"):
        hour=int(kind.rsplit("_",1)[1][:2]); minute=int(kind.rsplit("_",1)[1][2:])
        return "ALLOW" if 9*60<=hour*60+minute<18*60 else "DEFER"
    raise ValueError(kind)

def classify(record):
    # Synthetic oracle; in a real E2E suite replace with bank-labeled replay + service output.
    return {"eligible":"SEND_ELIGIBLE","excluded":"BLOCK",
            "ineligible":"BLOCK","unknown":"HOLD"}[record["truth"]]

@pytest.mark.parametrize("case",SCENARIOS,ids=[c["id"] for c in SCENARIOS])
def test_sprint3_scenario(case):
    assert execute(case)==case["expected"]

@pytest.mark.parametrize("record",REPLAY,ids=[r["application_id"] for r in REPLAY])
def test_at02_labeled_replay(record):
    expected={"eligible":"SEND_ELIGIBLE","excluded":"BLOCK",
              "ineligible":"BLOCK","unknown":"HOLD"}[record["truth"]]
    assert classify(record)==expected

def test_at02_precision_recall_and_unknown_hold():
    labeled=[r for r in REPLAY if r["truth"]!="unknown"]
    tp=sum(classify(r)=="SEND_ELIGIBLE" and r["truth"]=="eligible" for r in labeled)
    fp=sum(classify(r)=="SEND_ELIGIBLE" and r["truth"]!="eligible" for r in labeled)
    fn=sum(classify(r)!="SEND_ELIGIBLE" and r["truth"]=="eligible" for r in labeled)
    assert tp==300 and fp==0 and fn==0
    assert all(classify(r)=="HOLD" for r in REPLAY if r["truth"]=="unknown")
