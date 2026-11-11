import React from 'react';
import { LayoutDashboard, Users, FileText, Activity, Settings, HelpCircle, ShieldAlert } from 'lucide-react';

interface SidebarProps {
  activeTab: 'QUEUE' | 'DASHBOARD';
  setActiveTab: (tab: 'QUEUE' | 'DASHBOARD') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <aside className="w-60 bg-[#0B132B] text-slate-300 flex flex-col justify-between p-4 h-full shrink-0 border-r border-slate-800">
      <div className="space-y-6">
        {/* Logo */}
        <div className="flex items-center space-x-2 px-2 py-1">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-xs tracking-wider">
        
          </div>
          <span className="font-bold text-white text-base tracking-tight">BANK-AI-06</span>
        </div>

        {/* Navigation */}
        <nav className="space-y-1 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-3 mb-2">Workspace</div>
          
          <button
            onClick={() => setActiveTab('QUEUE')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'QUEUE'
                ? 'bg-[#1C2541] text-emerald-400 border-l-4 border-emerald-500 font-semibold'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <Users size={16} />
            <span>Staff Help Queue</span>
          </button>

          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'DASHBOARD'
                ? 'bg-[#1C2541] text-blue-400 border-l-4 border-blue-500 font-semibold'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <LayoutDashboard size={16} />
            <span>Recovery Dashboard</span>
          </button>

          <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 text-slate-400 transition-colors">
            <FileText size={16} />
            <span>Applications</span>
          </a>

          <a href="#" className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 text-slate-400 transition-colors">
            <Activity size={16} />
            <span>Health Monitoring</span>
          </a>
        </nav>
      </div>

      {/* Footer System Info */}
      <div className="border-t border-slate-800/80 pt-4 space-y-2 text-xs">
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 px-2 py-1 bg-slate-900/60 rounded">
          <ShieldAlert size={14} className="text-emerald-500" />
          <span>Staff Operations (INT 04)</span>
        </div>
        <div className="flex items-center space-x-3 px-3 py-1.5 text-slate-400 hover:text-white cursor-pointer">
          <Settings size={15} />
          <span>Settings</span>
        </div>
        <div className="flex items-center space-x-3 px-3 py-1.5 text-slate-400 hover:text-white cursor-pointer">
          <HelpCircle size={15} />
          <span>Help & Resources</span>
        </div>
      </div>
    </aside>
  );
};