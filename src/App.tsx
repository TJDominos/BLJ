import React, { useState, useEffect } from 'react';
import { BlackjackTable } from './views/BlackjackTable';
import { HostTableView } from './views/host/HostTableView';
import { ManageTablesView } from './views/host/ManageTablesView';
import { useGameStore } from './store/gameStore';
import { LiveTablesSidebar } from './components/blackjack/LiveTablesSidebar';
import { AnimatePresence } from 'motion/react';

type ViewState = 'table' | 'host_table' | 'manage_tables';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('table');
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const { currentUser, login, joinTable, observeTable, tables, activeTableId } = useGameStore();

  useEffect(() => {
    if (!currentUser) {
      login('Player');
      observeTable('table_1');
    } else if (!activeTableId || tables[activeTableId]?.status === 'closed') {
      observeTable('table_1');
    }
  }, [currentUser, login, observeTable, activeTableId, tables]);

  const handleNavigate = (view: ViewState | string, tableId?: string): boolean => {
    setCurrentView(view as ViewState);
    if (tableId !== undefined) {
      setEditTableId(tableId);
    } else {
      setEditTableId(null);
    }
    return true;
  };

  const activeTables = Object.values(tables).filter(t => t.status !== 'closed' && t.settings.isPublic);

  return (
    <div className="w-full h-[100dvh] flex flex-col relative overflow-hidden bg-gradient-to-br from-[#1a0f0a] via-[#0d0905] to-[#140b08] text-slate-200 font-sans selection:bg-[#c6a364]/30 selection:text-amber-200">
      <div className="absolute inset-0 pointer-events-none opacity-30 bg-[url('https://www.transparenttextures.com/patterns/black-floral-pattern.png')] mix-blend-overlay z-0"></div>
      
      {/* Luxury Caesars Palace style background elements */}
      <div className="absolute top-0 left-0 bottom-0 w-32 md:w-64 opacity-20 pointer-events-none bg-gradient-to-r from-[#c6a364]/20 to-transparent"></div>
      <div className="absolute top-0 right-0 bottom-0 w-32 md:w-64 opacity-20 pointer-events-none bg-gradient-to-l from-[#c6a364]/20 to-transparent"></div>
      
      <div className="absolute -left-[50px] top-[10%] w-[300px] h-[600px] opacity-[0.03] pointer-events-none rotate-12 flex flex-col justify-center gap-10">
        {[...Array(5)].map((_, i) => (
           <div key={i} className="w-full h-8 border-y-2 border-[#c6a364]" style={{ borderStyle: 'double' }}></div>
        ))}
      </div>
      <div className="absolute -right-[50px] bottom-[10%] w-[300px] h-[600px] opacity-[0.03] pointer-events-none -rotate-12 flex flex-col justify-center gap-10">
        {[...Array(5)].map((_, i) => (
           <div key={i} className="w-full h-8 border-y-2 border-[#c6a364]" style={{ borderStyle: 'double' }}></div>
        ))}
      </div>

      <div className="relative z-10 w-full h-full flex flex-col">
        <AnimatePresence>
          {showSidebar && (
            <LiveTablesSidebar 
              showSidebar={showSidebar} 
              setShowSidebar={setShowSidebar} 
              activeTables={activeTables} 
              currentTableId={activeTableId || ''} 
              observeTable={observeTable} 
              onNavigate={() => handleNavigate('table')}
            />
          )}
        </AnimatePresence>
        {currentView === 'table' && <BlackjackTable onNavigate={handleNavigate as any} onToggleSidebar={() => setShowSidebar(true)} />}
        {currentView === 'host_table' && <HostTableView onNavigate={handleNavigate as any} onToggleSidebar={() => setShowSidebar(true)} editTableId={editTableId} />}
        {currentView === 'manage_tables' && <ManageTablesView onNavigate={handleNavigate as any} onToggleSidebar={() => setShowSidebar(true)} />}
      </div>
    </div>
  );
}
