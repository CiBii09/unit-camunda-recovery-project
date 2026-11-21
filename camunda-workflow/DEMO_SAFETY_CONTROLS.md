# Chạy demo Kill-Switch / Queue Pause và chụp minh chứng

Các bước này chạy được trên Windows PowerShell. Cần Java 17, Python với FastAPI/Uvicorn, và Node.js.

## 1. Chạy backend safety API

Mở Terminal 1:

```powershell
Set-Location C:\unit-camunda-recovery-project\backend
$env:SAFETY_CONTROLS_DB_PATH = "$PWD\data\safety-demo.db"
python -m uvicorn src.api:app --host 127.0.0.1 --port 8080
```

Giữ terminal đang chạy. Có thể kiểm tra trạng thái từ Terminal 2:

```powershell
$base = 'http://localhost:8080/api/v1/safety'
Invoke-RestMethod "$base/status" | Format-List
```

## 2. (Không bắt buộc) Chạy mock SMS gateway và giao diện

Để chụp màn hình có các nút điều khiển, mở Terminal 2:

```powershell
Set-Location C:\unit-camunda-recovery-project
node mock-gateway\server.js
```

Mở Terminal 3 để chạy frontend:

```powershell
Set-Location C:\unit-camunda-recovery-project\frontend
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal (thường là `http://localhost:5173`). Bật Kill-Switch từ Safety Controls; API sẽ bật Queue Pause cùng lúc. Reset Kill-Switch không tự mở queue — bấm Resume Queue riêng để tiếp tục.

## 3. Tạo log worker cho 1.000 bản ghi

Mở Terminal 4. Đây là test mô phỏng worker an toàn, không cần Zeebe broker, không gửi SMS thật:

```powershell
Set-Location C:\unit-camunda-recovery-project\camunda-workflow\camunda-recovery-worker\camunda-recovery-worker
.\gradlew.bat test --tests com.unit.worker.SafetyControlsE2ETests --info 2>&1 |
  Select-String 'SafetyControlsE2ETests|SAFETY_CONTROL event=|E2E_SAFETY_RESULT|BUILD SUCCESSFUL' |
  Tee-Object -FilePath ..\..\tests\safety-controls-e2e.log
```

Log mong đợi:

```text
SAFETY_CONTROL event=KILL_SWITCH_ON held=200 sends_while_active=0
SAFETY_CONTROL event=QUEUE_PAUSE_ON held=200 sends_while_paused=0
SAFETY_CONTROL event=CONTROLS_RESET resumed_held_jobs=400
E2E_SAFETY_RESULT total=1000 sent_before_pause=400 kill_switch_held=200 queue_pause_held=200 sent_after_resume=400 total_sent=1000 gateway_calls_while_blocked=0
BUILD SUCCESSFUL
```

Chụp ảnh terminal sau khi chạy lệnh để thấy trạng thái Kill-Switch, số job được giữ, không có lần gọi gateway khi bị chặn, và các job được tiếp tục sau reset. Có thể mở log đã lưu bằng:

```powershell
Get-Content C:\unit-camunda-recovery-project\camunda-workflow\tests\safety-controls-e2e.log
```

## 4. Chụp riêng phản hồi bật/tắt API

Sau khi chạy backend, chạy các lệnh sau trong PowerShell. Chụp phần output của từng bước để làm minh chứng trạng thái:

```powershell
$base = 'http://localhost:8080/api/v1/safety'

$enable = @{ enabled = $true; reason = 'Demo Kill-Switch'; operatorId = 'DEMO' } |
  ConvertTo-Json
Invoke-RestMethod "$base/kill-switch" -Method Post -ContentType 'application/json' -Body $enable |
  Format-List
Invoke-RestMethod "$base/status" | Format-List

$disable = @{ enabled = $false; reason = 'Demo reset'; operatorId = 'DEMO' } |
  ConvertTo-Json
Invoke-RestMethod "$base/kill-switch" -Method Post -ContentType 'application/json' -Body $disable |
  Format-List

$resume = @{ paused = $false; reason = 'Demo resume'; operatorId = 'DEMO' } |
  ConvertTo-Json
Invoke-RestMethod "$base/queue-pause" -Method Post -ContentType 'application/json' -Body $resume |
  Format-List
Invoke-RestMethod "$base/status" | Format-List
```

## Phạm vi của minh chứng

`SafetyControlsE2ETests` thực thi 1.000 job qua worker với trạng thái safety/gateway mock và chứng minh worker dừng dispatch, giữ process ở Safe Hold, rồi thử lại khi cả hai control đã mở. Bước API/UI phía trên chứng minh backend nhận bật/tắt thật và lưu trạng thái. Hai bước chạy độc lập; log worker hiện tại không phải log của một quy trình đang deploy trên Zeebe thật. Không tuyên bố đã chạy E2E trên engine thật nếu chưa deploy BPMN và tạo process instance trên Camunda.
