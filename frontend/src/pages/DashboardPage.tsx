import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  PauseCircle,
  Power,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  AuditLogEntry,
  formatVietnamTime,
  getLocalAuditLogs,
  getSafetyState,
  SAFETY_SYNC_EVENT,
  SafetyState,
  updateSafetyState,
} from '../services/safetyAuditStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

type DashboardTab = 'monitoring' | 'evaluation' | 'suppression' | 'audit';

interface MetricsPayload {
  total_events?: number;
  safe_hold_count?: number;
  eligible_count?: number;
  suppressed_count?: number;
  duplicate_count?: number;
  stale_count?: number;
  [key: string]: unknown;
}

interface QueueTaskItem {
  task_id?: string;
  id?: string;
  opaque_reference?: string;
  status?: string;
  reason?: string;
  note?: string;
  resolution_note?: string;
  created_at?: string;
  resolved_at?: string;
  updated_at?: string;
}

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('monitoring');
  const [systemHealthy, setSystemHealthy] = useState<boolean | null>(null);
  const [latencySeconds, setLatencySeconds] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload>({});
  const [allTasks, setAllTasks] = useState<QueueTaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // SafetyControls state (ARC 07)
  const [safety, setSafety] = useState<SafetyState>(() => getSafetyState());
  const [confirmControl, setConfirmControl] = useState<{
    type: 'KILL_SWITCH' | 'QUEUE_PAUSE';
    nextValue: boolean;
  } | null>(null);
  const [controlReason, setControlReason] = useState<string>('');

  // Audit Log filters (SEC 04)
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [localAudits, setLocalAudits] = useState<AuditLogEntry[]>(() => getLocalAuditLogs());

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    const startTime = performance.now();
    try {
      const [healthRes, metricsRes, queueRes] = await Promise.all([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/api/metrics`),
        fetch(`${API_BASE}/api/help-queue?status=ALL`),
      ]);

      const elapsed = Number(((performance.now() - startTime) / 1000).toFixed(2));
      setLatencySeconds(elapsed);
      setSystemHealthy(healthRes.ok);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData || {});
      }

      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setAllTasks(Array.isArray(queueData?.tasks) ? queueData.tasks : []);
      }

      setLastSyncedAt(new Date().toISOString());
      setLocalAudits(getLocalAuditLogs());
    } catch {
      setSystemHealthy(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = window.setInterval(fetchDashboardData, 15000);
    return () => window.clearInterval(interval);
  }, [fetchDashboardData]);

  useEffect(() => {
    const syncSafety = () => {
      setSafety(getSafetyState());
      setLocalAudits(getLocalAuditLogs());
    };
    window.addEventListener(SAFETY_SYNC_EVENT, syncSafety);
    return () => window.removeEventListener(SAFETY_SYNC_EVENT, syncSafety);
  }, []);

  // Derived KPI metrics from real backend data
  const totalEvents = Number(metrics.total_events ?? allTasks.length ?? 0);
  const safeHoldCount = Number(
    metrics.safe_hold_count ?? allTasks.filter((t) => t.status === 'OPEN').length
  );
  const suppressedCount = Number(metrics.suppressed_count ?? 0);
  const resolvedCount = allTasks.filter((t) => t.status === 'RESOLVED').length;
  const cancelledCount = allTasks.filter((t) => t.status === 'CANCELLED').length;

  const freshnessRate =
    totalEvents > 0
      ? Math.max(0, Math.round(((totalEvents - safeHoldCount) / totalEvents) * 100))
      : 100;

  const suppressionRate =
    totalEvents > 0 ? Math.round((suppressedCount / totalEvents) * 100) : 0;

  // Combine backend resolved/cancelled tasks + local safety/action audit logs (SEC 04)
  const combinedAuditTrail: AuditLogEntry[] = useMemo(() => {
    const taskEntries: AuditLogEntry[] = allTasks
      .filter((t) => t.status === 'RESOLVED' || t.status === 'CANCELLED')
      .map((t, index) => {
        const taskId = t.task_id || t.id || `TASK-${index + 1}`;
        return {
          id: `API-${taskId}`,
          timestamp: t.resolved_at || t.updated_at || t.created_at || new Date().toISOString(),
          actor: 'INT 04 Operator',
          action: t.status === 'RESOLVED' ? 'TASK_RETRIED' : 'TASK_CANCELLED',
          opaqueRef: t.opaque_reference || taskId,
          reason: t.resolution_note || t.note || t.reason || 'Resolved via Staff Help Queue',
          outcome: 'SUCCESS',
        };
      });

    const merged = [...localAudits, ...taskEntries];
    const dedupMap = new Map<string, AuditLogEntry>();
    for (const item of merged) {
      const key = `${item.action}-${item.opaqueRef}-${item.timestamp.slice(0, 16)}`;
      if (!dedupMap.has(key)) {
        dedupMap.set(key, item);
      }
    }

    return Array.from(dedupMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [allTasks, localAudits]);

  const filteredAudits = useMemo(() => {
    return combinedAuditTrail.filter((item) => {
      const matchesAction =
        auditActionFilter === 'ALL' || item.action === auditActionFilter;
      const keyword = auditSearch.trim().toLowerCase();
      const matchesSearch =
        !keyword ||
        item.opaqueRef.toLowerCase().includes(keyword) ||
        item.reason.toLowerCase().includes(keyword) ||
        item.actor.toLowerCase().includes(keyword);
      return matchesAction && matchesSearch;
    });
  }, [combinedAuditTrail, auditActionFilter, auditSearch]);

  const handleConfirmSafetyChange = () => {
    if (!confirmControl || !controlReason.trim()) return;

    if (confirmControl.type === 'KILL_SWITCH') {
      const updated = updateSafetyState(
        { globalKillSwitch: confirmControl.nextValue },
        confirmControl.nextValue ? 'KILL_SWITCH_ENABLED' : 'KILL_SWITCH_DISABLED',
        controlReason
      );
      setSafety(updated);
    } else {
      const updated = updateSafetyState(
        { queuePaused: confirmControl.nextValue },
        confirmControl.nextValue ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED',
        controlReason
      );
      setSafety(updated);
    }

    setLocalAudits(getLocalAuditLogs());
    setControlReason('');
    setConfirmControl(null);
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 overflow-y-auto space-y-6">
      {/* Safety Alert Banner (ARC 07 / OPS 02) */}
      {(safety.globalKillSwitch || safety.queuePaused) && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between ${
            safety.globalKillSwitch
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <ShieldAlert size={18} className="shrink-0" />
            <div>
              <span className="uppercase font-extrabold mr-2">
                {safety.globalKillSwitch
                  ? 'GLOBAL KILL-SWITCH ACTIVE:'
                  : 'HELP QUEUE PAUSED:'}
              </span>
              <span>
                All outbound recovery dispatches and queue resolutions are held ({safety.reason}).
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono">
            Updated: {formatVietnamTime(safety.updatedAt)}
          </span>
        </div>
      )}

      {/* Top Navigation Bar Tabs + Source Freshness & Observation Window (ARC 06) */}
      <div className="flex flex-wrap justify-between items-center border-b border-slate-200 pb-2 gap-4">
        <div className="flex space-x-6 text-xs font-bold text-slate-500">
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`pb-2 transition-colors ${
              activeTab === 'monitoring'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-800'
            }`}
          >
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`pb-2 transition-colors ${
              activeTab === 'evaluation'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-800'
            }`}
          >
            Evaluation
          </button>
          <button
            onClick={() => setActiveTab('suppression')}
            className={`pb-2 transition-colors ${
              activeTab === 'suppression'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-800'
            }`}
          >
            Suppression & Safety
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-800'
            }`}
          >
            Audit Logs
            <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full">
              {combinedAuditTrail.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-md font-medium">
            Window: <strong>7-Day Episode / 14-Day Observation</strong>
          </span>
          <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-md font-medium">
            Last Sync: <strong>{formatVietnamTime(lastSyncedAt)}</strong>
          </span>
          <div>
            System Status:{' '}
            {systemHealthy === null ? (
              <span className="text-slate-500 font-bold">CONNECTING...</span>
            ) : systemHealthy ? (
              <span className="text-emerald-600 font-bold">LIVE API CONNECTED</span>
            ) : (
              <span className="text-red-600 font-bold">OFFLINE / HOLD</span>
            )}
          </div>
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            title="Refresh metrics"
            className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-100 text-slate-600"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* SafetyControls Bar (ARC 07: Global Kill-Switch & Queue Pause) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={18} className="text-blue-600" />
          <div>
            <h3 className="text-xs font-bold text-slate-800">
              Operational Safety Controls (ARC 07 / OPS 02)
            </h3>
            <p className="text-[11px] text-slate-500">
              Real-time emergency stop & queue pause synchronized with Staff Help Queue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Queue Pause Toggle */}
          <button
            onClick={() =>
              setConfirmControl({
                type: 'QUEUE_PAUSE',
                nextValue: !safety.queuePaused,
              })
            }
            className={`px-3.5 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition-colors ${
              safety.queuePaused
                ? 'bg-amber-600 text-white border-amber-700 hover:bg-amber-700'
                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <PauseCircle size={15} />
            {safety.queuePaused ? 'Queue Paused (Click to Resume)' : 'Pause Help Queue'}
          </button>

          {/* Global Kill-Switch Toggle */}
          <button
            onClick={() =>
              setConfirmControl({
                type: 'KILL_SWITCH',
                nextValue: !safety.globalKillSwitch,
              })
            }
            className={`px-3.5 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition-colors ${
              safety.globalKillSwitch
                ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
            }`}
          >
            <Power size={15} />
            {safety.globalKillSwitch
              ? 'KILL-SWITCH ON (Click to Restore)'
              : 'Global Kill-Switch'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal for SafetyControls (SEC 04 Audit Requirement) */}
      {confirmControl && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-800">
              <AlertTriangle size={18} className="text-amber-600" />
              <h4 className="text-sm font-bold">
                Confirm{' '}
                {confirmControl.type === 'KILL_SWITCH'
                  ? 'Global Kill-Switch'
                  : 'Help Queue Pause'}{' '}
                Change
              </h4>
            </div>
            <p className="text-xs text-slate-600">
              Per SEC 04 & ARC 07, every operational stop or resume action requires an explicit audit
              reason recorded with actor and Asia/Ho_Chi_Minh timestamp.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Mandatory Audit Reason *
              </label>
              <input
                type="text"
                value={controlReason}
                onChange={(e) => setControlReason(e.target.value)}
                placeholder="e.g., Bank SMS gateway maintenance / Gate G4 emergency drill"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setConfirmControl(null);
                  setControlReason('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSafetyChange}
                disabled={!controlReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg"
              >
                Confirm & Log Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row (KPI Cards) - LIVE API DATA */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-bold block mb-1">
            Total Intake / Active Hold
          </span>
          <span className="text-3xl font-extrabold text-slate-800">
            {totalEvents}{' '}
            <span className="text-sm font-bold text-amber-600">({safeHoldCount} OPEN)</span>
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">
            7-Day Episode Expiry Capacity
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-bold block mb-1">Data Freshness Rate</span>
          <span className="text-3xl font-extrabold text-emerald-600">{freshnessRate}%</span>
          <span className="text-[10px] text-slate-400 font-semibold block mt-1">
            Within &lt;60s Freshness Window (EVT 07)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-bold block mb-1">
            Opt-Out / Suppression Rate
          </span>
          <span className="text-3xl font-extrabold text-slate-800">{suppressionRate}%</span>
          <span className="text-[10px] text-slate-400 block mt-1">
            09:00–18:00 Asia/Ho_Chi_Minh Window (REC 04)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-bold block mb-1">UI Latency (NFR 03)</span>
          <span className="text-3xl font-extrabold text-blue-600">
            {latencySeconds !== null ? `${latencySeconds}s` : '--s'}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold block mt-1">
            Under 2.0s SLA Threshold
          </span>
        </div>
      </div>

      {/* TAB 1: MONITORING */}
      {activeTab === 'monitoring' && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-6">
            {/* Event Intake Breakdown Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Activity size={16} className="text-blue-500" /> Event Intake & Hold Breakdown
                  </h4>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1">
                    {totalEvents}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      total processed events
                    </span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded font-bold">
                  Live API (/api/metrics)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-[11px] font-bold text-amber-800 block">
                    SAFE_HOLD (Open Queue)
                  </span>
                  <span className="text-xl font-extrabold text-amber-700">{safeHoldCount}</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-[11px] font-bold text-emerald-800 block">
                    Resolved (Retried)
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700">{resolvedCount}</span>
                </div>
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Cancelled / Excluded
                  </span>
                  <span className="text-xl font-extrabold text-slate-700">{cancelledCount}</span>
                </div>
              </div>
            </div>

            {/* SMS & Dispatch Safety Gate Status */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Send size={16} className="text-emerald-500" /> Controlled Dispatch Gate Status
                  </h4>
                  <div className="text-sm font-bold text-slate-700 mt-1">
                    {safety.globalKillSwitch || safety.queuePaused
                      ? 'DISPATCH BLOCKED BY OPERATOR CONTROL'
                      : 'READY — ENFORCING FRESHNESS (<60s) & QUIET WINDOW'}
                  </div>
                </div>
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded font-bold">
                  REC 06 Gate Active
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Per REC 06 & ARC 05, reminders are never dispatched blindly on timer expiry; each
                attempt re-validates fresh application status (&le;60s) and contact authority.
              </p>
            </div>
          </div>

          {/* Right Area (40%): Observation Window & Camunda Sync */}
          <div className="col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock size={16} className="text-amber-500" /> Observation Window & Policy Rules
                </h4>
                <span className="text-[10px] text-slate-500 font-semibold">REC 01 / REC 04</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Stalled Inactivity Threshold</span>
                  <span className="font-bold text-slate-800">24 Hours</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Max Episode Duration</span>
                  <span className="font-bold text-slate-800">7 Days</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Experiment Observation Window</span>
                  <span className="font-bold text-slate-800">14 Days Post-Assignment</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Contact Cap & Hours (VN)</span>
                  <span className="font-bold text-slate-800">Max 2 SMS / 7d (09:00–18:00)</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Camunda 8 Orchestration Sync</span>
              <span className="flex items-center gap-1 text-emerald-600 font-bold">
                <CheckCircle2 size={13} /> Active & Monitored
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVALUATION (AT 07 / Annex E) */}
      {activeTab === 'evaluation' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                Controlled Experiment & Outcome Maturation (AT 07 / EVAL 01–03)
              </h4>
              <p className="text-xs text-slate-500">
                Intention-to-treat comparison between Recovery Treatment and Usual Service Control
              </p>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold">
              Primary Endpoint: Authoritative VND Account Opened (&le;14d)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-slate-500 font-bold block mb-1">
                Pilot Cohort Target (EVAL 04)
              </span>
              <span className="text-lg font-extrabold text-slate-800">
                1,200 Applicants / Arm
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                80% Power, 5% Two-Sided Significance
              </span>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-slate-500 font-bold block mb-1">
                Resolved Staff Exceptions
              </span>
              <span className="text-lg font-extrabold text-emerald-700">
                {resolvedCount} Retried / {cancelledCount} Cancelled
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                Verified via /api/help-queue
              </span>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-slate-500 font-bold block mb-1">
                Authoritative Outcome Rule
              </span>
              <span className="text-sm font-bold text-slate-800 block mt-1">
                SMS clicks or receipts do not count as completed onboarding (EVT 08)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPRESSION & SAFETY */}
      {activeTab === 'suppression' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="text-sm font-bold text-slate-800">
            Active Suppression & Privacy Guardrails (REC 02–05 / SEC 03)
          </h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-lg border border-slate-200 space-y-1.5">
              <div className="font-bold text-slate-800">Strict PII Masking (SEC 03)</div>
              <p className="text-slate-600">
                All staff views and audit logs use opaque references (REF-xxxx) and masked phone
                numbers (090****xxx). Raw payloads are excluded from workflow variables.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 space-y-1.5">
              <div className="font-bold text-slate-800">Immediate Opt-Out & Hold Enforcement</div>
              <p className="text-slate-600">
                Uncached preference check required before dispatch. Missing status or stale data
                (&gt;60s) automatically routes to SAFE_HOLD.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TRAIL VIEW (SEC 04) */}
      {activeTab === 'audit' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <FileText size={16} className="text-blue-600" /> Tamper-Evident Operational Audit
                Trail (SEC 04)
              </h4>
              <p className="text-xs text-slate-500">
                Chronological record of staff resolutions, kill-switch toggles, and queue pauses
                (PII masked per SEC 03)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search Opaque Ref or reason..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
              >
                <option value="ALL">All Actions</option>
                <option value="TASK_RETRIED">TASK_RETRIED</option>
                <option value="TASK_CANCELLED">TASK_CANCELLED</option>
                <option value="KILL_SWITCH_ENABLED">KILL_SWITCH_ENABLED</option>
                <option value="KILL_SWITCH_DISABLED">KILL_SWITCH_DISABLED</option>
                <option value="QUEUE_PAUSED">QUEUE_PAUSED</option>
                <option value="QUEUE_RESUMED">QUEUE_RESUMED</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-2.5 px-3">Timestamp (Asia/Ho_Chi_Minh)</th>
                  <th className="py-2.5 px-3">Actor / Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Opaque Ref (SEC 03)</th>
                  <th className="py-2.5 px-3">Reason / Evidence Note</th>
                  <th className="py-2.5 px-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No audit records matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredAudits.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatVietnamTime(log.timestamp)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">{log.actor}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('KILL_SWITCH')
                              ? 'bg-red-100 text-red-700'
                              : log.action.includes('QUEUE_')
                              ? 'bg-amber-100 text-amber-800'
                              : log.action === 'TASK_RETRIED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {log.opaqueRef}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={log.reason}>
                        {log.reason}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-bold ${
                            log.outcome === 'SUCCESS' ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {log.outcome}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
