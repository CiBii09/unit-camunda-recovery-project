import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Inbox,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  appendAuditLog,
  formatVietnamTime,
  getSafetyState,
  SAFETY_SYNC_EVENT,
  SafetyState,
} from '../services/safetyAuditStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

type QueueFilterStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED' | 'ALL';

interface HelpQueueTask {
  task_id?: string;
  id?: string;
  opaque_reference?: string;
  applicant_ref?: string;
  applicant_key?: string;
  application_id?: string;
  masked_phone?: string;
  phone?: string;
  contact_route?: string;
  application_status?: string;
  event_type?: string;
  status?: string;
  priority?: string;
  reason?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  resolution_note?: string;
}

interface FeedbackBanner {
  type: 'success' | 'error';
  message: string;
}

export const StaffHelpQueuePage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<QueueFilterStatus>('OPEN');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [tasks, setTasks] = useState<HelpQueueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [safety, setSafety] = useState<SafetyState>(() => getSafetyState());

  // Cập nhật đồng hồ mỗi giây để tính độ tươi dữ liệu (EVT 07: ngưỡng 60s)
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Đồng bộ trạng thái SafetyControls (Kill-Switch / Queue Pause) từ Dashboard
  useEffect(() => {
    const syncSafety = () => setSafety(getSafetyState());
    window.addEventListener(SAFETY_SYNC_EVENT, syncSafety);
    return () => window.removeEventListener(SAFETY_SYNC_EVENT, syncSafety);
  }, []);

  const getTaskId = (task: HelpQueueTask): string => task.task_id || task.id || '';

  // Chuẩn hóa hiển thị mã tham chiếu ẩn danh (SEC 03 / DAT 01)
  const getOpaqueRef = (task: HelpQueueTask | null): string => {
    if (!task) return '--';
    const rawRef =
      task.opaque_reference ||
      task.applicant_ref ||
      task.applicant_key ||
      task.application_id;
    if (rawRef) return rawRef;
    const id = getTaskId(task);
    return id ? `REF-${id.slice(0, 8).toUpperCase()}` : '--';
  };

  // Chuẩn hóa hiển thị số điện thoại che mờ PII (SEC 03)
  const getMaskedPhone = (task: HelpQueueTask | null): string => {
    if (!task) return '--';
    if (task.masked_phone) return task.masked_phone;
    const rawPhone = task.phone || task.contact_route;
    if (!rawPhone) {
      const id = getTaskId(task).replace(/[^a-zA-Z0-9]/g, '');
      const suffix = id.slice(-3).toUpperCase() || '889';
      return `090****${suffix}`;
    }
    if (rawPhone.includes('*')) return rawPhone;
    return rawPhone.length >= 7
      ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}`
      : '090****XXX';
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/help-queue?status=${statusFilter}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const list: HelpQueueTask[] = Array.isArray(data?.tasks) ? data.tasks : [];
      setTasks(list);

      if (list.length > 0) {
        setSelectedTaskId((prev) => {
          const stillExists = prev && list.some((t) => getTaskId(t) === prev);
          return stillExists ? prev : getTaskId(list[0]);
        });
      } else {
        setSelectedTaskId(null);
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Không thể kết nối Backend API (http://localhost:8000). Vui lòng kiểm tra server.',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return tasks;
    return tasks.filter((t) => {
      const id = getTaskId(t).toLowerCase();
      const ref = getOpaqueRef(t).toLowerCase();
      return id.includes(keyword) || ref.includes(keyword);
    });
  }, [tasks, searchTerm]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return filteredTasks.find((t) => getTaskId(t) === selectedTaskId) || null;
  }, [filteredTasks, selectedTaskId]);

  // Tính tuổi dữ liệu theo giây (EVT 07)
  const freshnessAgeSeconds = useMemo(() => {
    if (!selectedTask?.created_at) return 0;
    const createdMs = new Date(selectedTask.created_at).getTime();
    if (Number.isNaN(createdMs)) return 0;
    return Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  }, [selectedTask, nowMs]);

  const isStaleData = freshnessAgeSeconds > 60;
  const isSystemBlocked = safety.globalKillSwitch || safety.queuePaused;
  const isTaskOpen = selectedTask?.status === 'OPEN';

  const handleResolveTask = async (action: 'RETRY' | 'CANCEL') => {
    if (!selectedTask) return;
    const taskId = getTaskId(selectedTask);
    const opaqueRef = getOpaqueRef(selectedTask);

    if (isSystemBlocked) {
      setFeedback({
        type: 'error',
        message: 'Thao tác bị chặn bởi SafetyControls (Kill-Switch hoặc Queue Pause đang bật).',
      });
      return;
    }

    if (!note.trim()) {
      setFeedback({
        type: 'error',
        message: 'Vui lòng nhập ghi chú xác minh lý do trước khi xử lý ca lỗi (CAM 05 / SEC 04).',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: note.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.detail || `Lỗi xử lý (${response.status})`);
      }

      // Ghi nhận vết kiểm toán chống giả mạo (SEC 04)
      appendAuditLog({
        actor: 'INT 04 Operator',
        action: action === 'RETRY' ? 'TASK_RETRIED' : 'TASK_CANCELLED',
        opaqueRef,
        reason: note.trim(),
        outcome: 'SUCCESS',
      });

      setFeedback({
        type: 'success',
        message:
          action === 'RETRY'
            ? `Đã duyệt gửi lại (RETRY) thành công cho hồ sơ ${opaqueRef}.`
            : `Đã hủy bỏ (CANCEL) ca ngoại lệ cho hồ sơ ${opaqueRef}.`,
      });

      setNote('');
      await fetchTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xử lý nhiệm vụ.';
      setFeedback({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 overflow-y-auto space-y-4">
      {/* Thanh cảnh báo khi SafetyControls đang bật (ARC 07) */}
      {isSystemBlocked && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} />
            <span>
              {safety.globalKillSwitch
                ? 'GLOBAL KILL-SWITCH ĐANG BẬT:'
                : 'HÀNG ĐỢI ĐANG TẠM DỪNG (QUEUE PAUSED):'}{' '}
              Khóa toàn bộ thao tác duyệt gửi lại (Retry) và hủy ca (Cancel) để đảm bảo an toàn.
            </span>
          </div>
          <span className="font-mono text-[11px]">{formatVietnamTime(safety.updatedAt)}</span>
        </div>
      )}

      {/* Thông báo phản hồi thao tác */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Cột trái: Camunda Task List */}
        <div className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
          <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-800 text-sm">Camunda Task List</h3>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {filteredTasks.length}
              </span>
            </div>
            <button
              onClick={fetchTasks}
              disabled={loading}
              title="Làm mới danh sách từ Backend"
              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Bộ lọc trạng thái */}
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg mb-3 text-[11px] font-bold">
            {(['OPEN', 'RESOLVED', 'CANCELLED', 'ALL'] as QueueFilterStatus[]).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`py-1 rounded-md transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative mb-3">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search task ID or opaque reference"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Danh sách thẻ Task */}
          {filteredTasks.length === 0 ? (
            <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-400 min-h-[280px]">
              <Inbox size={36} className="mb-2 stroke-1 text-slate-300" />
              <span className="text-xs font-semibold text-slate-500">
                Không có hồ sơ nào ở trạng thái {statusFilter}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">
                Gửi sự kiện lỗi qua POST /events hoặc đổi bộ lọc trạng thái
              </span>
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[520px] pr-1">
              {filteredTasks.map((task) => {
                const id = getTaskId(task);
                const isSelected = id === selectedTaskId;
                return (
                  <div
                    key={id}
                    onClick={() => {
                      setSelectedTaskId(id);
                      setFeedback(null);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="font-mono text-emerald-700 font-semibold truncate max-w-[170px]">
                        {id}
                      </span>
                      <span
                        className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                          task.status === 'OPEN'
                            ? 'bg-amber-100 text-amber-800'
                            : task.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {task.priority || task.status || 'HIGH'}
                      </span>
                    </div>

                    <div className="text-xs font-extrabold text-slate-800">
                      {task.event_type || task.application_status || 'STEP_SUBMITTED'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Created • {formatVietnamTime(task.created_at)}
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                        {getOpaqueRef(task)}
                      </span>
                      {isSelected && (
                        <span className="text-[11px] font-bold text-emerald-600">Selected</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cột phải: Chi tiết hồ sơ & xử lý */}
        <div className="col-span-8 space-y-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">
                {selectedTask
                  ? `Help Customer — ${
                      selectedTask.event_type ||
                      selectedTask.application_status ||
                      'STEP_SUBMITTED'
                    }`
                  : 'Chọn một nhiệm vụ để bắt đầu xử lý'}
              </h2>
              <p className="text-xs text-slate-500">
                Camunda Task ID:{' '}
                <span className="font-mono">{selectedTask ? getTaskId(selectedTask) : '--'}</span> •
                Status: <strong>{selectedTask?.status || '--'}</strong>
              </p>
            </div>
            {selectedTask && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  selectedTask.status === 'OPEN'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                • {selectedTask.status}
              </span>
            )}
          </div>

          {/* Masked Customer Information (SEC 03) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Lock size={14} className="text-slate-500" /> Masked Customer Information
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                SEC 03 • Strict PII Masked
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-1 font-bold">OPAQUE REF ID</span>
                <span className="font-mono text-sm font-extrabold text-slate-800">
                  {getOpaqueRef(selectedTask)}
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-1 font-bold">MASKED PHONE</span>
                <span className="font-mono text-sm font-extrabold text-slate-800">
                  {getMaskedPhone(selectedTask)}
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-1 font-bold">
                  APPLICATION STATUS
                </span>
                <span className="text-xs font-extrabold text-amber-700">
                  {selectedTask?.application_status || selectedTask?.event_type || '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Data Freshness Indicator (EVT 07 / NFR 04) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-blue-600" /> Data Freshness (60s Gate)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">EVT 07 / NFR 04</span>
            </div>

            {!selectedTask ? (
              <div className="text-xs text-slate-400">Chưa chọn hồ sơ để kiểm tra độ tươi dữ liệu.</div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div
                  className={`px-3.5 py-2 rounded-lg border font-mono text-xs font-extrabold ${
                    isStaleData
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  }`}
                >
                  {isStaleData
                    ? `STALE DATA (Age: ${freshnessAgeSeconds}s > 60s)`
                    : `LIVE DATA (Age: ${freshnessAgeSeconds}s)`}
                </div>
                <p className="text-xs text-slate-600 flex-1">
                  {isStaleData
                    ? 'Trạng thái hồ sơ đã vượt quá ngưỡng 60 giây (EVT 07). Cần xác minh lại trạng thái nguồn trước khi phê duyệt.'
                    : 'Trạng thái hồ sơ nằm trong cửa sổ 60 giây hợp lệ. Được phép thực hiện bước xử lý ngoại lệ.'}
                </p>
              </div>
            )}
          </div>

          {/* Permitted Staff Actions (INT 04 / CAM 05) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">
                Permitted Staff Actions (INT 04 / CAM 05)
              </span>
              <span className="text-[10px] text-slate-400">
                No channel switch around opt-out allowed
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Operator Resolution Note & Evidence (Required for Audit Log) *
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!selectedTask || !isTaskOpen || isSystemBlocked}
                placeholder="Nhập lý do xử lý (ví dụ: Đã đối chiếu trạng thái hồ sơ trên Core Banking, cho phép gửi lại sự kiện)..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleResolveTask('RETRY')}
                disabled={!selectedTask || !isTaskOpen || isSystemBlocked || submitting}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <Play size={14} />
                {submitting ? 'Đang xử lý...' : 'Duyệt gửi lại (Retry)'}
              </button>

              <button
                onClick={() => handleResolveTask('CANCEL')}
                disabled={!selectedTask || !isTaskOpen || isSystemBlocked || submitting}
                className="px-4 py-2 rounded-lg text-xs font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <XCircle size={14} />
                Hủy bỏ ca lỗi (Cancel)
              </button>
            </div>
          </div>

          {/* Latest State Summary & Hold Evidence (M INT 01 / SEC 04) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={14} className="text-blue-500" /> Latest State Summary & Hold Evidence
            </h4>
            {!selectedTask ? (
              <div className="h-14 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400">
                Chọn một nhiệm vụ bên trái để xem lý do SAFE_HOLD và bằng chứng kiểm toán
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="font-bold text-slate-700">Hold Reason: </span>
                  <span className="text-slate-600">
                    {selectedTask.reason || 'Application status not found / SAFE_HOLD triggered'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">Intake Source: </span>
                  <span className="font-mono text-slate-600">
                    {selectedTask.source || 'BANK_EVENT_STREAM'}
                  </span>
                </div>
                {selectedTask.resolution_note && (
                  <div>
                    <span className="font-bold text-emerald-700">Recorded Resolution: </span>
                    <span className="text-slate-700">{selectedTask.resolution_note}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
