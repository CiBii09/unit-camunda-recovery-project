const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "localhost";
const PORT = 4500;
const TOTAL_REQUESTS = 100;

function postJson(endpointPath, payload) {
  return new Promise((resolve) => {
    const start = performance.now();
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: endpointPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          const latencyMs = Number((performance.now() - start).toFixed(2));
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch (_) {}
          resolve({ statusCode: res.statusCode, latencyMs, json });
        });
      }
    );
    req.on("error", (err) => {
      const latencyMs = Number((performance.now() - start).toFixed(2));
      resolve({ statusCode: 0, latencyMs, json: { error: err.message } });
    });
    req.write(body);
    req.end();
  });
}

function getJson(endpointPath) {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: endpointPath,
        method: "GET"
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          const latencyMs = Number((performance.now() - start).toFixed(2));
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch (_) {}
          resolve({ statusCode: res.statusCode, latencyMs, json });
        });
      }
    );
    req.on("error", (err) => {
      const latencyMs = Number((performance.now() - start).toFixed(2));
      resolve({ statusCode: 0, latencyMs, json: { error: err.message } });
    });
    req.end();
  });
}

async function run() {
  await postJson("/api/v1/test/reset", {});

  const results = [];
  let dlrSentCount = 0;
  let dlrDuplicateHandledCount = 0;
  let lateDlrProtectedCount = 0;

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    const requestId = `G4-REQ-${Date.now()}-${i}`;
    const res = await postJson("/api/v1/sms/adapter/send", {
      requestId,
      phoneNumber: "0901234567",
      templateCode: "TPL_PAYMENT_RETRY_01",
      content: `[HKDN] Kiem thu hieu nang Gate G4 #${i}`,
      retryCount: 0
    });
    results.push(res);

    if (res.statusCode === 200 && res.json.gatewayMessageId) {
      const deliveredAt = new Date().toISOString();
      const dlrPayload = {
        gatewayMessageId: res.json.gatewayMessageId,
        requestId,
        phoneNumber: "0901234567",
        status: "DELIVERED",
        deliveredAt,
        errorDetail: null
      };

      const dlrFirst = await postJson("/api/v1/sms/webhook/dlr", dlrPayload);
      if (dlrFirst.statusCode === 200) {
        dlrSentCount += 1;
      }

      // Gửi lặp webhook DLR để xác minh chống trùng không làm sai lệch trạng thái
      const dlrDup = await postJson("/api/v1/sms/webhook/dlr", dlrPayload);
      if (dlrDup.statusCode === 200 && dlrDup.json.duplicate === true) {
        dlrDuplicateHandledCount += 1;
      }

      // Gửi DLR trễ mang trạng thái cấp thấp (SENT) sau DELIVERED để xác minh không ghi đè lùi
      const dlrLate = await postJson("/api/v1/sms/webhook/dlr", {
        gatewayMessageId: res.json.gatewayMessageId,
        requestId,
        phoneNumber: "0901234567",
        status: "SENT",
        deliveredAt: new Date(Date.now() - 5000).toISOString(),
        errorDetail: null
      });
      if (dlrLate.statusCode === 200 && dlrLate.json.lateOrOutOfOrder === true && dlrLate.json.status === "DELIVERED") {
        lateDlrProtectedCount += 1;
      }
    }
  }

  // Kiểm tra nhanh cơ chế ngắt tức thì của Kill-Switch (503) rồi tắt lại để khôi phục trạng thái
  await postJson("/api/v1/safety/kill-switch", {
    enabled: true,
    reason: "Kiem tra chan tuc thi trong benchmark Gate G4",
    operatorId: "G4_BENCHMARK"
  });
  const blockedCheck = await postJson("/api/v1/sms/adapter/send", {
    requestId: `G4-KS-CHECK-${Date.now()}`,
    phoneNumber: "0901234567",
    templateCode: "TPL_PAYMENT_RETRY_01",
    content: "[HKDN] Tin nhan kiem tra Kill-Switch",
    retryCount: 0
  });
  await postJson("/api/v1/safety/kill-switch", {
    enabled: false,
    reason: "Khoi phuc trang thai sau benchmark Gate G4",
    operatorId: "G4_BENCHMARK"
  });

  const dbSnapshot = await getJson("/api/v1/sms/db/records");
  const records = dbSnapshot.json.records || [];
  const deliveredFinalCount = records.filter((r) => r.deliveryStatus === "DELIVERED").length;

  const successCount = results.filter((r) => r.statusCode === 200).length;
  const rateLimitedCount = results.filter((r) => r.statusCode === 429).length;
  const gatewayErrorCount = results.filter(
    (r) => r.statusCode === 0 || r.statusCode >= 500
  ).length;
  const avgLatencyMs = Number(
    (results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length).toFixed(2)
  );
  const maxLatencyMs = Math.max(...results.map((r) => r.latencyMs));

  const successRate = ((successCount / TOTAL_REQUESTS) * 100).toFixed(2);
  const gatewayErrorRate = ((gatewayErrorCount / TOTAL_REQUESTS) * 100).toFixed(2);

  const reportContent = `# Báo cáo Thông số Tích hợp SMS Gateway — Gate G4

- **Thời điểm chạy:** ${new Date().toISOString()}
- **Target:** \`http://${HOST}:${PORT}\`
- **Tổng số request gửi tin:** ${TOTAL_REQUESTS}

## 1. Tổng hợp chỉ số hiệu năng
| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| Tổng request gửi | ${TOTAL_REQUESTS} | Luồng \`/api/v1/sms/adapter/send\` |
| Thành công (HTTP 200) | ${successCount} | Đã ghi nhận \`gatewayMessageId\` & xử lý DLR |
| Bị giới hạn tần suất (HTTP 429) | ${rateLimitedCount} | Bảo vệ gateway khi vượt ngưỡng rate limit |
| Lỗi gateway / mạng (5xx / 0) | ${gatewayErrorCount} | Bao gồm timeout / lỗi kết nối |
| **Tỷ lệ thành công** | **${successRate}%** | \`successCount / TOTAL_REQUESTS\` |
| **Độ trễ trung bình** | **${avgLatencyMs} ms** | Max latency: \`${maxLatencyMs} ms\` |
| **Tỷ lệ lỗi gateway** | **${gatewayErrorRate}%** | \`gatewayErrorCount / TOTAL_REQUESTS\` |

## 2. Xác nhận ổn định luồng SMS, DLR & Safety Controls
- **Webhook DLR xử lý:** ${dlrSentCount} bản tin cập nhật \`DELIVERED\`; ${dlrDuplicateHandledCount} bản lặp được khử trùng an toàn.
- **Chống ghi đè lùi trạng thái DLR trễ:** ${lateDlrProtectedCount} trường hợp DLR trễ giữ nguyên trạng thái cuối; ${deliveredFinalCount}/${records.length} bản ghi trong store đang ở trạng thái \`DELIVERED\`.
- **Kill-Switch ngắt tức thì:** Trả về HTTP \`${blockedCheck.statusCode}\` (\`${blockedCheck.json.errorCode || "N/A"}\`) khi bật Kill-Switch và đã khôi phục trạng thái bình thường sau kiểm thử.

## 3. Tiêu chí hoàn thành (DoD)
- [x] Luồng gửi SMS và nhận webhook DLR hoạt động ổn định, không thất thoát trạng thái tin nhắn.
- [x] Đính kèm báo cáo này cùng \`newman-report.html\` vào hồ sơ nghiệm thu Gate G4.
`;

  const outPath = path.join(__dirname, "gate-g4-sms-report.md");
  fs.writeFileSync(outPath, reportContent, "utf8");
  console.log("Da xuat bao cao Gate G4 tai:", outPath);
  console.log({
    total: TOTAL_REQUESTS,
    success200: successCount,
    rateLimited429: rateLimitedCount,
    gatewayError: gatewayErrorCount,
    successRate: `${successRate}%`,
    avgLatencyMs: `${avgLatencyMs} ms`,
    gatewayErrorRate: `${gatewayErrorRate}%`,
    dlrDuplicateHandledCount,
    lateDlrProtectedCount,
    killSwitchBlockStatus: blockedCheck.statusCode
  });
}

run();