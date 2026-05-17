import React, { useState, useEffect } from 'react';
import { BlackjackTable } from './views/BlackjackTable';
import { HostTableView } from './views/host/HostTableView';
import { useGameStore } from './store/gameStore';
import { LiveTablesSidebar } from './components/blackjack/LiveTablesSidebar';
import { AnimatePresence } from 'motion/react';

type ViewState = 'table' | 'host_table';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('table');
  const [showSidebar, setShowSidebar] = useState(false);
  const { currentUser, login, joinTable, tables, activeTableId } = useGameStore();

  useEffect(() => {
    if (!currentUser) {
      login('Guest');
      joinTable('table_1', 0);
    }
  }, [currentUser, login, joinTable]);

  const handleNavigate = (view: ViewState | string) => {
    setCurrentView(view as ViewState);
  };

  const activeTables = Object.values(tables).filter(t => t.status !== 'closed' && t.settings.isPublic);

  return (
    <div className="w-full h-[100dvh] flex flex-col relative overflow-hidden bg-[#05070a] text-slate-200 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <AnimatePresence>
        {showSidebar && (
          <LiveTablesSidebar 
            showSidebar={showSidebar} 
            setShowSidebar={setShowSidebar} 
            activeTables={activeTables} 
            currentTableId={activeTableId || ''} 
            joinTable={joinTable} 
          />
        )}
      </AnimatePresence>
      {currentView === 'table' && <BlackjackTable onNavigate={handleNavigate as any} onToggleSidebar={() => setShowSidebar(true)} />}
      {currentView === 'host_table' && <HostTableView onNavigate={handleNavigate as any} onToggleSidebar={() => setShowSidebar(true)} />}
    </div>
  );
}
