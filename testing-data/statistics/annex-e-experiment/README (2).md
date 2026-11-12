# Annex E – Randomized Controlled Experiment Protocol

**Dự án:** UNIT Vietnam Onboarding Abandonment Recovery (Camunda 8)
**Phụ trách:** Người 8 – Statistician / Data Analyst
**Jira:** [Sprint 1][DATA] Design Randomized Controlled Experiment Protocol

Thiết kế thử nghiệm ngẫu nhiên có đối chứng (RCT) để đo việc nhắc nhở khôi phục đăng ký có làm tăng tỷ lệ mở tài khoản hay không. Toàn bộ dữ liệu và secret trong mã nguồn là **giả lập**.

## Nội dung

| Sub-task | Nội dung | Tài liệu | Mã nguồn |
|---|---|---|---|
| 8.1 | Giao thức thử nghiệm (Annex E): thiết kế, chỉ số chính, kế hoạch phân tích, ngưỡng dừng an toàn, cổng G1–G4 | `docs/8.1_Experiment_Protocol.docx` | – |
| 8.2 | Tính cỡ mẫu và power | `docs/8.2_Power_Calculation.docx` | `src/8_2_power_calculation.py`, `notebooks/8_2_Power_Calculation.ipynb` |
| 8.3 | Thuật toán chia nhóm cố định (Stable Applicant Assignment) | `docs/8.3_Stable_Assignment.docx` | `src/8_3_stable_assignment.py`, `notebooks/8_3_Stable_Assignment.ipynb` |

## Tóm tắt thiết kế

- **Đơn vị chia nhóm:** Applicant (`applicant_key`), tỷ lệ 1:1 giữa Treatment (nhận nhắc nhở thử nghiệm) và Control (dịch vụ thường).
- **Chỉ số chính:** mở tài khoản trong vòng 14 ngày kể từ `assigned_at`; phân tích theo ý định điều trị (ITT).
- **Cỡ mẫu (8.2):** giả định tỷ lệ nhóm Control 20%, mức cải thiện tuyệt đối 5 điểm phần trăm (lên 25%), α = 0,05 hai phía, power 80%.
  - Cỡ mẫu tối thiểu: **1.094 mỗi nhóm**.
  - Cỡ mẫu kế hoạch theo RFP: **1.200 mỗi nhóm** (tổng 2.400), power thực tế khoảng 83,6% (Python) hoặc 83,5% (G*Power).
  - Cần khoảng 24 ngày để tuyển đủ, với giả định 3.000 ứng viên đủ điều kiện mỗi tháng.
- **Chia nhóm cố định (8.3), gồm hai lớp:**
  1. Hàm băm tất định: `HMAC-SHA256(secret, experiment_id | applicant_key)`, lấy 8 byte đầu mod 10000, nhỏ hơn 5000 thì Treatment.
  2. Bảng bất biến `experiment_assignment` với ràng buộc `UNIQUE (experiment_id, applicant_key)`, chỉ ghi một lần; mọi nơi đọc nhóm từ bảng này.
- **Cổng dispatch:** Backend đọc bảng nhóm tại thời điểm gửi để chặn Control. Camunda chỉ giữ mã tham chiếu mờ, không giữ biến nhóm.

## Cấu trúc thư mục

```
annex-e-experiment/
├── README.md
├── docs/
│   ├── 8.1_Experiment_Protocol.docx
│   ├── 8.2_Power_Calculation.docx
│   └── 8.3_Stable_Assignment.docx
├── notebooks/
│   ├── 8_2_Power_Calculation.ipynb
│   └── 8_3_Stable_Assignment.ipynb
├── src/
│   ├── 8_2_power_calculation.py
│   └── 8_3_stable_assignment.py
└── diagrams/
    ├── fig1_assignment_flow.png   (lưu đồ thuật toán chia nhóm)
    └── fig2_dispatch_gate.png     (cổng dispatch và đo kết quả)
```

## Cách chạy

Yêu cầu: Python 3.8 trở lên, chỉ dùng thư viện chuẩn (không cần cài thêm gói).

```bash
# 8.2 – tính cỡ mẫu, power và bảng độ nhạy
python src/8_2_power_calculation.py

# 8.3 – chạy 10 kiểm thử của thuật toán chia nhóm (tất cả phải PASS)
python src/8_3_stable_assignment.py
```

Hoặc mở các file trong `notebooks/` bằng Google Colab và chạy từng ô.

> File `.py` và `.ipynb` có cùng nội dung; `.ipynb` kèm kết quả chạy.

## Kết quả mong đợi

- `8_2_power_calculation.py`: n chưa hiệu chỉnh 1093,7, làm tròn lên 1.094 mỗi nhóm; power tại n = 1.200 là 83,6%; nếu hiểu "5%" là tăng tương đối (20% lên 21%) thì cần 25.583 mỗi nhóm.
- `8_3_stable_assignment.py`: 10 kiểm thử đều đạt, gồm tính tất định, chống nhảy nhóm khi đổi secret, 50 luồng đồng thời, cổng dispatch và cửa sổ 14 ngày.

## Giao diện với các thành viên khác

- **Backend:** bảng `experiment_assignment`, dịch vụ chia nhóm, cổng dispatch, sự kiện `account_opened` (`applicant_key`, `application_id`, `event_type`, `event_time`). Chi tiết ở mục 6–8 của tài liệu 8.3.
- **Camunda:** không có nhánh workflow riêng cho Control; Backend chỉ khởi tạo episode nhắc nhở cho Treatment.
- **PM** các tham số cần xác nhận tại G1 (tỷ lệ nền Control, quy tắc hồ sơ thay thế, ngưỡng dừng an toàn).

## Giả định và hạn chế

- Tỷ lệ nền 20% và mức cải thiện 5 điểm phần trăm là giả định minh họa theo RFP, cần xác nhận bằng dữ liệu thật tại G1.
- Chia nhóm bằng hàm băm là ngẫu nhiên đơn giản nên hai nhóm lệch nhẹ (ví dụ 1.171 và 1.229 ở n = 2.400); phân tích ITT vẫn hợp lệ, kèm kiểm tra SRM (cảnh báo khi p < 0,001).
- Secret trong mã là giả lập. Khi triển khai thật phải lưu trong secret manager, **không đưa vào repo hay biến Camunda**.
- Bộ 10 kiểm thử là bằng chứng thiết kế, không thay thế các bộ kiểm thử chấp nhận của QA (AT 01–AT 07).
- Các ngưỡng dừng an toàn trong 8.1 là đề xuất, cần Project Council phê duyệt.
