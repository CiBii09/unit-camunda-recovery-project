import React from 'react';
import { DataFreshnessGauge } from '../components/helpQueue/DataFreshnessGauge';
import { PermittedActions } from '../components/helpQueue/PermittedActions';
import { Lock, RefreshCw, Inbox, AlertCircle } from 'lucide-react';

export const StaffHelpQueuePage: React.FC = () => {
  return (
    <div className="flex-1 p-6 grid grid-cols-12 gap-6 bg-slate-50 overflow-y-auto">
      {/* Cột trái: Camunda Task List (35% width) - KHUNG TRỐNG CHỜ API */}
      <div className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-slate-800 text-sm">Camunda Task List</h3>
            <span className="bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">0 tasks</span>
          </div>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Khung trống hiển thị khi chưa có Task từ Camunda Engine */}
        <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-400 min-h-[300px]">
          <Inbox size={36} className="mb-2 stroke-1 text-slate-300" />
          <span className="text-xs font-semibold text-slate-500">Chưa có nhiệm vụ nào trong hàng chờ</span>
          <span className="text-[10px] text-slate-400 mt-1">[Vùng trống: Chờ liên kết API Tasklist từ Camunda Engine]</span>
        </div>
      </div>

      {/* Cột phải: Customer Detail Panel (65% width) - KHUNG TRỐNG CHỜ API */}
      <div className="col-span-8 space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-400">[Chưa chọn Task]</h2>
            <p className="text-xs text-slate-400">Camunda Task ID: -- • Priority: --</p>
          </div>
        </div>

        {/* Masked Customer Information - Trống dữ liệu */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Lock size={14} className="text-slate-400" /> Masked Customer Information
            </span>
            <span className="text-[10px] text-slate-400">Strict PII Masked</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 block mb-1 font-bold">OPAQUE REF ID</span>
              <span className="font-mono text-sm font-bold text-slate-300">--</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 block mb-1 font-bold">MASKED PHONE</span>
              <span className="font-mono text-sm font-bold text-slate-300">--</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 block mb-1 font-bold">EPISODE STATUS</span>
              <span className="text-xs font-bold text-slate-400">--</span>
            </div>
          </div>
        </div>

        {/* Data Freshness Indicator */}
        <DataFreshnessGauge />

        {/* Permitted Actions */}
        <PermittedActions />

        {/* Latest State Summary - Khung trống chờ API */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle size={14} className="text-blue-500" /> Latest State Summary
          </h4>
          <div className="h-16 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400">
            [Vùng trống: Chờ liên kết API Audit Log & Customer Evidence từ Backend]
          </div>
        </div>
      </div>
    </div>
  );
};