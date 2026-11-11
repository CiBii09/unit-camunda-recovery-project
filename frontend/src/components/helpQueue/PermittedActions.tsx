import React from 'react';
import { CheckCircle2, Send, XCircle } from 'lucide-react';

export const PermittedActions: React.FC = () => {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Permitted Actions</h4>
        <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-200">Policy Checks Passed</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="flex flex-col items-center justify-center p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg transition-all shadow-sm">
          <CheckCircle2 size={18} className="mb-1 text-emerald-600" />
          <span className="text-xs font-bold">Verify & Resend In-App Push</span>
        </button>

        <button className="flex flex-col items-center justify-center p-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-lg transition-all shadow-sm">
          <Send size={18} className="mb-1 text-amber-600" />
          <span className="text-xs font-bold">Send Fallback SMS Intent</span>
        </button>

        <button className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg transition-all shadow-sm">
          <XCircle size={18} className="mb-1 text-slate-500" />
          <span className="text-xs font-bold">Dismiss Help Task</span>
        </button>
      </div>
    </div>
  );
};