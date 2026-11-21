const http = require("http");
const PORT = process.env.PORT || 4500;
const JSON_HEADER = { "Content-Type": "application/json" };

let localCart = [];
const dbRecords = new Map(); // Lưu trạng thái giao dịch + attemptKey + DLR
const auditLogs = [];
const rateLimitWindow = [];
const RATE_LIMIT_MAX = 15; // Tối đa 15 request / 5 giây
const RATE_LIMIT_MS = 5000;

function createInitialSafetyState() {
  return {
    killSwitchActive: false,
    queuePaused: false,
    dataFreshnessSeconds: 12,
    isDataStale: false,
    lastUpdatedBy: "CB",
    lastUpdatedAt: new Date().toISOString()
  };
}

let safetyState = createInitialSafetyState();

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function checkRateLimit() {
  const now = Date.now();
  while (rateLimitWindow.length > 0 && now - rateLimitWindow[0] > RATE_LIMIT_MS) {
    rateLimitWindow.shift();
  }
  if (rateLimitWindow.length >= RATE_LIMIT_MAX) {
    return false;
  }
  rateLimitWindow.push(now);
  return true;
}

function appendAuditLog(actionType, actor, reason) {
  const auditLogId = `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const entry = {
    auditLogId,
    actionType,
    actor: actor || "SYSTEM",
    reason: reason || "",
    timestamp: new Date().toISOString()
  };
  auditLogs.push(entry);
  return entry;
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const cleanUrl = (url || "/").split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // --- Safety Controls (API Contract v1.0 & SafetyControls.tsx) ---
  if (method === "GET" && cleanUrl === "/api/v1/safety/status") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify(safetyState));
  }

  if (method === "POST" && cleanUrl === "/api/v1/safety/kill-switch") {
    const body = await readBody(req);
    const enabled = Boolean(body.enabled);
    const nowIso = new Date().toISOString();

    safetyState.killSwitchActive = enabled;
    if (enabled) {
      safetyState.queuePaused = true;
    }
    safetyState.lastUpdatedBy = body.operatorId || "SYSTEM";
    safetyState.lastUpdatedAt = nowIso;

    const logEntry = appendAuditLog(
      enabled ? "KILL_SWITCH_ENABLED" : "KILL_SWITCH_DISABLED",
      safetyState.lastUpdatedBy,
      body.reason || ""
    );

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "SUCCESS",
      killSwitchActive: safetyState.killSwitchActive,
      queuePaused: safetyState.queuePaused,
      auditLogId: logEntry.auditLogId,
      timestamp: nowIso
    }));
  }

  if (method === "POST" && cleanUrl === "/api/v1/safety/queue-pause") {
    const body = await readBody(req);
    const paused = Boolean(body.paused);
    const nowIso = new Date().toISOString();

    safetyState.queuePaused = paused;
    safetyState.lastUpdatedBy = body.operatorId || "SYSTEM";
    safetyState.lastUpdatedAt = nowIso;

    const logEntry = appendAuditLog(
      paused ? "QUEUE_PAUSED" : "QUEUE_RESUMED",
      safetyState.lastUpdatedBy,
      body.reason || ""
    );

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "SUCCESS",
      queuePaused: safetyState.queuePaused,
      auditLogId: logEntry.auditLogId,
      timestamp: nowIso
    }));
  }

  if (method === "GET" && cleanUrl === "/api/v1/safety/audit-logs") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      total: auditLogs.length,
      logs: auditLogs
    }));
  }

  // --- Cart & Checkout Flow ---
  if (method === "POST" && cleanUrl === "/cart/items") {
    const b = await readBody(req);
    localCart.push({ name: b.name || "Iphone 18", price: b.price ?? 999, qty: b.qty ?? 1 });
    res.writeHead(201, JSON_HEADER);
    return res.end(JSON.stringify({ items: localCart }));
  }

  if (method === "GET" && cleanUrl === "/cart") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({ items: localCart }));
  }

  if (method === "POST" && cleanUrl === "/checkout") {
    if (!localCart.length) {
      res.writeHead(400, JSON_HEADER);
      return res.end(JSON.stringify({ error: "Cart is empty." }));
    }
    const checkedOutItems = [...localCart];
    localCart = [];
    res.writeHead(201, JSON_HEADER);
    return res.end(JSON.stringify({ orderId: `order-${Date.now()}`, items: checkedOutItems, status: "confirmed" }));
  }

  // --- Direct SMS Gateway ---
  if (method === "POST" && cleanUrl === "/api/v1/sms/send") {
    if (safetyState.killSwitchActive) {
      res.writeHead(503, JSON_HEADER);
      return res.end(JSON.stringify({
        errorCode: "KILL_SWITCH_ACTIVE",
        message: "Hệ thống đang bật Global Kill-Switch, từ chối xử lý gửi tin mới.",
        timestamp: new Date().toISOString()
      }));
    }

    const body = await readBody(req);
    const content = body.content ?? body.messageContent ?? "";
    const isUnicode = body.isUnicode ?? true;
    const gatewayMessageId = `GW-MSG-${Math.floor(10000 + Math.random() * 90000)}`;
    const sentAt = new Date().toISOString();

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "SUCCESS",
      errorCode: "00",
      requestId: body.requestId || "DEFAULT_REQUEST_ID",
      gatewayMessageId,
      messageId: gatewayMessageId,
      attemptKey: body.requestId || "DEFAULT_ATTEMPT_KEY",
      deliveryStatus: "SENT",
      sentAt,
      isUnicode,
      totalCharacters: content.length,
      description: "Khao sat API SMS Gateway thanh cong"
    }));
  }

  // --- DLR Webhook ---
  if (method === "POST" && cleanUrl === "/api/v1/sms/webhook/dlr") {
    const body = await readBody(req);
    const deliveredAt = body.deliveredAt || new Date().toISOString();
    const status = body.status || "DELIVERED";

    if (body.requestId && dbRecords.has(body.requestId)) {
      const record = dbRecords.get(body.requestId);
      record.deliveryStatus = status;
      record.deliveredAt = deliveredAt;
      record.errorDetail = body.errorDetail ?? null;
      dbRecords.set(body.requestId, record);
    }

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      code: "00",
      success: true,
      gatewayMessageId: body.gatewayMessageId || null,
      requestId: body.requestId || null,
      status,
      deliveredAt,
      errorDetail: body.errorDetail ?? null,
      description: "Cap nhat DLR thanh cong"
    }));
  }

  // =========================================================================
  // ADAPTER SMS GATEWAY (REC 08, Timeout Reconciliation, Idempotency & Rate Limit)
  // =========================================================================
  if (method === "POST" && cleanUrl === "/api/v1/sms/adapter/send") {
    if (safetyState.killSwitchActive) {
      res.writeHead(503, JSON_HEADER);
      return res.end(JSON.stringify({
        errorCode: "KILL_SWITCH_ACTIVE",
        message: "Hệ thống đang bật Global Kill-Switch, từ chối xử lý gửi tin mới.",
        timestamp: new Date().toISOString()
      }));
    }

    const body = await readBody(req);
    const requestId = body.requestId || "REQ_DEFAULT_001";
    const retryCount = body.retryCount ?? 0;
    const maxRetries = 3;
    const attemptKey = `ATTEMPT-${requestId}-${retryCount}-${Date.now()}`;

    // 1. Chặn hành động "retry mù" khi vượt quá giới hạn (REC 08)
    if (retryCount > maxRetries) {
      res.writeHead(422, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "FAILED_MAX_RETRIES_EXCEEDED",
        errorCode: "REC08_VIOLATION_PREVENTED",
        exceptionReason: "SMS_GATEWAY_MAX_RETRY_EXCEEDED",
        requestId,
        retryCount,
        action: "MOVE_TO_DEAD_LETTER_QUEUE_AND_RECONCILE",
        description: "Chan hanh dong Blind Retry (REC 08): Vuot qua so lan thu cho phep."
      }));
    }

    // 2. Xử lý khi nhà cung cấp timeout, không retry mù mà kích hoạt đối soát
    if (body.simulateTimeout === true) {
      res.writeHead(504, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "GATEWAY_TIMEOUT",
        errorCode: "504",
        requestId,
        retryCount,
        action: "TRIGGER_RECONCILIATION_JOB",
        description: "Nha cung cap timeout. Adapter tuan thu REC 08, dung retry mu va kich hoat doi soat."
      }));
    }

    // 3. Kiểm tra trùng lặp Idempotency trước khi tính Rate Limit & Queue Pause
    if (dbRecords.has(requestId)) {
      const existing = dbRecords.get(requestId);
      res.writeHead(200, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "DUPLICATE_REQUEST_IGNORED",
        decision: "SUPPRESSED",
        blockReason: "DUPLICATE_REQUEST_ID",
        errorCode: "00",
        requestId,
        gatewayMessageId: existing.gatewayMessageId,
        attemptKey: existing.attemptKey,
        description: "Giao dịch đã được xử lý trước đó (Idempotent response)."
      }));
    }

    // 4. Kiểm tra hàng đợi đang tạm dừng (Queue Paused)
    if (safetyState.queuePaused && body.bypassQueuePause !== true) {
      res.writeHead(423, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "QUEUE_PAUSED",
        errorCode: "QUEUE_PAUSED",
        requestId,
        message: "Hàng đợi gửi SMS đang tạm dừng (Queue Paused)."
      }));
    }

    // 5. Kiểm tra giới hạn tần suất (Rate Limiting: 429)
    if (!checkRateLimit()) {
      res.writeHead(429, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "TOO_MANY_REQUESTS",
        errorCode: "RATE_LIMIT_EXCEEDED",
        requestId,
        message: "Vượt quá giới hạn tần suất gửi tin (Rate Limiting)."
      }));
    }

    // 6. Ghi nhận bản ghi vào DB mô phỏng và trả về kết quả
    const gatewayMessageId = `GW-MSG-${Math.floor(10000 + Math.random() * 90000)}`;
    const sentAt = new Date().toISOString();

    dbRecords.set(requestId, {
      requestId,
      processInstanceId: body.processInstanceId || "camunda-proc-default",
      customerId: body.customerId || null,
      phoneNumber: body.phoneNumber || "0901234567",
      templateCode: body.templateCode || "TPL_PAYMENT_RETRY_01",
      content: body.content ?? body.messageContent ?? "",
      gatewayMessageId,
      attemptKey,
      deliveryStatus: "SENT",
      sentAt,
      deliveredAt: null,
      errorDetail: null,
      timestamp: Date.now()
    });

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "ADAPTER_SUCCESS",
      errorCode: "00",
      decision: "QUEUED_FOR_SMS",
      requestId,
      gatewayMessageId,
      attemptKey,
      deliveryStatus: "SENT",
      sentAt,
      idempotencyKeyVerified: true,
      description: "Adapter xu ly thanh cong ban tin, ghi nhan attempt key va tuan thu REC 08."
    }));
  }

  // Endpoint kiểm tra nhanh các bản ghi trong DB mô phỏng
  if (method === "GET" && cleanUrl === "/api/v1/sms/db/records") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      totalRecords: dbRecords.size,
      records: Array.from(dbRecords.values())
    }));
  }

  // Endpoint reset trạng thái tạm cho các lượt chạy test tự động
  if (method === "POST" && cleanUrl === "/api/v1/test/reset") {
    localCart = [];
    dbRecords.clear();
    auditLogs.length = 0;
    rateLimitWindow.length = 0;
    safetyState = createInitialSafetyState();
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({ status: "RESET_OK", timestamp: new Date().toISOString() }));
  }

  res.writeHead(404, JSON_HEADER);
  res.end(JSON.stringify({ error: "Endpoint not defined" }));
});

server.listen(PORT, () => console.log(`Mock server on port ${PORT}`));