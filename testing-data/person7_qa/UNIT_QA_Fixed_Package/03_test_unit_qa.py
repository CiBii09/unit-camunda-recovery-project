
"""Synthetic fixture checks; NOT Camunda/API/live bank acceptance tests."""
import csv
from pathlib import Path
from collections import Counter
import pytest

PATH=Path(__file__).with_name('02_Test_Data_1000.csv')
with PATH.open(encoding='utf-8-sig',newline='') as f:
    DATA=list(csv.DictReader(f))

def flag(value):
    return str(value).strip().lower() in {'true', '1', '1.0'}

def classify(r):
    # Proposed policy only. Source-unknowns fail closed, not negative truth.
    if r['Contact_Authorized']=='' or not flag(r['Preference_Read_OK']) or flag(r['Outage']) or int(r['Status_Age_Seconds'])>60:
        return 'Unknown'
    if r['Application_Status']!='AWAITING_APPLICANT' or not flag(r['Contact_Verified']) or not flag(r['Contact_Authorized']) or flag(r['Suppressed']) or flag(r['Shared_Contact']) or flag(r['Identity_Hold']) or flag(r['Episode_In_Last_30d']):
        return 'Excluded'
    if int(r['Hours_Since_Progress'])<24 or int(r['Application_Age_Hours'])>168 or int(r['Prior_Reminders_7d'])>=2 or (int(r['Prior_Reminders_7d'])>0 and int(r['Hours_Since_Last_Reminder'])<48):
        return 'NotYetEligible'
    return 'Eligible'

def test_total_and_unique_histories():
    assert len(DATA)==1000
    assert len({r['Record_ID'] for r in DATA})==1000
    assert len({r['Application_ID'] for r in DATA})==1000
    assert len({r['Applicant_ID'] for r in DATA})==1000

def test_required_fields():
    for r in DATA:
        for k in ['Record_ID','Applicant_ID','Application_ID','Bank_ID','Event_ID','Event_Type','Expected_Label','Event_Time_UTC']:
            assert r[k],(r['Record_ID'],k)

def test_distribution():
    assert Counter(r['Expected_Label'] for r in DATA)=={'Eligible':300,'Excluded':300,'NotYetEligible':200,'Unknown':200}

def test_twelve_proposed_event_types():
    assert len({r['Event_Type'] for r in DATA})==12

def test_synthetic_label_logic():
    for r in DATA:
        assert classify(r)==r['Expected_Label'],r['Record_ID']

def test_no_real_contact_fields():
    assert not {'Phone','Email','Full_Name','National_ID'}.intersection(DATA[0])

def test_precision_recall_on_synthetic_known_truth_only():
    known=[r for r in DATA if r['Expected_Label']!='Unknown']
    tp=sum(classify(r)=='Eligible' and r['Expected_Label']=='Eligible' for r in known)
    fp=sum(classify(r)=='Eligible' and r['Expected_Label']!='Eligible' for r in known)
    fn=sum(classify(r)!='Eligible' and r['Expected_Label']=='Eligible' for r in known)
    assert tp==300 and fp==0 and fn==0
    assert tp/(tp+fp)==1 and tp/(tp+fn)==1

@pytest.mark.parametrize('r',[r for r in DATA if r['Expected_Label']=='Excluded'],ids=lambda r:r['Record_ID'])
def test_no_excluded_record_is_eligible(r):
    assert classify(r)!='Eligible'
