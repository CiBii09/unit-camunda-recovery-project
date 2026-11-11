import React, { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { StaffHelpQueuePage } from './pages/StaffHelpQueuePage';
import { DashboardPage } from './pages/DashboardPage';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'DASHBOARD'>('QUEUE');

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={activeTab === 'QUEUE' ? 'Staff Help Queue (INT 04)' : 'System Recovery Dashboard'}
          showKillSwitch={activeTab === 'DASHBOARD'}
        />

        {activeTab === 'QUEUE' ? <StaffHelpQueuePage /> : <DashboardPage />}
      </div>
    </div>
  );
};

export default App;