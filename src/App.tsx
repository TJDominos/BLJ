import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { BlackjackTable } from './views/BlackjackTable';
import { HomeView } from './views/HomeView';
import { HostTableView } from './views/host/HostTableView';
import { ManageTablesView } from './views/host/ManageTablesView';
import { useGameStore } from './store/gameStore';
import { LiveTablesSidebar } from './components/blackjack/LiveTablesSidebar';
import { AnimatePresence } from 'motion/react';

import { ConfirmModal } from './components/blackjack/ConfirmModal';
import { initRandseedRuntime } from './lib/randseedRuntime';
import { Lock, X } from 'lucide-react';

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
    verifyTableCode,
    unlockTableBalance,
    leaveTable,
    closeTable,
    syncStateFromServer
  } = useGameStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmAction, setConfirmAction] = useState<any>(null);

  // Private table 4-digit code prompt state
  const [pendingCodeTableId, setPendingCodeTableId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  useEffect(() => {
    initRandseedRuntime();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      login('Player');
    }
  }, [currentUser, login]);

  // Real-time table state synchronization across multiple players/tabs
  useEffect(() => {
    if (!currentUser?.id) return;
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        syncStateFromServer();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id, syncStateFromServer]);

  const isTableLockedForUser = (tableId: string): boolean => {
    const t = tables[tableId];
    if (!t) return false;
    const isPrivate = !t.settings.isPublic || Boolean(t.settings.hasTableCode);
    if (!isPrivate) return false;
    if (currentUser && t.houseId === currentUser.id) return false;
    if (unlockedTableIds[tableId]) return false;
    if (currentUser && t.seats.some(s => s.userId === currentUser.id)) return false;
    if (currentUser && t.userBalances?.[currentUser.id]) return false;
    return true;
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

  // Sync activeTableId with URL param if on a table view
  useEffect(() => {
    const pathMatch = location.pathname.match(/^\/t\/([\w_-]+)/);
    if (pathMatch && pathMatch[1]) {
      const tableId = pathMatch[1];
      if (tables[tableId]) {
        if (isTableLockedForUser(tableId)) {
          setPendingCodeTableId(tableId);
          setCodeInput('');
          setCodeError(null);
          navigate('/', { replace: true });
          return;
        }
        if (activeTableId !== tableId) {
          observeTable(tableId);
        }
      }
    }
  }, [location.pathname, tables, observeTable, activeTableId, currentUser?.id, unlockedTableIds]);

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

  const executeNavigation = (view: string, tableId?: string) => {
    if (view === 'lobby') {
       navigate('/');
    } else if (view === 'table') {
       navigate(`/t/${tableId || activeTableId || 'table_1'}`);
    } else if (view === 'host_table') {
       navigate(tableId ? `/host/${tableId}` : `/host`);
    } else if (view === 'manage_tables') {
       navigate(tableId ? `/manage/${tableId}` : `/manage`);
    } else {
       navigate('/');
    }
  };

  const handleNavigate = (view: string, tableId?: string): boolean => {
    const pathMatch = location.pathname.match(/^\/t\/([\w_-]+)/);
    const currentUrlTableId = pathMatch?.[1] || activeTableId;
    const isLeavingCurrentTable =
      location.pathname.startsWith('/t/') &&
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
    const pathMatch = location.pathname.match(/^\/t\/([\w_-]+)/);
    const currentUrlTableId = pathMatch?.[1] || activeTableId;

    if (location.pathname.startsWith('/t/') && currentUrlTableId && currentUrlTableId !== id && tables[currentUrlTableId] && currentUser) {
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
      setPendingCodeTableId(id);
      setCodeInput('');
      setCodeError(null);
      return;
    }
    proceedToTable(id);
  };

  const handleVerifyTableCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCodeTableId) return;
    const trimmed = codeInput.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setCodeError('Please enter a 4-digit Code (0-9).');
      return;
    }
    setIsVerifyingCode(true);
    setCodeError(null);
    const ok = await verifyTableCode(pendingCodeTableId, trimmed);
    setIsVerifyingCode(false);
    if (ok) {
      const targetId = pendingCodeTableId;
      setPendingCodeTableId(null);
      setCodeInput('');
      proceedToTable(targetId);
    } else {
      setCodeError('Incorrect 4-digit Code. Please try again.');
    }
  };

  return (
    <div className="w-full h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#1a0f0a] via-[#0d0905] to-[#140b08] text-slate-200 font-sans selection:bg-[#c6a364]/30 selection:text-amber-200">
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

      <div className="relative z-10 w-full h-full max-w-[1280px] max-h-[720px] mx-auto flex flex-col overflow-hidden">
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

        {/* Private Table 4-Digit Code Modal */}
        {pendingCodeTableId && tables[pendingCodeTableId] && (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPendingCodeTableId(null);
            }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#121915] border border-[#c6a364]/40 shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Code</h3>
                </div>
                <button
                  onClick={() => setPendingCodeTableId(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleVerifyTableCodeSubmit} className="p-5 space-y-4 text-sm">
                <p className="text-slate-300 leading-relaxed">
                  Enter the 4-digit Code to join <span className="font-bold text-white">{tables[pendingCodeTableId].name}</span>:
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  placeholder="0000"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full px-4 py-3 rounded-xl bg-black/50 border border-amber-400/40 text-amber-300 font-mono text-2xl font-bold tracking-[0.5em] text-center focus:outline-none focus:border-[#d4af37]"
                />
                {codeError && (
                  <div className="text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-center">
                    {codeError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingCodeTableId(null)}
                    className="px-4 py-2 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingCode || codeInput.length !== 4}
                    className="px-5 py-2 rounded-xl font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] disabled:opacity-50 cursor-pointer"
                  >
                    {isVerifyingCode ? 'Verifying...' : 'Unlock & Enter'}
                  </button>
                </div>
              </form>
            </div>
          </div>
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

