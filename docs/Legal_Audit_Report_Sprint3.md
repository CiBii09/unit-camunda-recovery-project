## 1. Mục tiêu kiểm toán

- Kiểm toán toàn bộ 1.000 bản ghi trong đợt chạy thử nghiệm.
- Rà soát các tin nhắn SMS được ghi nhận trong dữ liệu và các mã mẫu SMS được sử dụng.
- Kiểm tra khung giờ gửi theo yêu cầu 09:00–18:00.
- Kiểm tra các trường liên quan đến Suppression/Opt-out để xác định có bản ghi bị từ chối nhận tin nhưng vẫn được ghi nhận là đã gửi hay không.
- Tổng hợp kết quả làm căn cứ đánh giá Gate G3.

## 2. Phạm vi và nguồn dữ liệu

Nguồn dữ liệu được kiểm tra là file CSV do nhóm cung cấp, gồm **1.000 dòng và 35 cột**. Các trường được sử dụng trong kiểm toán gồm:

- Định danh: `Record_ID`, `Applicant_ID`, `Application_ID`, `Event_ID`.
- Trạng thái và điều kiện: `Application_Status`, `Expected_Label`, `Reason`.
- Quyền liên hệ và chặn gửi: `Contact_Verified`, `Contact_Authorized`, `Preference_Read_OK`, `Suppressed`, `Shared_Contact`, `Identity_Hold`, `Outage`.
- Thông tin SMS: `Nội dung SMS`, `Mã mẫu`, `Thời gian gửi giả lập`.
- Kết quả kiểm tra: `Kết quả kiểm tra khung giờ`, `Suppression/Opt-out`.

## 3. Tổng quan kết quả

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Tổng số bản ghi | 1.000 |
| Eligible | 300 |
| Excluded | 300 |
| NotYetEligible | 200 |
| Unknown | 200 |
| Bản ghi có nội dung SMS | 300 |
| Bản ghi không có nội dung SMS | 700 |
| Mã mẫu SMS khác nhau được ghi nhận | 4 |
| Record_ID trùng | 0 |
| Event_ID trùng | 0 |

Toàn bộ 300 bản ghi có nội dung SMS đều thuộc nhóm `Eligible`. Không có bản ghi `Excluded`, `NotYetEligible` hoặc `Unknown` nào được ghi nhận có nội dung SMS.

## 4. Kiểm toán khung giờ gửi

**Tiêu chí kiểm tra:** Thời gian gửi phải nằm trong khoảng 09:00–18:00 theo yêu cầu kiểm thử.

Kết quả đối chiếu trường `Thời gian gửi giả lập` trên 300 bản ghi có SMS:

- Số bản ghi có thời gian gửi hợp lệ để kiểm tra: 300/300.
- Thời gian gửi sớm nhất: `2026-11-16 09:00`.
- Thời gian gửi muộn nhất: `2026-11-20 17:53`.
- Số bản ghi nằm ngoài khung giờ 09:00–18:00: **0**.
- Trường `Kết quả kiểm tra khung giờ` ghi nhận đạt: 300/300.

**Kết luận kiểm tra:** Đạt trên dữ liệu mô phỏng được cung cấp. Không phát hiện bản ghi SMS nào có thời gian gửi nằm ngoài khung giờ kiểm tra.

## 5. Kiểm toán Suppression / Opt-out

Đối chiếu các trường `Suppressed` và `Suppression/Opt-out` trên toàn bộ 300 bản ghi có SMS:

- `Suppressed = False`: 300/300.
- `Suppression/Opt-out = Không - được phép gửi`: 300/300.
- Bản ghi có `Suppressed = True` nhưng vẫn có nội dung SMS: 0.
- Bản ghi có trạng thái cho biết không được phép gửi nhưng vẫn có nội dung SMS: 0.

Ngoài ra, 300 bản ghi có SMS đều có các giá trị:

- `Contact_Verified = True`.
- `Contact_Authorized = 1`.
- `Preference_Read_OK = True`.
- `Shared_Contact = False`.
- `Identity_Hold = False`.
- `Outage = False`.

**Kết luận kiểm tra:** Đạt trên dữ liệu mô phỏng. Không phát hiện trường hợp có cờ Suppression hoặc Opt-out nhưng vẫn được ghi nhận gửi SMS.

## 6. Kiểm tra 4 mã mẫu SMS

Dữ liệu có ghi nhận đủ 4 mã mẫu:

| Mã mẫu | Số bản ghi |
| --- | ---: |
| SMS-VN-01 | 75 |
| SMS-VN-02 | 75 |
| SMS-VN-03 | 75 |
| SMS-VN-04 | 75 |
| **Tổng** | **300** |

Cả 300 bản ghi có SMS đều có mã mẫu, không phát hiện bản ghi gửi có mã mẫu bị trống.

## 7. Phân loại các bản ghi không phát sinh SMS

Có 700 bản ghi không có nội dung SMS, gồm:

| Nhãn | Số bản ghi |
| --- | ---: |
| Excluded | 300 |
| NotYetEligible | 200 |
| Unknown | 200 |
| **Tổng** | **700** |

Các lý do được ghi trong cột `Reason` gồm: Source outage, Unclear contact authority, Less than 48h since reminder, Two prior reminders, Stale status, Preference unavailable, Application >7 days, Only 6h inactive, Withdrawn, Completed, Prior episode in 30 days, Awaiting bank, Identity hold, Shared route, No contact authority, Unverified contact, Suppressed và Rejected; ngoài ra có nhóm `Valid stalled applicant`.

Các bản ghi `Unknown` cần được giữ ở trạng thái chưa kết luận, không tự động xem là đủ điều kiện gửi. Việc không phát sinh SMS trên 700 bản ghi này phù hợp với dữ liệu được cung cấp.

## 8. Kiểm tra tính toàn vẹn dữ liệu

- Tổng số dòng dữ liệu: 1.000.
- `Record_ID` trùng: 0.
- `Event_ID` trùng: 0.
- Bản ghi có SMS nhưng thiếu mã mẫu: 0.
- Bản ghi có SMS nhưng không có thời gian gửi hợp lệ: 0.

Các kiểm tra trên không thay thế việc xác minh log hệ thống nguồn, chữ ký số, dấu thời gian hoặc lịch sử thay đổi dữ liệu.

## 9. Kết luận kiểm toán

Dựa trên việc kiểm tra file CSV mô phỏng được cung cấp:

1. Có 300 bản ghi được ghi nhận là Eligible và có SMS; 700 bản ghi còn lại không có nội dung SMS.
2. Cả 300/300 bản ghi có SMS đều được ghi nhận trong khung giờ 09:00–18:00; không phát hiện trường hợp ngoài khung giờ.
3. Không phát hiện bản ghi có cờ `Suppressed = True` hoặc trạng thái Opt-out nhưng vẫn có SMS.
4. Có đủ 4 mã mẫu SMS, mỗi mã xuất hiện 75 lần.
5. Không phát hiện `Record_ID` hoặc `Event_ID` trùng trong dữ liệu đã kiểm tra.

**Kết quả kiểm thử dữ liệu:** Đạt đối với hai kiểm soát có thể xác minh trực tiếp từ CSV: khung giờ gửi và Suppression/Opt-out.
