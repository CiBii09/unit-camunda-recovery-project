import React from 'react';
import { AlertOctagon, User } from 'lucide-react';
import { SafetyControls } from './SafetyControls';

interface HeaderProps {
  title: string;
  showKillSwitch?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, showKillSwitch = false }) => {
  return (
    <header className="h-14 bg-[#0B132B] text-white border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-4">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center space-x-4">
        {showKillSwitch && <SafetyControls />}
        <div className="flex items-center space-x-3 border-l pl-4 border-slate-800">
          <div className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center text-slate-300">
            <User size={15} />
          </div>
          <div className="text-left text-xs">
            <div className="font-semibold text-slate-200 text-[11px]">Staff Operations</div>
            <div className="text-slate-400 text-[10px]">INT 04 Operator</div>
          </div>
        </div>
      </div>
    </header>
  );
};