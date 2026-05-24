import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { BlackjackTable } from './views/BlackjackTable';
import { HostTableView } from './views/host/HostTableView';
import { ManageTablesView } from './views/host/ManageTablesView';
import { useGameStore } from './store/gameStore';
import { LiveTablesSidebar } from './components/blackjack/LiveTablesSidebar';
import { AnimatePresence } from 'motion/react';

import { ConfirmModal } from './components/blackjack/ConfirmModal';

function GameLayout() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [closedRedirectMessage, setClosedRedirectMessage] = useState<string | null>(null);
  const { currentUser, login, observeTable, tables, activeTableId, unlockTableBalance, leaveTable } = useGameStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmAction, setConfirmAction] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) {
      login('Player');
    }
  }, [currentUser, login]);

  // Sync activeTableId with URL param if on a table view
  useEffect(() => {
    const pathMatch = location.pathname.match(/^\/t\/([\w_-]+)/);
    if (pathMatch && pathMatch[1]) {
      const tableId = pathMatch[1];
      if (tables[tableId] && activeTableId !== tableId) {
        observeTable(tableId);
      }
    }
  }, [location.pathname, tables, observeTable, activeTableId]);

  useEffect(() => {
    if (activeTableId && tables[activeTableId]?.status === 'closed' && activeTableId !== 'table_1' && location.pathname.startsWith('/t/')) {
        if (!closedRedirectMessage) {
            setClosedRedirectMessage('This table is closed. You will be directed to the default official table in a few seconds.');
            setTimeout(() => {
               setClosedRedirectMessage(null);
               navigate('/t/table_1');
            }, 3000);
        }
    }
  }, [activeTableId, tables, closedRedirectMessage, navigate, location.pathname]);

  const handleNavigate = (view: string, tableId?: string): boolean => {
    if (view === 'lobby') {
       setShowSidebar(true);
       return false;
    } else if (view === 'table') {
       navigate(`/t/${tableId || activeTableId || 'table_1'}`);
    } else if (view === 'host_table') {
       navigate(tableId ? `/host/${tableId}` : `/host`);
    } else if (view === 'manage_tables') {
       navigate(tableId ? `/manage/${tableId}` : `/manage`);
    } else {
       navigate('/');
    }
    return true;
  };

  const activeTables = Object.values(tables).filter(t => t.status !== 'closed' && t.status !== 'closing' && t.settings.isPublic);

  const handleTableSelect = (id: string) => {
    if (activeTableId && tables[activeTableId] && currentUser) {
        const table = tables[activeTableId];
        const userBal = table.userBalances?.[currentUser.id];
        if (userBal) {
            const isTournament = table.settings.mode === 'tournament';
            const hasStarted = table.status !== 'waiting';
            
            let message = "You have locked chips on your current table. Do you want to unlock your funds before switching?";
            let confirmText = "Unlock & Switch";
            
            if (isTournament) {
                if (hasStarted) {
                    message = "The tournament is underway. If you unlock your funds now, your ticket is non-refundable and you will lose your tournament progress. If you just switch, your seat will be given up but your funds remain locked here for you to return.";
                    confirmText = "Unlock & Forfeit";
                } else {
                    message = "Since the tournament hasn't started yet, your entry ticket will be refunded if you unlock your funds.";
                    confirmText = "Unlock & Refund";
                }
            }
            
            setConfirmAction({
                title: isTournament ? "Leave Tournament" : "Choose Action",
                message,
                confirmText,
                cancelText: "Just Switch",
                onConfirm: async () => {
                    await unlockTableBalance(activeTableId);
                    leaveTable(activeTableId);
                    setConfirmAction(null);
                    setShowSidebar(false);
                    navigate(`/t/${id}`);
                },
                onCancel: () => {
                    leaveTable(activeTableId);
                    setConfirmAction(null);
                    setShowSidebar(false);
                    navigate(`/t/${id}`);
                }
            });
            return;
        } else {
            leaveTable(activeTableId);
        }
    }
    setShowSidebar(false);
    navigate(`/t/${id}`);
  };

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
        {closedRedirectMessage && (
           <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
             <div className="bg-[#1a1c23] border border-red-500/30 text-white p-6 rounded-2xl shadow-2xl max-w-md text-center">
                <h3 className="text-xl font-bold text-red-500 mb-2">Table Closed</h3>
                <p className="text-white/80">{closedRedirectMessage}</p>
             </div>
           </div>
        )}
        {confirmAction && (
          <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />
        )}
        <AnimatePresence>
          {showSidebar && (
            <LiveTablesSidebar 
              showSidebar={showSidebar} 
              setShowSidebar={setShowSidebar} 
              activeTables={activeTables} 
              currentTableId={activeTableId || ''} 
              observeTable={handleTableSelect} 
            />
          )}
        </AnimatePresence>
        
        <Routes>
          <Route path="/t/:id" element={<BlackjackTable onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} isSidebarOpen={showSidebar} />} />
          <Route path="/host" element={<HostTableView onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} editTableId={null} />} />
          <Route path="/host/:id" element={<HostTableViewWrapper onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} />} />
          <Route path="/manage" element={<ManageTablesView onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} initialTableId={null} />} />
          <Route path="/manage/:id" element={<ManageTableViewWrapper onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} />} />
          <Route path="*" element={<Navigate to={`/t/table_1`} replace />} />
        </Routes>
      </div>
    </div>
  );
}

function HostTableViewWrapper(props: any) {
  const { id } = useParams();
  return <HostTableView {...props} editTableId={id} />;
}

function ManageTableViewWrapper(props: any) {
  const { id } = useParams();
  return <ManageTablesView {...props} initialTableId={id} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <GameLayout />
    </BrowserRouter>
  );
}

