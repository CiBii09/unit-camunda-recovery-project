import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const DataFreshnessGauge: React.FC = () => {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-slate-700 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Data Freshness
        </span>
        <span className="text-[11px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <ShieldCheck size={13} /> LIVE DATA (Age: 25s)
        </span>
      </div>

      <div className="space-y-1">
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
          <div className="h-full rounded-full bg-emerald-500 w-[41%]" />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0s</span>
          <span>Target: &lt;60s rule</span>
          <span>60s Max</span>
        </div>
      </div>
    </div>
  );
};