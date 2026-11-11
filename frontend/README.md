# HƯỚNG DẪN KHỞI CHẠY GIAO DIỆN LÊN TRÌNH DUYỆT (BANK-AI-06)

> **Dự án:** UNIT Vietnam - Onboarding Abandonment Recovery System (Camunda 8)  
> **Phân nhóm:** Frontend & Task Workspace Developer (Thành viên thứ 9)

---

## GIỚI THIỆU TRUY CẬP

Dự án đã được cấu hình hoàn chỉnh bộ mã nguồn tĩnh (Static UI) chuẩn tuyệt đối theo thiết kế mẫu Figma cho 2 màn hình:
1. **Staff Help Queue (INT 04):** Màn hình xử lý task hàng chờ của Staff (đã để sẵn các vùng trống *Empty States* chờ đấu nối API từ backend).
2. **System Recovery Dashboard:** Màn hình giám sát các chỉ số KPI (30,000 Active Episodes, 99.8% Data Freshness), biểu đồ sóng real-time, danh sách Observation Timers và nút **Kill-Switch Emergency Pause (Đỏ rực)**.

---

## PHẦN 1: CHUẨN BỊ MÔI TRƯỜNG (PREREQUISITES)

Trước khi chạy, hãy đảm bảo máy tính của bạn đã cài đặt:
- **Node.js**: Phiên bản `18.x` hoặc cao hơn ([Tải Node.js tại đây](https://nodejs.org/)).
- **VS Code**: Trình biên dịch mã nguồn khuyến nghị.

---

##  PHẦN 2: 3 BƯỚC KHỞI CHẠY LÊN TRÌNH DUYỆT (QUICK START)

### Bước 1: Mở dự án và cài đặt các thư viện (Dependencies)
1. Mở thư mục gốc `Frontend/` bằng **VS Code**.
2. Mở cửa sổ Terminal trong VS Code (Nhấn tổ hợp phím `Ctrl + ~` hoặc chọn Menu **Terminal -> New Terminal**).
3. Gõ lệnh cài đặt gói phụ thuộc:
   ```bash
   npm install

### Bước 2: Tại cửa sổ Terminal của VS Code, bạn gõ chính xác câu lệnh sau rồi nhấn Enter:
  npm run dev 

### Bước 3: Mở trình duyệt và xem giao diện 
1. Khi màn hình Terminal xuất hiện thông báo chạy thành công:
2. Bạn mở trình duyệt Chrome hoặc Edge, gõ hoặc click vào đường dẫn bên dưới để xem giao diện trực quan: