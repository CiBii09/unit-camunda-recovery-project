import React, { useState, useEffect } from 'react';
import {
  Clock,
  ShieldCheck,
  AlertOctagon,
  LayoutGrid,
  Activity,
  Ban,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { MOCK_DASHBOARD_METRICS } from '../mockData';
import { DashboardMetrics } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>(MOCK_DASHBOARD_METRICS);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<string>('Monitoring');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Hàm gọi API lấy dữ liệu thật từ Backend (GET /api/metrics)
  const fetchMetrics = async () => {
    try {
      const startTime = performance.now();
      const response = await fetch(`${API_BASE_URL}/api/metrics`);
      if (response.ok) {
        const data = await response.json();
        const latencyMs = Math.round(performance.now() - startTime);

        const totalEvents = data.total_events ?? 0;
        const staleCount = data.stale_data_count ?? 0;
        const safeHoldCount = data.total_safe_holds ?? 0;

        // Tính toán tỷ lệ độ tươi dữ liệu & tỷ lệ chặn từ số liệu thật của Backend
        const freshnessRate =
          totalEvents > 0
            ? `${(((totalEvents - staleCount) / totalEvents) * 100).toFixed(1)}%`
            : '100.0%';

        const suppressionRate =
          totalEvents > 0
            ? `${((safeHoldCount / totalEvents) * 100).toFixed(1)}%`
            : '0.0%';

        setMetrics((prev) => ({
          ...prev,
          activeEpisodes: totalEvents.toLocaleString(),
          dataFreshnessRate: freshnessRate,
          suppressionRate: suppressionRate,
          uiLatency: `${latencyMs}ms`,
        }));
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu Dashboard:', error);
    }
  };

  // Gọi API khi mở trang và tự động làm mới mỗi 5 giây
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Đồng hồ đếm lùi thời gian thực cho Observation Window Timers (tự đóng băng khi bật Kill-Switch)
  useEffect(() => {
    if (isKillSwitchActive) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isKillSwitchActive]);

  const formatCountdown = (initialSeconds: number) => {
    const remaining = Math.max(initialSeconds - elapsedSeconds, 0);
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    const secs = remaining % 60;

    return days > 0
      ? `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`
      : `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const handleToggleKillSwitch = () => {
    const msg = isKillSwitchActive
      ? 'Xác nhận MỞ LẠI hàng đợi và khôi phục hệ thống gửi tin nhắn?'
      : 'CẢNH BÁO KHẨN CẤP: Kích hoạt Kill-Switch sẽ chặn ngay lập tức mọi lệnh gửi SMS/Push. Tiếp tục?';

    if (window.confirm(msg)) {
      setIsKillSwitchActive(!isKillSwitchActive);
    }
  };

  const handleManualRefresh = () => {
    setElapsedSeconds(0);
    fetchMetrics();
  };

  // Dữ liệu Observation Window Timers chạy đếm ngược trực tiếp
  const observationCandidates = [
    {
      candidateId: 'CND-10482',
      opaqueRefId: 'OPQ-APP-99201',
      status: 'ASSIGNED_SHADOW',
      obsRemaining: formatCountdown(18 * 3600),
      obsPercent: 82,
      outcomeRemaining: formatCountdown(7 * 86400 + 18 * 3600),
      outcomePercent: 45,
      isExpiringSoon: true,
    },
    {
      candidateId: 'CND-10495',
      opaqueRefId: 'OPQ-APP-99214',
      status: 'STALLED',
      obsRemaining: formatCountdown(2 * 86400 + 6 * 3600),
      obsPercent: 65,
      outcomeRemaining: formatCountdown(9 * 86400 + 6 * 3600),
      outcomePercent: 32,
      isExpiringSoon: false,
    },
    {
      candidateId: 'CND-10508',
      opaqueRefId: 'OPQ-APP-99226',
      status: 'ASSIGNED_SHADOW',
      obsRemaining: formatCountdown(3 * 86400 + 9 * 3600),
      obsPercent: 52,
      outcomeRemaining: formatCountdown(10 * 86400 + 9 * 3600),
      outcomePercent: 25,
      isExpiringSoon: false,
    },
    {
      candidateId: 'CND-10531',
      opaqueRefId: 'OPQ-APP-99238',
      status: 'STALLED',
      obsRemaining: formatCountdown(5 * 86400 + 12 * 3600),
      obsPercent: 22,
      outcomeRemaining: formatCountdown(12 * 86400 + 12 * 3600),
      outcomePercent: 12,
      isExpiringSoon: false,
    },
  ];

  // Dữ liệu 12 cột SMS xếp chồng (Delivered, Pending, Failed)
  const smsStackedBars = [
    { time: '10:00', delivered: 58, pending: 4, failed: 1 },
    { time: '', delivered: 64, pending: 5, failed: 1 },
    { time: '10:05', delivered: 61, pending: 4, failed: 2 },
    { time: '', delivered: 72, pending: 5, failed: 1 },
    { time: '10:10', delivered: 75, pending: 5, failed: 2 },
    { time: '', delivered: 68, pending: 4, failed: 1 },
    { time: '10:15', delivered: 78, pending: 4, failed: 1 },
    { time: '', delivered: 84, pending: 5, failed: 2 },
    { time: '10:20', delivered: 79, pending: 5, failed: 1 },
    { time: '', delivered: 81, pending: 4, failed: 2 },
    { time: '10:25', delivered: 76, pending: 5, failed: 1 },
    { time: '10:30', delivered: 66, pending: 4, failed: 1 },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
      {/* 1. TOP DARK HEADER BANNER */}
      <div className="bg-[#0B1324] text-white px-7 pt-5 pb-0 shrink-0">
        <div className="flex justify-between items-center pb-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider mb-1">
              <span className="text-blue-400 font-bold">BANK-AI-06</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400 uppercase">RECOVERY SYSTEM MONITORING</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              System Recovery Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 text-right">
              <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-300">
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">Admin / Checker Role</div>
                <div className="text-[11px] text-slate-400">Privileged operations access</div>
              </div>
            </div>

            <div className="p-1 rounded-xl border border-red-500/40 bg-red-950/30">
              <button
                onClick={handleToggleKillSwitch}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-extrabold tracking-wide transition-all shadow-lg ${
                  isKillSwitchActive
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                    : 'bg-[#DC2626] hover:bg-red-700 text-white'
                }`}
              >
                <AlertOctagon size={15} />
                <span>
                  {isKillSwitchActive
                    ? 'RESUME SYSTEM (KILL-SWITCH ACTIVE)'
                    : 'KILL-SWITCH (EMERGENCY PAUSE)'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex justify-between items-center border-t border-slate-800/80 pt-3 text-xs">
          <div className="flex space-x-7">
            {['Monitoring', 'Episodes', 'Suppression', 'Audit trail'].map((tab) => {
              const isActive = activeSubTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveSubTab(tab)}
                  className={`pb-3 font-semibold transition-colors relative ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pb-3 text-[11px] font-mono">
            <span className="text-red-400 font-bold tracking-wider">EMERGENCY CONTROL</span>
            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              NFR 05 / SEC 01
            </span>
          </div>
        </div>
      </div>

      {/* Banner cảnh báo đỏ khi bấm kích hoạt Kill-Switch */}
      {isKillSwitchActive && (
        <div className="bg-red-600 text-white px-7 py-2.5 flex items-center justify-between text-xs font-bold shadow">
          <div className="flex items-center gap-2">
            <AlertOctagon size={16} />
            <span>
              EMERGENCY PAUSE ENGAGED: Toàn bộ hàng đợi khôi phục đã bị đóng băng và chặn mọi lệnh gửi SMS mới!
            </span>
          </div>
          <button
            onClick={handleToggleKillSwitch}
            className="bg-white text-red-700 px-3 py-1 rounded font-extrabold hover:bg-red-50"
          >
            Tắt Kill-Switch
          </button>
        </div>
      )}

      {/* 2. MAIN CONTENT AREA */}
      <div className="p-7 space-y-5 flex-1">
        {/* Status & Refresh Control Bar */}
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isKillSwitchActive ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
              }`}
            />
            <span className="font-bold text-slate-800">
              {isKillSwitchActive ? 'System paused' : 'System running'}
            </span>
            <span className="text-slate-400">
              {isKillSwitchActive
                ? 'All outbound recovery dispatches halted'
                : 'All recovery services operational'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-slate-400 text-[11px]">Auto-refresh: 5s</span>
            <button className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 font-medium hover:bg-slate-50 shadow-2xs">
              <span>Last 30 minutes</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs"
            >
              <RefreshCw size={12} className="text-slate-500" />
              <span>Refresh now</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Cards Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-slate-500">Active Episodes</span>
              <LayoutGrid size={15} className="text-blue-600" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {metrics.activeEpisodes}
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Active recovery population</span>
              <span className="text-blue-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Live
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-slate-500">Data Freshness Rate</span>
              <Activity size={15} className="text-emerald-600" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {metrics.dataFreshnessRate} <span className="text-2xl font-bold">(&lt;60s)</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Within the freshness window</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Healthy
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-slate-500">Opt-Out / Suppression Rate</span>
              <Ban size={15} className="text-slate-500" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {metrics.suppressionRate}
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Channel opt-outs and suppressions</span>
              <span className="text-slate-700 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" /> Enforced
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-slate-500">UI Latency (NFR 03)</span>
              <Clock size={15} className="text-blue-600" />
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {metrics.uiLatency}
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Current interface response time</span>
              <span className="text-blue-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Normal
              </span>
            </div>
          </div>
        </div>

        {/* Main Charts & Timers */}
        <div className="grid grid-cols-12 gap-5">
          {/* LEFT COLUMN: 2 Charts */}
          <div className="col-span-7 space-y-5">
            {/* Chart 1: Event Intake Stream Rate */}
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Event Intake Stream Rate</h3>
                  <p className="text-[11px] text-slate-400">Real-time event throughput · 5-second refresh</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> LIVE
                  </span>
                  <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                    Last 30 min
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-baseline mb-3">
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">
                    {isKillSwitchActive ? 0 : metrics.eventIntakeRate}
                  </span>{' '}
                  <span className="text-xs text-slate-400">events / sec</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                  <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Accepted events
                </div>
              </div>

              {/* SVG Line Chart */}
              <div className="relative h-44 w-full pt-2">
                <svg viewBox="0 0 600 150" className="w-full h-full overflow-visible">
                  {[
                    { y: 10, label: '600' },
                    { y: 42, label: '450' },
                    { y: 74, label: '300' },
                    { y: 106, label: '150' },
                    { y: 135, label: '0' },
                  ].map((line) => (
                    <g key={line.label}>
                      <text x="0" y={line.y + 3} className="fill-slate-400 text-[10px] font-mono">
                        {line.label}
                      </text>
                      <line
                        x1="32"
                        y1={line.y}
                        x2="595"
                        y2={line.y}
                        stroke="#F1F5F9"
                        strokeWidth="1"
                      />
                    </g>
                  ))}

                  {!isKillSwitchActive ? (
                    <>
                      <defs>
                        <linearGradient id="streamFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.14" />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <polygon
                        fill="url(#streamFill)"
                        points="35,82 55,75 75,78 95,70 115,74 135,62 155,66 175,58 195,68 215,52 235,56 255,48 275,52 295,42 315,45 335,56 355,48 375,40 395,44 415,38 435,44 455,36 475,34 495,28 515,35 535,30 555,36 575,32 592,34 592,135 35,135"
                      />
                      <polyline
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="2"
                        points="35,82 55,75 75,78 95,70 115,74 135,62 155,66 175,58 195,68 215,52 235,56 255,48 275,52 295,42 315,45 335,56 355,48 375,40 395,44 415,38 435,44 455,36 475,34 495,28 515,35 535,30 555,36 575,32 592,34"
                      />
                      <circle cx="592" cy="34" r="3.5" fill="#2563EB" />
                    </>
                  ) : (
                    <line x1="35" y1="133" x2="592" y2="133" stroke="#EF4444" strokeWidth="2" />
                  )}

                  {[
                    { x: 35, label: '10:00' },
                    { x: 125, label: '10:05' },
                    { x: 215, label: '10:10' },
                    { x: 305, label: '10:15' },
                    { x: 395, label: '10:20' },
                    { x: 485, label: '10:25' },
                    { x: 565, label: '10:30' },
                  ].map((t) => (
                    <text key={t.label} x={t.x} y="150" className="fill-slate-400 text-[10px] font-mono">
                      {t.label}
                    </text>
                  ))}
                </svg>
              </div>
            </div>

            {/* Chart 2: SMS Gateway Delivery Receipts */}
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="mb-2">
                <h3 className="text-sm font-bold text-slate-900">SMS Gateway Delivery Receipts</h3>
                <p className="text-[11px] text-slate-400">Receipt counts by 2.5-minute interval</p>
              </div>

              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">{metrics.smsDelivered24h}</span>{' '}
                  <span className="text-xs text-slate-400">total receipts</span>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-blue-600 inline-block" /> Delivered · 8,787
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-blue-200 inline-block" /> Pending · 538
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-xs bg-red-500 inline-block" /> Failed · 135
                  </span>
                </div>
              </div>

              <div className="relative h-40 flex items-end justify-between pl-9 pr-2 pb-5 border-b border-slate-100">
                <div className="absolute left-0 top-0 bottom-5 flex flex-col justify-between text-[10px] font-mono text-slate-400">
                  <span>1,000</span>
                  <span>750</span>
                  <span>500</span>
                  <span>250</span>
                  <span>0</span>
                </div>

                {smsStackedBars.map((bar, idx) => (
                  <div key={idx} className="flex flex-col items-center h-full justify-end flex-1">
                    <div className="w-5 flex flex-col-reverse rounded-t-xs overflow-hidden">
                      <div
                        className={isKillSwitchActive ? 'bg-slate-300' : 'bg-blue-600'}
                        style={{ height: `${isKillSwitchActive ? 8 : bar.delivered * 1.2}px` }}
                      />
                      <div
                        className="bg-blue-200"
                        style={{ height: `${isKillSwitchActive ? 2 : bar.pending * 1.5}px` }}
                      />
                      <div
                        className="bg-red-500"
                        style={{ height: `${isKillSwitchActive ? 0 : bar.failed * 1.5}px` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 mt-1.5 h-3">
                      {bar.time}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-[11px] mt-3">
                <span className="text-blue-600 font-bold">Delivered 92.9%</span>
                <span className="text-slate-400">
                  Pending and failed receipts remain visible for operational follow-up.
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Observation Window Timers */}
          <div className="col-span-5 bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Observation Window Timers (7-Day Expiry)
                </h3>
                <p className="text-[11px] text-slate-400">Candidate lifecycle &amp; outcome maturation</p>
              </div>

              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-md">
                    {observationCandidates.length} candidates
                  </span>
                  <span className="bg-amber-50 text-amber-800 border border-amber-200/70 text-[11px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> 1 expiring soon
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Sorted by expiry ↑</span>
              </div>

              <div className="space-y-3">
                {observationCandidates.map((item) => (
                  <div
                    key={item.candidateId}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.isExpiringSoon
                        ? 'border-amber-300 bg-amber-50/25'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {item.candidateId}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {item.opaqueRefId}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md ${
                          item.status === 'ASSIGNED_SHADOW'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {isKillSwitchActive ? 'PAUSED' : item.status}
                      </span>
                    </div>

                    {/* 2 Cột Progress Bars song song (Đếm ngược real-time) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">Observation expiry</span>
                          <span
                            className={`font-mono font-bold ${
                              item.isExpiringSoon ? 'text-amber-700' : 'text-slate-600'
                            }`}
                          >
                            {item.obsRemaining}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.isExpiringSoon ? 'bg-amber-600' : 'bg-slate-400'
                            }`}
                            style={{ width: `${item.obsPercent}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-slate-400">14-day outcome</span>
                          <span className="font-mono font-bold text-blue-600">
                            {item.outcomeRemaining}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${item.outcomePercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Annex E Footer Note */}
            <div className="mt-4 bg-slate-50 border border-slate-200/70 rounded-lg px-3 py-2.5 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-bold text-slate-700 shrink-0">Annex E</span>
              <span>7-day observation expiry and 14-day outcome maturation are tracked separately.</span>
            </div>
          </div>
        </div>

        {/* Bottom Metadata Footer */}
        <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2">
          <span>BANK-AI-06 / Recovery monitoring</span>
          <span>Live Backend Metrics Connected</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {isKillSwitchActive ? 'Stream paused' : 'Stream connected'}
            </span>
            <span>Synced via GET /api/metrics</span>
          </div>
        </div>
      </div>
    </div>
  );
};
