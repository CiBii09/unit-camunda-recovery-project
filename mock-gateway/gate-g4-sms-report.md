# Báo cáo Thông số Tích hợp SMS Gateway — Gate G4

- **Thời điểm chạy:** 2026-11-28T00:52:50.947Z
- **Target:** `http://localhost:4500`
- **Tổng số request gửi tin:** 100

## 1. Tổng hợp chỉ số hiệu năng
| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| Tổng request gửi | 100 | Luồng `/api/v1/sms/adapter/send` |
| Thành công (HTTP 200) | 15 | Đã ghi nhận `gatewayMessageId` & xử lý DLR |
| Bị giới hạn tần suất (HTTP 429) | 85 | Bảo vệ gateway khi vượt ngưỡng rate limit |
| Lỗi gateway / mạng (5xx / 0) | 0 | Bao gồm timeout / lỗi kết nối |
| **Tỷ lệ thành công** | **15.00%** | `successCount / TOTAL_REQUESTS` |
| **Độ trễ trung bình** | **0.33 ms** | Max latency: `2.64 ms` |
| **Tỷ lệ lỗi gateway** | **0.00%** | `gatewayErrorCount / TOTAL_REQUESTS` |

## 2. Xác nhận ổn định luồng SMS, DLR & Safety Controls
- **Webhook DLR xử lý:** 15 bản tin cập nhật `DELIVERED`; 15 bản lặp được khử trùng an toàn.
- **Chống ghi đè lùi trạng thái DLR trễ:** 15 trường hợp DLR trễ giữ nguyên trạng thái cuối; 15/15 bản ghi trong store đang ở trạng thái `DELIVERED`.
- **Kill-Switch ngắt tức thì:** Trả về HTTP `503` (`KILL_SWITCH_ACTIVE`) khi bật Kill-Switch và đã khôi phục trạng thái bình thường sau kiểm thử.

## 3. Tiêu chí hoàn thành (DoD)
- [x] Luồng gửi SMS và nhận webhook DLR hoạt động ổn định, không thất thoát trạng thái tin nhắn.
- [x] Đính kèm báo cáo này cùng `newman-report.html` vào hồ sơ nghiệm thu Gate G4.
