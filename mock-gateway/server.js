const http = require("http");
const PORT = process.env.PORT || 4500;
const JSON_HEADER = { "Content-Type": "application/json" };

let localCart = [];
const processedRequests = new Map();
const suppressionList = new Set();

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (method === "POST" && url === "/cart/items") {
    const b = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    });
    localCart.push({ name: b.name || "Iphone 18", price: b.price ?? 999, qty: b.qty ?? 1 });
    res.writeHead(201, JSON_HEADER);
    return res.end(JSON.stringify({ items: localCart }));
  }

  if (method === "GET" && url === "/cart") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({ items: localCart }));
  }

  if (method === "POST" && url === "/checkout") {
    if (!localCart.length) {
      res.writeHead(400, JSON_HEADER);
      return res.end(JSON.stringify({ error: "Cart is empty." }));
    }
    const checkedOutItems = [...localCart];
    localCart = [];
    res.writeHead(201, JSON_HEADER);
    return res.end(JSON.stringify({ orderId: `order-${Date.now()}`, items: checkedOutItems, status: "confirmed" }));
  }

  if (method === "POST" && url === "/api/v1/sms/send") {
    const body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    });
    const messageContent = body.messageContent || "";
    const isUnicode = body.isUnicode ?? true;
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "SUCCESS",
      errorCode: "00",
      messageId: `SMS-${Date.now()}`,
      attemptKey: body.requestId || "DEFAULT_ATTEMPT_KEY",
      totalCharacters: messageContent.length,
      description: "Khao sat API SMS Gateway thanh cong"
    }));
  }

  if (method === "POST" && url === "/api/v1/sms/webhook/dlr") {
    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({ code: "00", success: true, description: "Cap nhat DLR thanh cong" }));
  }

  // =========================================================================
  // ADAPTER SMS GATEWAY (Tích hợp 2 yêu cầu mới nhất: REC 08 & Timeout Reconciliation)
  // =========================================================================
  if (method === "POST" && url === "/api/v1/sms/adapter/send") {
    const body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    });

    const requestId = body.requestId || "REQ_DEFAULT_001";
    const retryCount = body.retryCount || 0;
    const maxRetries = 3;
    const attemptKey = `ATTEMPT-${requestId}-${retryCount}-${Date.now()}`;

    // YÊU CẦU MỚI 2: Chặn đứng hành động "retry mù" khi vượt quá giới hạn (REC 08)
    if (retryCount > maxRetries) {
      res.writeHead(422, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "FAILED_MAX_RETRIES_EXCEEDED",
        errorCode: "REC08_VIOLATION_PREVENTED",
        requestId: requestId,
        retryCount: retryCount,
        action: "MOVE_TO_DEAD_LETTER_QUEUE_AND_RECONCILE",
        description: "Chan hanh dong Blind Retry (REC 08): Vuot qua so lan thu cho phep."
      }));
    }

    // YÊU CẦU MỚI 1: Xử lý khi nhà cung cấp timeout, không retry mù mà kích hoạt đối soát
    if (body.simulateTimeout === true) {
      res.writeHead(504, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "GATEWAY_TIMEOUT",
        errorCode: "504",
        requestId: requestId,
        retryCount: retryCount,
        action: "TRIGGER_RECONCILIATION_JOB",
        description: "Nha cung cap timeout. Adapter tuan thu REC 08, dung retry mu va kich hoạt doi soat."
      }));
    }

    // Kiểm tra trùng lặp Idempotency (nếu gửi lại cùng requestId mà không thay đổi gì)
    if (processedRequests.has(requestId)) {
      res.writeHead(200, JSON_HEADER);
      return res.end(JSON.stringify({
        status: "DUPLICATE_REQUEST_IGNORED",
        errorCode: "00",
        requestId: requestId,
        description: "Giao dịch đã được xử lý trước đó (Idempotent response)."
      }));
    }

    processedRequests.set(requestId, { timestamp: Date.now() });

    res.writeHead(200, JSON_HEADER);
    return res.end(JSON.stringify({
      status: "ADAPTER_SUCCESS",
      errorCode: "00",
      requestId: requestId,
      attemptKey: attemptKey,
      idempotencyKeyVerified: true,
      description: "Adapter xu ly thanh cong ban tin, ghi nhan attempt key va tuan thu REC 08."
    }));
  }

  res.writeHead(404, JSON_HEADER);
  res.end(JSON.stringify({ error: "Endpoint not defined" }));
});

server.listen(PORT, () => console.log(`Mock server on port ${PORT}`));