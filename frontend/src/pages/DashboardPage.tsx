import React from 'react';
import { Clock, Activity, Send, CheckCircle2 } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  return (
    <div className="flex-1 p-6 bg-slate-50 overflow-y-auto space-y-6">
      {/* Top Navigation Bar Tabs */}
      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
        <div className="flex space-x-6 text-xs font-bold text-slate-500">
          <button className="text-blue-600 border-b-2 border-blue-600 pb-2">Monitoring</button>
          <button className="hover:text-slate-800">Evaluation</button>
          <button className="hover:text-slate-800">Suppression</button>
          <button className="hover:text-slate-800">Audit Logs</button>
        </div>
        <div className="text-[11px] text-slate-400">
          System Status: <span className="text-slate-500 font-bold">CONNECTING...</span>
        </div>
      </div>

      {/* Metrics Row (KPI Cards) - TRỐNG DỮ LIỆU CHỜ API */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">Active Episodes</span>
          <span className="text-3xl font-extrabold text-slate-300">--</span>
          <span className="text-[10px] text-slate-400 block mt-1">7-Day Expiry Capacity</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">Data Freshness Rate</span>
          <span className="text-3xl font-extrabold text-slate-300">--%</span>
          <span className="text-[10px] text-slate-400 font-semibold block mt-1">Within &lt;60s Freshness Window</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">Opt-Out / Suppression Rate</span>
          <span className="text-3xl font-extrabold text-slate-300">--%</span>
          <span className="text-[10px] text-slate-400 block mt-1">Silence & Do Not Disturb Rules</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">UI Latency (NFR 03)</span>
          <span className="text-3xl font-extrabold text-slate-300">--s</span>
          <span className="text-[10px] text-slate-400 font-semibold block mt-1">Under 2.0s SLA Threshold</span>
        </div>
      </div>

      {/* Main Charts & Timers Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Area (60%): Event Stream & SMS Receipts - VÙNG TRỐNG CHỜ API */}
        <div className="col-span-7 space-y-6">
          {/* Event Stream Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Activity size={16} className="text-blue-500" /> Event Intake Stream Rate
                </h4>
                <div className="text-2xl font-extrabold text-slate-300 mt-1">-- <span className="text-xs text-slate-400 font-normal">events / sec</span></div>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Chờ Stream API</span>
            </div>

            {/* Khung trống biểu đồ Event Stream */}
            <div className="h-40 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400">
              [Vùng trống: Chờ liên kết API biểu đồ Event Intake Stream từ Backend / Data Stream]
            </div>
          </div>

          {/* SMS Receipts Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Send size={16} className="text-emerald-500" /> SMS Gateway Delivery Receipts
                </h4>
                <div className="text-2xl font-extrabold text-slate-300 mt-1">-- <span className="text-xs text-slate-400 font-normal">delivered in last 24h</span></div>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Chờ SMS API</span>
            </div>

            {/* Khung trống biểu đồ SMS Receipts */}
            <div className="h-40 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400">
              [Vùng trống: Chờ liên kết API đối soát tin nhắn khôi phục từ SMS Gateway]
            </div>
          </div>
        </div>

        {/* Right Area (40%): Timers Panel - VÙNG TRỐNG CHỜ API */}
        <div className="col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock size={16} className="text-amber-500" /> Observation Window Timers (7-Day Expiry)
              </h4>
              <span className="text-[10px] text-slate-400">Camunda Timers</span>
            </div>

            {/* Khung trống hiển thị khi chưa có Observation Timers */}
            <div className="h-72 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400 text-center p-4">
              [Vùng trống: Chờ liên kết API đếm thời gian quan sát từ Data Team / Statistician]
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Awaiting Camunda Engine Sync</span>
            <span className="flex items-center gap-1 text-slate-400 font-bold">
              <CheckCircle2 size={13} /> Listener Standby
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};