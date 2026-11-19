import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface DataFreshnessGaugeProps {
  age: number;
}

export const DataFreshnessGauge: React.FC<DataFreshnessGaugeProps> = ({ age }) => {
  const isFresh = age <= 60;
  // Tính phần trăm thanh tiến trình (tối đa 60s = 100%)
  const progressPercent = Math.min((age / 60) * 100, 100);

  return (
    <div
      className={`p-5 rounded-xl border shadow-sm transition-colors ${
        isFresh
          ? 'bg-white border-emerald-200/80'
          : 'bg-red-50/40 border-red-300'
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <RefreshCw
            size={15}
            className={isFresh ? 'text-emerald-600' : 'text-red-600'}
          />
          Data freshness
        </span>
        <span className="font-mono text-[11px] text-slate-400">EVT 07 / NFR 04</span>
      </div>

      {/* Badge & Status Text */}
      <div className="flex items-center gap-4 mb-4">
        <div
          className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 font-mono text-sm font-extrabold shrink-0 ${
            isFresh
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-100 text-red-700 border-red-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isFresh ? 'bg-emerald-500 animate-ping' : 'bg-red-600'
            }`}
          />
          {isFresh ? `LIVE DATA (Age: ${age}s)` : `STALE DATA (Age: ${age}s)`}
        </div>

        <div>
          <div
            className={`text-xs font-bold ${
              isFresh ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {isFresh ? 'Safe to proceed' : 'Action blocked — Stale state'}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isFresh
              ? 'Latest application state is within the 60-second freshness window.'
              : 'Application state exceeded the 60s window. Refresh required before dispatching.'}
          </p>
        </div>
      </div>

      {/* Thanh đo 0s -> 60s */}
      <div className="space-y-1.5">
        <div className="relative w-full h-1.5 bg-slate-200 rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFresh ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
          {/* Vạch đánh dấu vị trí hiện tại */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full transition-all duration-500 ${
              isFresh ? 'bg-emerald-700' : 'bg-red-700'
            }`}
            style={{ left: `calc(${progressPercent}% - 2px)` }}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono">
          <span className="text-slate-400">0s</span>
          <span
            className={`font-bold ${
              isFresh ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {age}s · current age
          </span>
          <span className="text-red-500 font-semibold">60s · stale threshold</span>
        </div>
      </div>
    </div>
  );
};
