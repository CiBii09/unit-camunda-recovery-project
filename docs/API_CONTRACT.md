# API Contract - Hệ thống Phục hồi SMS (unit-camunda-recovery-project)
**Phiên bản:** v1.0 (Sprint 3 - E2E Integration & Pilot)  
**Người phụ trách:** Chí Bảo (PM)  
**Base URL (Local/Staging):** `http://localhost:8080/api/v1`  
**Header mặc định:** `Content-Type: application/json`

---

## 1. Safety & Emergency Controls (PM / FE Safety & BE)
Dùng cho cụm điều khiển khẩn cấp `SafetyControls.tsx` trên `Header.tsx`.

### 1.1. Lấy trạng thái hệ thống hiện tại
* **Endpoint:** `GET /safety/status`
* **Response (`200 OK`):**
```json
{
  "killSwitchActive": false,
  "queuePaused": false,
  "dataFreshnessSeconds": 12,
  "isDataStale": false,
  "lastUpdatedBy": "CB",
  "lastUpdatedAt": "2026-11-19T10:30:00Z"
}
{
  "enabled": true,
  "reason": "Phát hiện tỷ lệ lỗi gateway vượt ngưỡng 15% trong phiên Pilot",
  "operatorId": "CB"
}
{
  "status": "SUCCESS",
  "killSwitchActive": true,
  "auditLogId": "AUD-20261119-001",
  "timestamp": "2026-11-19T10:35:00Z"
}
{
  "paused": true,
  "reason": "Tạm dừng để kiểm tra đối soát biên nhận",
  "operatorId": "CB"
}
{
  "status": "SUCCESS",
  "queuePaused": true,
  "auditLogId": "AUD-20261119-002",
  "timestamp": "2026-11-19T10:36:00Z"
}
{
  "requestId": "REQ-20261119-88412",
  "customerId": "CUST-10029",
  "phoneNumber": "0901234567",
  "templateCode": "TPL_PAYMENT_RETRY_01",
  "eventTimestamp": "2026-11-19T10:39:45Z",
  "metadata": {
    "transactionAmount": 250000,
    "errorCode": "BANK_TIMEOUT"
  }
}
{
  "requestId": "REQ-20261119-88412",
  "processInstanceId": "camunda-proc-99102",
  "decision": "QUEUED_FOR_SMS",
  "freshnessAgeSeconds": 15
}
{
  "requestId": "REQ-20261119-88412",
  "decision": "SUPPRESSED",
  "blockReason": "DUPLICATE_REQUEST_ID | STALE_DATA_OVER_60S | OUTSIDE_LEGAL_HOURS | HOLDOUT_GROUP | OPT_OUT_LIST"
}
{
  "requestId": "REQ-20261119-88412",
  "phoneNumber": "0901234567",
  "templateCode": "TPL_PAYMENT_RETRY_01",
  "content": "[HKDN] Giao dich 250,000 VND chua hoan tat. Vui long thu lai hoac lien he 1900xxxx. Tu choi tin nhan soan TC gui xxxx."
}
{
  "requestId": "REQ-20261119-88412",
  "gatewayMessageId": "GW-MSG-77410",
  "deliveryStatus": "SENT",
  "sentAt": "2026-11-19T10:40:02Z"
}
{
  "gatewayMessageId": "GW-MSG-77410",
  "requestId": "REQ-20261119-88412",
  "status": "DELIVERED",
  "deliveredAt": "2026-11-19T10:40:08Z",
  "errorDetail": null
}
{
  "total": 1,
  "items": [
    {
      "taskId": "TASK-5501",
      "requestId": "REQ-20261119-88415",
      "customerId": "CUST-10035",
      "phoneNumber": "0912345678",
      "exceptionReason": "SMS_GATEWAY_MAX_RETRY_EXCEEDED",
      "createdAt": "2026-11-19T10:15:00Z",
      "status": "OPEN"
    }
  ]
}
{
  "action": "RESEND_SMS | CANCEL_RECOVERY | CALL_CUSTOMER_DONE",
  "note": "Đã gọi xác nhận với khách hàng, hủy gửi lại SMS",
  "resolvedBy": "KL"
}
{
  "taskId": "TASK-5501",
  "status": "RESOLVED",
  "resolvedAt": "2026-11-19T10:45:00Z"
}
{
  "logs": [
    {
      "auditLogId": "AUD-20261119-001",
      "actionType": "KILL_SWITCH_ENABLED",
      "actor": "CB",
      "reason": "Phát hiện tỷ lệ lỗi gateway vượt ngưỡng 15%",
      "timestamp": "2026-11-19T10:35:00Z"
    }
  ]
}
{
  "totalEventsReceived": 1000,
  "sentCount": 780,
  "suppressedHoldoutCount": 100,
  "suppressedOptOutCount": 45,
  "blockedOutsideHoursCount": 30,
  "blockedStaleDataCount": 25,
  "duplicateBlockedCount": 20,
  "manualQueueEscalatedCount": 12
}
{
  "errorCode": "KILL_SWITCH_ACTIVE",
  "message": "Hệ thống đang bật Global Kill-Switch, từ chối xử lý gửi tin mới.",
  "timestamp": "2026-11-19T10:46:00Z"
}
```

## 2. Sprint 3 safety control API (Camunda worker integration)

The base URL above includes `/api/v1`. The backend exposes the following paths under that prefix:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/safety/status` | Read `killSwitchActive`, `queuePaused`, update actor and timestamp |
| `POST` | `/safety/kill-switch` | Set `{ "enabled": boolean, "reason": string, "operatorId": string }` |
| `POST` | `/safety/queue-pause` | Set `{ "paused": boolean, "reason": string, "operatorId": string }` |
| `GET` | `/safety/audit-logs` | Read audit entries for control changes |

Both `POST` responses include `status`, the effective safety state, `auditLogId`, and `timestamp`. Enabling Kill-Switch forces Queue Pause on. Disabling Kill-Switch does not resume the queue, and a queue-resume request while Kill-Switch is active remains paused.

The Camunda 8 worker calls `GET /api/v1/safety/status` before suppression and again immediately before dispatch. If either control is active, or if the safety API is unavailable or malformed, the worker completes into the BPMN Safe Hold branch and synchronizes `dispatchDecision`, `blockReason`, and safety status to process variables. Safe-held work releases its idempotency claim so an operator can resume it after reviewing the state; completed dispatch results and variables are persisted together for safe job redelivery.

The BPMN Safe Hold branch creates an operator-review user task. After resetting Kill-Switch, explicitly resuming Queue Pause, and reviewing the task, completing it returns to the dispatch worker. A request already accepted by an SMS provider cannot be recalled.

For local tests, run the backend at `http://localhost:8080` and the mock SMS gateway at `http://localhost:4500`. The 1,000-record worker simulation uses mocked safety/gateway clients; it does not send real SMS. The generated `safety-controls-e2e.log` records its pause/resume summary.