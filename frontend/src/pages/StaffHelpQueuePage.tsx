import React, { useState, useEffect } from 'react';
import { DataFreshnessGauge } from '../components/helpQueue/DataFreshnessGauge';
import { PermittedActions } from '../components/helpQueue/PermittedActions';
import {
  Lock,
  RefreshCw,
  Clock,
  CheckCircle,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Send,
  XCircle,
} from 'lucide-react';
import { HelpQueueTask } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const StaffHelpQueuePage: React.FC = () => {
  const [tasks, setTasks] = useState<HelpQueueTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<HelpQueueTask | null>(null);
  const [staffNote, setStaffNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State lưu từ khóa tìm kiếm & kiểu sắp xếp
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');

  // 1. Hàm gọi API thật lấy danh sách Help Queue (GET /api/help-queue)
  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/help-queue?status=OPEN`);
      if (response.ok) {
        const data = await response.json();
        const rawTasks = data.tasks || [];

        // Ánh xạ dữ liệu từ Backend (help_queue_service.py) sang cấu trúc UI
        const mappedTasks: HelpQueueTask[] = rawTasks.map((t: any) => ({
          id: t.id,
          opaqueRefId: t.opaqueRef || 'REF-UNKNOWN',
          maskedPhone: '090****' + (t.opaqueRef ? t.opaqueRef.slice(-3) : '888'),
          priority: 'HIGH',
          episodeStatus: t.event_type || 'SAFE_HOLD',
          createdAt: t.created_at
            ? new Date(t.created_at).toLocaleTimeString('vi-VN')
            : 'Just now',
          age: t.age_seconds !== null && t.age_seconds !== undefined ? Math.floor(t.age_seconds) : 0,
          latestSummary: t.reason || 'Staff intervention required',
        }));

        setTasks(mappedTasks);
        setSelectedTask((prev) => {
          if (mappedTasks.length === 0) return null;
          if (!prev) return mappedTasks[0];
          const found = mappedTasks.find((item) => item.id === prev.id);
          return found || mappedTasks[0];
        });
      }
    } catch (error) {
      console.error('Lỗi khi tải danh sách Staff Help Queue:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // 2. Tự động đếm tăng tuổi dữ liệu (age) mỗi 1 giây để DataFreshnessGauge cập nhật real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setTasks((prevTasks) =>
        prevTasks.map((t) => ({ ...t, age: t.age + 1 }))
      );
      setSelectedTask((prev) =>
        prev ? { ...prev, age: prev.age + 1 } : null
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Lọc danh sách task theo Task ID hoặc Opaque Reference ID
  const filteredTasks = tasks
    .filter((task) => {
      const keyword = searchQuery.trim().toLowerCase();
      if (!keyword) return true;
      return (
        task.id.toLowerCase().includes(keyword) ||
        task.opaqueRefId.toLowerCase().includes(keyword)
      );
    })
    .sort((a, b) => (sortOrder === 'oldest' ? b.age - a.age : a.age - b.age));

  // 3. Hàm gọi API xử lý tác vụ: Duyệt gửi lại (RETRY) hoặc Hủy bỏ (CANCEL) kèm ghi chú
  const handleResolveTask = async (taskId: string, action: 'RETRY' | 'CANCEL') => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          note: staffNote.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.resolved) {
          alert(
            action === 'RETRY'
              ? 'Đã duyệt gửi lại thành công! Hồ sơ đã được giải quyết.'
              : 'Đã hủy bỏ hồ sơ thành công!'
          );
          setStaffNote('');
          await fetchTasks(); // Tải lại danh sách thật từ Backend
        } else {
          alert(`Hệ thống đã thử gửi lại nhưng hồ sơ vẫn giữ trạng thái OPEN: ${result.reason}`);
          await fetchTasks();
        }
      } else {
        alert('Có lỗi xảy ra khi gửi yêu cầu xử lý lên Backend!');
      }
    } catch (error) {
      console.error('Lỗi kết nối API resolve:', error);
      alert('Không thể kết nối tới Backend (cổng 8000).');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = () => {
    setSearchQuery('');
    fetchTasks();
  };

  return (
    <div className="flex-1 grid grid-cols-12 bg-slate-50/70 overflow-hidden h-full">
      {/* CỘT TRÁI: Camunda Task List */}
      <div className="col-span-4 bg-white border-r border-slate-200 p-5 flex flex-col h-full overflow-hidden">
        {/* Header của danh sách */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 text-base">Camunda Task List</h3>
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-md">
                {tasks.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Assigned to your team (Live API)</p>
          </div>
          <button
            onClick={handleRefresh}
            title="Tải lại danh sách từ Backend"
            className="p-2 text-slate-500 hover:text-emerald-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Thanh tìm kiếm */}
        <div className="relative mb-4">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search task ID or opaque reference"
            className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Thanh tiêu đề phụ: OPEN TASKS & Oldest first */}
        <div className="flex justify-between items-center text-[11px] mb-3">
          <span className="font-bold text-slate-400 tracking-wider uppercase">OPEN TASKS</span>
          <button
            onClick={() => setSortOrder(sortOrder === 'oldest' ? 'newest' : 'oldest')}
            className="flex items-center gap-1 text-slate-600 font-medium hover:text-slate-900"
          >
            <span>{sortOrder === 'oldest' ? 'Oldest first' : 'Newest first'}</span>
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Danh sách các thẻ Task */}
        <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
          {filteredTasks.length === 0 ? (
            <div className="h-48 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-400">
              {tasks.length === 0 ? (
                <>
                  <CheckCircle size={28} className="mb-2 text-emerald-500" />
                  <span className="text-xs font-semibold text-slate-600">
                    Không có hồ sơ lỗi nào đang chờ (OPEN)!
                  </span>
                  <button
                    onClick={handleRefresh}
                    className="mt-2 text-[11px] text-emerald-600 underline"
                  >
                    Làm mới danh sách
                  </button>
                </>
              ) : (
                <>
                  <Search size={24} className="mb-2 text-slate-300" />
                  <span className="text-xs font-semibold text-slate-600">
                    Không tìm thấy "{searchQuery}"
                  </span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-1.5 text-[11px] text-emerald-600 underline"
                  >
                    Xóa bộ lọc tìm kiếm
                  </button>
                </>
              )}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isSelected = selectedTask?.id === task.id;
              return (
                <div
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setStaffNote('');
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/35 shadow-sm'
                      : 'border-slate-200 hover:border-emerald-300 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={`font-mono text-xs font-bold truncate max-w-[180px] ${
                        isSelected ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {task.id}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      {task.priority}
                    </span>
                  </div>

                  <div className="text-xs text-slate-800 font-bold mb-1">
                    {task.episodeStatus}
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-2.5">
                    <span>Created • {task.createdAt}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {task.opaqueRefId}
                    </span>
                    {isSelected ? (
                      <span className="text-[11px] font-bold text-emerald-600">Selected</span>
                    ) : (
                      <span
                        className={`text-[10px] font-semibold ${
                          task.age > 60 ? 'text-red-500 font-bold' : 'text-slate-400'
                        }`}
                      >
                        Age: {task.age}s
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Chân trang danh sách Task */}
        <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <span>
            Showing {filteredTasks.length} of {tasks.length} open tasks
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled
              className="p-1.5 border border-slate-200 rounded-md text-slate-300 cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled
              className="p-1.5 border border-slate-200 rounded-md text-slate-400 hover:bg-slate-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* CỘT PHẢI: Customer Detail Panel */}
      <div className="col-span-8 p-6 space-y-5 overflow-y-auto">
        {/* Header chi tiết Task */}
        <div className="flex justify-between items-start">
          <div>
            <span className="font-mono text-xs font-bold text-emerald-600 block mb-1">
              {selectedTask?.id ?? 'NO-TASK'}
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              {selectedTask
                ? `Help Customer — ${selectedTask.episodeStatus}`
                : 'Chọn một nhiệm vụ để bắt đầu xử lý'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {selectedTask && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                OPEN
              </span>
            )}
          </div>
        </div>

        {/* Khung 1: Masked Customer Information */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-600" /> Masked customer information
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md font-medium">
              <Lock size={11} /> SEC 03 · Private
            </span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 py-1">
            <div className="pr-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
                OPAQUE REFERENCE
              </span>
              <span className="font-mono text-base font-bold text-slate-900">
                {selectedTask?.opaqueRefId ?? '--'}
              </span>
            </div>

            <div className="px-6">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
                MASKED PHONE NUMBER
              </span>
              <span className="font-mono text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Lock size={14} className="text-slate-400" />
                {selectedTask?.maskedPhone ?? '--'}
              </span>
            </div>

            <div className="pl-6">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-semibold">
                APPLICATION STATUS
              </span>
              {selectedTask ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                  {selectedTask.episodeStatus}
                </span>
              ) : (
                <span className="text-xs text-slate-400">--</span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
            Only masked identifiers are available in this workspace.
          </p>
        </div>

        {/* Khung 2: Data Freshness (Truyền prop age động) */}
        <DataFreshnessGauge age={selectedTask ? selectedTask.age : 0} />

        {/* Khung 3: Thao tác xử lý của nhân viên (Duyệt gửi lại / Hủy bỏ / Ghi chú) */}
        {selectedTask && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-slate-800">
                Staff Resolution &amp; Notes
              </h4>
              <span className="font-mono text-[11px] text-slate-400">
                POST /api/tasks/{'{id}'}/resolve
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Ghi chú xử lý ca lỗi (Resolution Note)
              </label>
              <textarea
                rows={2}
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
                placeholder="Nhập lý do duyệt gửi lại hoặc nguyên nhân hủy bỏ hồ sơ..."
                className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                disabled={isSubmitting}
                onClick={() => handleResolveTask(selectedTask.id, 'RETRY')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <Send size={13} />
                <span>Duyệt gửi lại (Retry)</span>
              </button>

              <button
                disabled={isSubmitting}
                onClick={() => handleResolveTask(selectedTask.id, 'CANCEL')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <XCircle size={13} />
                <span>Hủy bỏ ca lỗi (Cancel)</span>
              </button>
            </div>
          </div>
        )}

        {/* Khung 4: Permitted Actions */}
        <PermittedActions />

        {/* Khung 5: Latest task activity */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock size={14} className="text-slate-500" /> Latest task activity
            </h4>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono text-slate-400">
                {selectedTask?.createdAt ?? '--:--'}
              </span>
              <span className="font-bold text-slate-800">Help task created</span>
              <span className="text-slate-500">
                {selectedTask
                  ? selectedTask.latestSummary
                  : 'Vui lòng chọn một nhiệm vụ ở danh sách bên trái để xem chi tiết.'}
              </span>
            </div>
          </div>

          <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-emerald-600 shrink-0 ml-4">
            <span>View audit trail</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Footer metadata */}
        <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
          <span>Source: FastAPI Backend · Assigned group: Staff Operations</span>
          <span className="inline-flex items-center gap-1">
            <Lock size={11} /> Privacy controls enforced
          </span>
        </div>
      </div>
    </div>
  );
};
