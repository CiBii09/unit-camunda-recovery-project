# Person 7 – Sprint 1: 30 synthetic QA scenarios

## Deliverables
- `01_Test_Cases_30.xlsx`: 30 test cases (6 each for approval, duplicates, frequency, late events, stop/suppression)
- `test_cases_30.json`: machine-readable scenario inputs and expected decisions
- `test_30_scenarios.py`: pytest policy simulator and test suite
- `03_Test_Result_30.txt`: actual local pytest run output

## Run (Mac)
```bash
source /Users/nguyenvi/Downloads/UNIT_QA_Testing_Package/.venv/bin/activate
python -m pytest test_30_scenarios.py -v
```

## Limitations
These tests exercise a **standalone deterministic reference policy**, not the team's Camunda, event intake, SMS gateway, or live API. Passing does **not** establish integration acceptance. Rules are proposed Sprint-1 assumptions and must be reconciled with approved policy and schemas. Do not use real customer data.
