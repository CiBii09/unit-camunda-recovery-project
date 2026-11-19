import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export const SafetyControls: React.FC = () => {
  const [isQueuePaused, setIsQueuePaused] = useState<boolean>(false);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [lastActionLog, setLastActionLog] = useState<string>('System Active');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const fetchSafetyStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safety/status`);
        if (!res.ok) return;
        const data = await res.json();
        setIsKillSwitchActive(Boolean(data.killSwitchActive));
        setIsQueuePaused(Boolean(data.queuePaused));
        if (data.lastUpdatedAt) {
          const syncedTime = new Date(data.lastUpdatedAt).toLocaleTimeString('vi-VN');
          setLastActionLog(`[${syncedTime}] Synced (${data.lastUpdatedBy || 'System'})`);
        }
      } catch {
        // Giữ nguyên state local khi backend chưa khởi chạy
      }
    };

    fetchSafetyStatus();
  }, []);

  const handleToggleQueuePause = async () => {
    if (isSubmitting) return;
    const nextState = !isQueuePaused;
    const time = new Date().toLocaleTimeString('vi-VN');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/safety/queue-pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paused: nextState,
          reason: nextState ? 'Tạm dừng hàng đợi gửi SMS' : 'Tiếp tục hàng đợi gửi SMS',
          operatorId: 'CB',
        }),
      });
      if (!res.ok) throw new Error('Failed to toggle queue pause');
      const data = await res.json();
      const updatedPaused = Boolean(data.queuePaused ?? nextState);
      setIsQueuePaused(updatedPaused);
      setLastActionLog(
        updatedPaused
          ? `[${time}] Queue Paused${data.auditLogId ? ` (${data.auditLogId})` : ''}`
          : `[${time}] Queue Resumed${data.auditLogId ? ` (${data.auditLogId})` : ''}`
      );
    } catch {
      setIsQueuePaused(nextState);
      setLastActionLog(nextState ? `[${time}] Queue Paused` : `[${time}] Queue Resumed`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmKillSwitch = async () => {
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do dừng khẩn cấp!');
      return;
    }
    if (isSubmitting) return;

    const trimmedReason = reason.trim();
    const time = new Date().toLocaleTimeString('vi-VN');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/safety/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          reason: trimmedReason,
          operatorId: 'CB',
        }),
      });
      if (!res.ok) throw new Error('Failed to activate kill-switch');
      const data = await res.json();
      setIsKillSwitchActive(Boolean(data.killSwitchActive ?? true));
      setIsQueuePaused(true);
      setShowConfirmModal(false);
      setLastActionLog(
        `[${time}] KILL-SWITCH ACTIVE: ${trimmedReason}${data.auditLogId ? ` (${data.auditLogId})` : ''}`
      );
    } catch {
      setIsKillSwitchActive(true);
      setIsQueuePaused(true);
      setShowConfirmModal(false);
      setLastActionLog(`[${time}] KILL-SWITCH ACTIVE: ${trimmedReason}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetKillSwitch = async () => {
    if (!window.confirm('Xác nhận tắt chế độ Kill-Switch?')) return;
    if (isSubmitting) return;

    const time = new Date().toLocaleTimeString('vi-VN');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/safety/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          reason: 'Tắt chế độ Kill-Switch từ giao diện',
          operatorId: 'CB',
        }),
      });
      if (!res.ok) throw new Error('Failed to reset kill-switch');
      const data = await res.json();
      setIsKillSwitchActive(Boolean(data.killSwitchActive ?? false));
      setReason('');
      setLastActionLog(`[${time}] System Reset${data.auditLogId ? ` (${data.auditLogId})` : ''}`);
    } catch {
      setIsKillSwitchActive(false);
      setReason('');
      setLastActionLog(`[${time}] System Reset`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="hidden xl:inline-block text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border">
        {lastActionLog}
      </span>
      <button
        disabled={isKillSwitchActive || isSubmitting}
        onClick={handleToggleQueuePause}
        className={`px-3 py-1.5 rounded text-xs font-semibold border ${
          isQueuePaused ? 'bg-amber-500 text-white' : 'bg-white text-slate-700'
        } disabled:opacity-40`}
      >
        {isQueuePaused ? 'Resume Queue' : 'Queue Pause'}
      </button>
      {!isKillSwitchActive ? (
        <button
          disabled={isSubmitting}
          onClick={() => setShowConfirmModal(true)}
          className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow disabled:opacity-40"
        >
          KILL-SWITCH
        </button>
      ) : (
        <button
          disabled={isSubmitting}
          onClick={handleResetKillSwitch}
          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40"
        >
          Reset
        </button>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white border-2 border-red-500 p-5 rounded-lg max-w-md w-full text-slate-800 shadow-xl">
            <h4 className="text-red-600 font-bold text-base mb-2">Xác nhận Kill-Switch</h4>
            <p className="text-xs text-slate-600 mb-3">Hành động này sẽ chặn toàn bộ lệnh gửi SMS.</p>
            <input
              type="text"
              placeholder="Nhập lý do dừng..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 rounded border text-sm mb-4 outline-none focus:border-red-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 rounded bg-slate-200 text-xs text-slate-700 disabled:opacity-40"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmKillSwitch}
                className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-bold disabled:opacity-40"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};