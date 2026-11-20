import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from './lib/router';
import { BlackjackTable } from './views/BlackjackTable';
import { HomeView } from './views/HomeView';
import { HostTableView } from './views/host/HostTableView';
import { ManageTablesView } from './views/host/ManageTablesView';
import { useGameStore, isPrivateTableLockedForUser, type PrivateSessionSettlement } from './store/gameStore';
import { LiveTablesSidebar } from './components/blackjack/LiveTablesSidebar';
import { AnimatePresence } from 'motion/react';

import { ConfirmModal } from './components/blackjack/ConfirmModal';
import { PrivateTablePinGate } from './components/blackjack/PrivateTablePinGate';
import { PrivateSettlementReceiptBanner } from './components/blackjack/PrivateTableFinanceModals';
import { initRandseedRuntime } from './lib/randseedRuntime';
import { initRandseedAgentBridge, stopRandseedAgentBridge } from './lib/randseedAgentBridge';

function GameLayout() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [closedRedirectMessage, setClosedRedirectMessage] = useState<string | null>(null);
  const {
    currentUser,
    login,
    observeTable,
    tables,
    activeTableId,
    unlockedTableIds,
    recentPrivateSettlements,
    verifyTableCode,
    unlockTableBalance,
    leaveTable,
    closeTable,
    syncStateFromServer
  } = useGameStore();
  const navigate = useNavigate();
  const routeState = useLocation();
  const [confirmAction, setConfirmAction] = useState<any>(null);

  // Private table 4-digit PIN gate modal state
  const [pendingCodeTableId, setPendingCodeTableId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSettlementToast, setActiveSettlementToast] = useState<PrivateSessionSettlement | null>(null);
  const seenSettlementIdsRef = useRef<Set<string>>(new Set());
  const initializedSettlementRef = useRef(false);

  useEffect(() => {
    if (!Array.isArray(recentPrivateSettlements)) return;
    if (!initializedSettlementRef.current) {
      if (currentUser && currentUser.id !== 'connecting_player') {
        for (const s of recentPrivateSettlements) {
          if (s?.id) seenSettlementIdsRef.current.add(s.id);
        }
        initializedSettlementRef.current = true;
      }
      return;
    }
    const newestUnseen = recentPrivateSettlements.find(
      (s) => s?.id && !seenSettlementIdsRef.current.has(s.id)
    );
    if (newestUnseen) {
      seenSettlementIdsRef.current.add(newestUnseen.id);
      setActiveSettlementToast(newestUnseen);
    }
  }, [recentPrivateSettlements, currentUser?.id]);

  useEffect(() => {
    if (!activeSettlementToast) return;
    const timer = setTimeout(() => {
      setActiveSettlementToast((cur) => (cur?.id === activeSettlementToast.id ? null : cur));
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeSettlementToast]);

  useEffect(() => {
    initRandseedRuntime();
    initRandseedAgentBridge();
    return () => {
      stopRandseedAgentBridge();
    };
  }, []);

  useEffect(() => {
    const checkFullscreen = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const docFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      const mediaFs =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: fullscreen)').matches;
      const screenFs =
        typeof window.screen !== 'undefined' &&
        window.screen.height > 0 &&
        window.innerHeight >= window.screen.height - 32 &&
        window.innerWidth >= window.screen.width - 32;
      setIsFullscreen(docFs || mediaFs || screenFs);
    };

    checkFullscreen();
    window.addEventListener('resize', checkFullscreen);
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    return () => {
      window.removeEventListener('resize', checkFullscreen);
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
    };
  }, []);

  useEffect(() => {
    login('Player');
  }, [login]);

  // Re-sync from existing RoomClient snapshot when tab regains focus/visibility
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncStateFromServer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [syncStateFromServer]);

  const isTableLockedForUser = (tableId: string): boolean => {
    const t = tables[tableId];
    return isPrivateTableLockedForUser(t, currentUser?.id, unlockedTableIds);
  };

  const shouldPromptCreatorCloseOnLeave = (tableId: string | null): boolean => {
    if (!tableId || !currentUser) return false;
    const t = tables[tableId];
    if (!t || t.houseId === 'system' || t.houseId !== currentUser.id) return false;
    if (t.status === 'closed' || t.status === 'closing') return false;
    if (t.status === 'playing') return false;

    const isTournament = t.settings.mode === 'tournament';
    // In tournament mode, once a player (including creator) is seated, they cannot leave their seat
    const remainingHumanPlayersCount = t.seats.filter((s) => {
      if (s.userId === null || s.userId.startsWith('bot_')) return false;
      if (isTournament) return true; // Tournament seats remain occupied
      return s.userId !== currentUser.id;
    }).length;

    return remainingHumanPlayersCount === 0;
  };

  // Sync activeTableId with URL param if on a table view (only after private PIN gate passes)
  useEffect(() => {
    const pathMatch = routeState.routePath.match(/^\/t\/([\w_-]+)/);
    if (pathMatch && pathMatch[1]) {
      const tableId = pathMatch[1];
      if (tables[tableId]) {
        if (isTableLockedForUser(tableId)) {
          return;
        }
        if (activeTableId !== tableId) {
          observeTable(tableId);
        }
      }
    }
  }, [routeState.routePath, tables, observeTable, activeTableId, currentUser?.id, unlockedTableIds]);

  useEffect(() => {
    if (activeTableId && tables[activeTableId]?.status === 'closed' && routeState.routePath.startsWith('/t/')) {
      if (!closedRedirectMessage) {
        setClosedRedirectMessage('This table is closed. You will be directed to the lobby in a few seconds.');
        setTimeout(() => {
          setClosedRedirectMessage(null);
          navigate('/');
        }, 3000);
      }
    }
  }, [activeTableId, tables, closedRedirectMessage, navigate, routeState.routePath]);

  const executeNavigation = (view: string, tableId?: string) => {
    if (view === 'lobby') {
       navigate('/');
    } else if (view === 'table') {
       const fallbackTableId = tableId || activeTableId || Object.keys(tables)[0];
       navigate(fallbackTableId ? `/t/${fallbackTableId}` : '/');
    } else if (view === 'host_table') {
       navigate(tableId ? `/host/${tableId}` : `/host`);
    } else if (view === 'manage_tables') {
       navigate(tableId ? `/manage/${tableId}` : `/manage`);
    } else {
       navigate('/');
    }
  };

  const handleNavigate = (view: string, tableId?: string): boolean => {
    const pathMatch = routeState.routePath.match(/^\/t\/([\w_-]+)/);
    const currentUrlTableId = pathMatch?.[1] || activeTableId;
    const isLeavingCurrentTable =
      routeState.routePath.startsWith('/t/') &&
      currentUrlTableId &&
      (view !== 'table' || (tableId && tableId !== currentUrlTableId));

    if (isLeavingCurrentTable && currentUrlTableId && shouldPromptCreatorCloseOnLeave(currentUrlTableId)) {
      const leavingId = currentUrlTableId;
      const leavingTable = tables[leavingId];
      const maxHostingMinutes = Math.round(((leavingTable?.maxHostingTimeMs || 300000) / 60000));
      setConfirmAction({
        title: 'Leave Custom Table?',
        message: `There are currently no players playing at your table. Your custom table will remain live for up to ${maxHostingMinutes} minutes (max hosting time) so players can join or return, and will close automatically after the hosting time ends if no players join. Do you confirm leaving?`,
        confirmText: 'Confirm & Leave',
        cancelText: 'Stay',
        onConfirm: async () => {
          setConfirmAction(null);
          if (leavingTable?.settings.mode !== 'tournament') {
            await leaveTable(leavingId);
          }
          executeNavigation(view, tableId);
        },
        onCancel: () => {
          setConfirmAction(null);
        }
      });
      return false;
    }

    if (isLeavingCurrentTable && currentUrlTableId && tables[currentUrlTableId]?.settings.mode !== 'tournament') {
      leaveTable(currentUrlTableId);
    }

    executeNavigation(view, tableId);
    return true;
  };

  const activeTables = Object.values(tables).filter(t => t.status !== 'closed' && t.status !== 'closing');

  const proceedToTable = (id: string) => {
    const pathMatch = routeState.routePath.match(/^\/t\/([\w_-]+)/);
    const currentUrlTableId = pathMatch?.[1] || activeTableId;

    if (routeState.routePath.startsWith('/t/') && currentUrlTableId && currentUrlTableId !== id && tables[currentUrlTableId] && currentUser) {
      if (shouldPromptCreatorCloseOnLeave(currentUrlTableId)) {
        const leavingId = currentUrlTableId;
        const leavingTable = tables[leavingId];
        const maxHostingMinutes = Math.round(((leavingTable?.maxHostingTimeMs || 300000) / 60000));
        setConfirmAction({
          title: 'Leave Custom Table?',
          message: `There are currently no players playing at your table. Your custom table will remain live for up to ${maxHostingMinutes} minutes (max hosting time) so players can join or return, and will close automatically after the hosting time ends if no players join. Do you confirm leaving?`,
          confirmText: 'Confirm & Leave',
          cancelText: 'Stay',
          onConfirm: async () => {
            setConfirmAction(null);
            if (leavingTable?.settings.mode !== 'tournament') {
              await leaveTable(leavingId);
            }
            setShowSidebar(false);
            observeTable(id);
            navigate(`/t/${id}`);
          },
          onCancel: () => {
            setConfirmAction(null);
          }
        });
        return;
      }

      const table = tables[currentUrlTableId];
      // Requirement 6: For tournament, player cannot leave seat. For regular tables, vacate seat when switching tables so player can return anytime while live.
      if (table.settings.mode !== 'tournament') {
        leaveTable(currentUrlTableId);
      }
    }
    setShowSidebar(false);
    observeTable(id);
    navigate(`/t/${id}`);
  };

  const handleTableSelect = (id: string) => {
    if (isTableLockedForUser(id)) {
      setShowSidebar(false);
      setPendingCodeTableId(id);
      return;
    }
    proceedToTable(id);
  };

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#1a0f0a] via-[#0d0905] to-[#140b08] text-slate-200 font-sans selection:bg-[#c6a364]/30 selection:text-amber-200 ${
        isFullscreen ? 'p-0' : 'p-0 [@media(min-height:860px)]:py-3'
      }`}
    >
      <div className="absolute inset-0 pointer-events-none opacity-15 bg-[radial-gradient(#c6a364_1px,transparent_1px)] [background-size:24px_24px] mix-blend-overlay z-0"></div>
      
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

      <div
        className={`relative z-10 w-full h-full max-w-[1280px] ${
          isFullscreen ? 'sm:max-h-[960px]' : 'sm:max-h-[900px]'
        } mx-auto my-auto flex flex-col overflow-hidden shadow-2xl`}
      >
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

        {activeSettlementToast && (
          <PrivateSettlementReceiptBanner
            settlement={activeSettlementToast}
            onDismiss={() => setActiveSettlementToast(null)}
          />
        )}

        {/* Private Table 4-Digit PIN Gate Modal */}
        {pendingCodeTableId && tables[pendingCodeTableId] && (
          <PrivateTablePinGate
            table={tables[pendingCodeTableId]}
            variant="modal"
            onVerify={(pin) => verifyTableCode(pendingCodeTableId, pin)}
            onUnlocked={() => {
              const targetId = pendingCodeTableId;
              setPendingCodeTableId(null);
              proceedToTable(targetId);
            }}
            onCancel={() => setPendingCodeTableId(null)}
          />
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
          <Route path="/" element={<HomeView onSelectTable={handleTableSelect} onNavigate={handleNavigate} />} />
          <Route path="/t/:id" element={<BlackjackTable onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} isSidebarOpen={showSidebar} />} />
          <Route path="/host" element={<HostTableView onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} editTableId={null} />} />
          <Route path="/host/:id" element={<HostTableViewWrapper onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} />} />
          <Route path="/manage" element={<ManageTablesView onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} initialTableId={null} />} />
          <Route path="/manage/:id" element={<ManageTableViewWrapper onNavigate={handleNavigate} onToggleSidebar={() => setShowSidebar(true)} />} />
          <Route path="*" element={<Navigate to={`/`} replace />} />
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

