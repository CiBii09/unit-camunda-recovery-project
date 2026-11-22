# Sprint 3 QA – Person 7

## Deliverables
- `test_sprint3_regression.py`: pytest standalone regression harness
- `scenario_matrix.json`: 410 AT01/03/04/05 scenarios + 7 edge cases
- `replay_1000.json`: synthetic AT02 labels (300 eligible, 300 excluded, 200 ineligible, 200 unknown)
- `Test_Result_Sprint3.xlsx`: cases, mock results, AT02 replay, summary, Jira defect tracker
- `pytest_sprint3_output.txt`: actual pytest run in isolated simulation

## Run on macOS
```bash
cd "/Users/nguyenvi/Downloads/Sprint3_Person7_QA"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install pytest
python -m pytest test_sprint3_regression.py -v > pytest_sprint3_actual.txt 2>&1
```

## Scope and acceptance caution
This is a **standalone synthetic test harness**, not deployed Camunda E2E. Its policy decisions are simulated, and synthetic labels are generated from the same oracle. A pass does NOT establish AT01–AT05 acceptance on the actual system.

To achieve real E2E: connect bank-approved event intake/status/consent APIs, Camunda 8 worker and DMN, suppression and contact budget services, SMS gateway sandbox, template/role APIs; replay independently labeled fixtures, inject faults, capture logs/traces and Jira issue IDs; run fixes and re-test. Do not claim 100% real E2E until observed.

## Jira workflow
On a genuine failure, create Jira Bug with test ID, steps, expected vs actual, logs, environment and severity. Assign to owning developer. After fix, re-run exact failing case plus related regression and record Jira status, evidence and re-test outcome in workbook. No Jira bugs have been created by this package.

## RFP traceability
Section 8: AT01 100 scenarios; AT02 1,000 histories, 300 eligible and 300 excluded; AT03 150 scenarios; AT04 100 scenarios; AT05 60 scenarios. Edge cases include kill switch during batch, gateway disconnect, stale >60s and 09:00–18:00 boundaries. These quantities alone do not prove full behavioral coverage.
