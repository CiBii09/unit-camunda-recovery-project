const http = require("http");

function sendPost(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: "localhost",
        port: 4500,
        path: "/api/v1/sms/adapter/send",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const dupCount = 10;
  const burstCount = 25;
  console.log(`=== BAT DAU STRESS TEST DONG THOI (${dupCount + burstCount} REQUESTS) ===`);

  const tasks = [];

  // 1. Nhóm request trùng requestId (kiểm tra chống gửi trùng / idempotency)
  for (let i = 0; i < dupCount; i++) {
    tasks.push(
      sendPost({
        requestId: "STRESS_DUP_01",
        processInstanceId: "camunda-stress-dup",
        retryCount: 0
      })
    );
  }

  // 2. Nhóm request khác requestId vượt ngưỡng tần suất (kiểm tra rate limiting)
  const batchTs = Date.now();
  for (let i = 0; i < burstCount; i++) {
    tasks.push(
      sendPost({
        requestId: `STRESS_BURST_${batchTs}_${i}`,
        processInstanceId: `camunda-stress-burst-${i}`,
        retryCount: 0
      })
    );
  }

  const results = await Promise.all(tasks);
  const summary = {
    total: results.length,
    success200: 0,
    duplicateIgnored: 0,
    rateLimited429: 0,
    other: 0
  };

  for (const r of results) {
    if (r.status === 200 && r.data && r.data.status === "ADAPTER_SUCCESS") {
      summary.success200++;
    } else if (r.status === 200 && r.data && r.data.status === "DUPLICATE_REQUEST_IGNORED") {
      summary.duplicateIgnored++;
    } else if (r.status === 429) {
      summary.rateLimited429++;
    } else {
      summary.other++;
    }
  }

  console.log("Ket qua Stress Test:", summary);
})();