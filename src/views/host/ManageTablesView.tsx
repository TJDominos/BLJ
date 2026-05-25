import React, { useState, useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ChevronLeft, Plus, XCircle, Users, Activity, Loader2, Play, Settings, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { HeaderUI } from '@/components/blackjack/HeaderUI';
import { ConfirmModal } from '@/components/blackjack/ConfirmModal';

export function ManageTablesView({ onNavigate, onToggleSidebar, initialTableId }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables', editId?: string) => boolean | void, onToggleSidebar?: () => void, initialTableId?: string | null }) {
  const { tables, currentUser, gameRecords, closeTable } = useGameStore();
  const [selectedTableId, setSelectedTableId] = useState<string | 'all'>(initialTableId || 'all');
  const [activeTab, setActiveTab] = useState<'players' | 'rounds'>('players');
  const [sortField, setSortField] = useState<'time'|'rounds'|'tournaments'|'wager'|'win'|'profit'>('profit');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);
  const [roundsPage, setRoundsPage] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{title?: string; message: string | React.ReactNode; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel?: () => void; } | null>(null);
  
  const [showWithdrawPopup, setShowWithdrawPopup] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState<'USDC' | 'USDT'>('USDC');
  const [withdrawNetwork, setWithdrawNetwork] = useState<'Solana' | 'Ethereum' | 'BSC'>('Solana');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  
  const rowsPerPage = 50;

  const myTables = Object.values(tables).filter(t => t.houseId === currentUser?.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const selectedTables = useMemo(() => {
    if (selectedTableId === 'all') return myTables;
    return myTables.filter(t => t.id === selectedTableId);
  }, [myTables, selectedTableId]);

  const selectedTableIds = useMemo(() => selectedTables.map(t => t.id), [selectedTables]);

  const relevantRecords = useMemo(() => {
    return gameRecords.filter(r => selectedTableIds.includes(r.tableId)).sort((a, b) => b.timestamp - a.timestamp);
  }, [gameRecords, selectedTableIds]);

  const playerStats = useMemo(() => {
    const stats: Record<string, { userId: string, name: string, firstSeen: number, totalRounds: number, wager: number, win: number, profit: number, tournaments: Set<string> }> = {};
    
    // We don't have user names in game records directly, but we can guess it or use the userId 
    // In db, we have usersDb but we don't have access to it directly from store unless we fetch it.
    // For now we will just use userId as name if actual user objects are not available.
    
    relevantRecords.forEach(record => {
      const isTournament = tables[record.tableId]?.settings.mode === 'tournament';
      const usersInRecord = new Set<string>();
      record.seatResults.forEach(sr => {
        if (sr.userId && !sr.userId.startsWith('bot_')) { // ignore bots? Or include them? Include for now
          if (!stats[sr.userId]) {
            stats[sr.userId] = {
              userId: sr.userId,
              name: sr.userId.startsWith('bot_') ? `Bot ${sr.userId.split('_')[1]}` : sr.userId,
              firstSeen: record.timestamp,
              totalRounds: 0,
              wager: 0,
              win: 0,
              profit: 0,
              tournaments: new Set<string>()
            };
          }
          const p = stats[sr.userId];
          if (!usersInRecord.has(sr.userId)) {
             p.totalRounds++;
             usersInRecord.add(sr.userId);
          }
          p.wager += sr.bet;
          const winAmount = sr.bet + sr.net;
          p.win += winAmount > 0 ? winAmount : 0;
          if (!isTournament) {
            p.profit -= sr.net;
          } else {
            p.tournaments.add(record.tableId);
          }
          if (record.timestamp < p.firstSeen) p.firstSeen = record.timestamp;
        }
      });
    });
    
    return Object.values(stats);
  }, [relevantRecords, tables]);

  const sortedPlayerStats = useMemo(() => {
    return [...playerStats].sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case 'time': diff = a.firstSeen - b.firstSeen; break;
        case 'rounds': diff = a.totalRounds - b.totalRounds; break;
        case 'tournaments': diff = a.tournaments.size - b.tournaments.size; break;
        case 'wager': diff = a.wager - b.wager; break;
        case 'win': diff = a.win - b.win; break;
        case 'profit': diff = a.profit - b.profit; break;
      }
      return sortAsc ? diff : -diff;
    });
  }, [playerStats, sortField, sortAsc]);

  const handleCloseTable = async (tableId: string) => {
    setConfirmAction({
      title: 'Close Table',
      message: 'Are you sure you want to close this table? Remaining liquidity will be available for withdrawal, and players\' locked funds will be returned.',
      confirmText: 'Close Table',
      onConfirm: async () => {
        setConfirmAction(null);
        await closeTable(tableId);
        if (myTables.length === 1) {
            onNavigate('table');
        }
      },
      onCancel: () => setConfirmAction(null)
    });
  };



  return (
    <div className="w-full h-full flex flex-col bg-[#0f1118]">
      <AnimatePresence>
         {toastMessage && (
            <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#1a1c23] border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)] text-white px-6 py-3 rounded-full z-[100] font-bold">
               {toastMessage}
            </motion.div>
         )}
         
         {showWithdrawPopup && (
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
           >
             <motion.div 
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="bg-[#1a1c23] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4"
             >
               <h2 className="text-xl font-bold text-white uppercase tracking-wider">Withdraw Liquidity</h2>
               <div className="bg-white/5 rounded-xl p-4 text-center">
                   <div className="text-white/50 text-xs uppercase font-bold tracking-wider mb-1">Available to Withdraw</div>
                   <div className="text-2xl font-mono text-[#2ebaba]">${Number(withdrawAmount).toLocaleString()}</div>
               </div>
               
               <div className="flex flex-col gap-3">
                   <label className="text-sm font-bold text-white/70 uppercase">Select Network</label>
                   <div className="flex bg-white/5 rounded-xl p-1">
                      {['Solana', 'Ethereum', 'BSC'].map((net) => (
                         <button key={net} onClick={() => setWithdrawNetwork(net as 'Solana' | 'Ethereum' | 'BSC')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", withdrawNetwork === net ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80")}>
                            {net}
                         </button>
                      ))}
                   </div>
               </div>
               
               <div className="flex flex-col gap-3">
                   <label className="text-sm font-bold text-white/70 uppercase">Select Currency</label>
                   <div className="flex bg-white/5 rounded-xl p-1">
                      {['USDC', 'USDT'].map((cur) => (
                         <button key={cur} onClick={() => setWithdrawCurrency(cur as 'USDC' | 'USDT')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", withdrawCurrency === cur ? "bg-[#126b6f] text-white" : "text-white/50 hover:text-white/80")}>
                            {cur}
                         </button>
                      ))}
                   </div>
               </div>
               
               <div className="flex flex-col gap-3">
                   <label className="text-sm font-bold text-white/70 uppercase">Withdraw Address</label>
                   <input type="text" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder={`Enter ${withdrawNetwork} address...`} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-[#2ebaba] font-mono text-sm transition-colors" />
               </div>

               <div className="flex gap-3 mt-2">
                  <button className="flex-1 bg-white/5 py-3 rounded-xl text-white font-bold hover:bg-white/10 transition-colors" onClick={() => setShowWithdrawPopup(false)}>CANCEL</button>
                  <button className="flex-1 bg-[#20a37c] py-3 rounded-xl text-white font-bold hover:bg-[#1b8c6a] transition-colors flex items-center justify-center gap-2" onClick={() => {
                        let isValid = false;
                        if (withdrawNetwork === 'Solana') {
                            isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(withdrawAddress);
                        } else {
                            isValid = /^0x[a-fA-F0-9]{40}$/.test(withdrawAddress);
                        }
                        
                        if (!isValid) {
                             setToastMessage(`Invalid ${withdrawNetwork} address format.`);
                             setTimeout(() => setToastMessage(null), 3000);
                             return;
                        }
                        
                        setIsWithdrawing(true);
                        // Mock withdrawal delay
                        setTimeout(() => {
                           useGameStore.getState().withdrawLiquidity(selectedTableId, Number(withdrawAmount));
                           setIsWithdrawing(false);
                           setShowWithdrawPopup(false);
                           setToastMessage('Withdrawal successful.');
                           setTimeout(() => setToastMessage(null), 3000);
                        }, 1500);
                  }}>
                     {isWithdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'CONFIRM WITHDRAW'}
                  </button>
               </div>
             </motion.div>
           </motion.div>
         )}
      </AnimatePresence>
      <HeaderUI onLeave={() => onNavigate('table', selectedTableId !== 'all' ? selectedTableId : (initialTableId || undefined))} onToggleSidebar={onToggleSidebar} isMuted={false} setIsMuted={() => {}} />

      <main className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-[1024px] mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black uppercase text-white drop-shadow-md flex items-center gap-2">
                  Manage Tables
                </h1>
              </div>
              <p className="text-emerald-400 text-sm mt-1">Manage your tables and view player statistics</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button 
                 onClick={() => onToggleSidebar && onToggleSidebar()}
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-purple-500/30"
               >
                 View Lobby
              </button>
              <button 
                onClick={() => onNavigate('host_table')}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-emerald-500/30"
              >
                <Plus className="w-4 h-4" /> Host New Table
              </button>

            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
            <button
              onClick={() => setSelectedTableId('all')}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border border-white/10 shrink-0 snap-start",
                selectedTableId === 'all' 
                  ? "bg-[#126b6f] text-white shadow-lg border-[#28a19b]/50" 
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              All My Tables
            </button>
            {myTables.map(table => (
              <button
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border border-white/10 shrink-0 snap-start flex items-center gap-2",
                  selectedTableId === table.id 
                    ? "bg-[#126b6f] text-white shadow-lg border-[#28a19b]/50" 
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
              >
                {table.settings.mode === 'tournament' && <span className="text-yellow-400 text-xs px-1.5 py-0.5 rounded border border-yellow-400/30 bg-yellow-400/10 mr-1">T</span>}
                {table.name}
                <div className={cn("w-2 h-2 rounded-full", table.status === 'playing' ? "bg-emerald-400" : (table.status === 'closed' || table.status === 'closing') ? "bg-red-500" : "bg-yellow-400")}></div>
              </button>
            ))}
          </div>

          {selectedTableId === 'all' && myTables.length > 0 && (
             <div className="flex flex-col gap-4">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1 text-center">Total Visits</span>
                      <span className="text-white font-mono font-bold text-lg">{myTables.reduce((sum, t) => sum + (t.visits || 0), 0)}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1 text-center">Total Players</span>
                      <span className="text-white font-mono font-bold text-lg">{playerStats.length}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1 text-center">Total Profit</span>
                      <span className={cn("font-mono font-bold text-lg flex items-center justify-center gap-1", (() => {
                        const total = playerStats.reduce((sum, p) => sum + p.profit, 0);
                        return total > 0 ? 'text-emerald-400' : total < 0 ? 'text-red-400' : 'text-white';
                      })())}>
                        {(() => {
                           const total = playerStats.reduce((sum, p) => sum + p.profit, 0);
                           return `${total < 0 ? '-' : ''}${Math.abs(total).toLocaleString()}`;
                        })()}
                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                          <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                        </div>
                      </span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1 text-center">Total Fees</span>
                      <span className="text-yellow-400 font-mono font-bold text-lg flex items-center justify-center gap-1">
                        {myTables.filter(t => t.settings.mode === 'tournament').reduce((sum, t) => sum + (t.liquidity || 0), 0).toLocaleString()}
                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                          <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                        </div>
                      </span>
                  </div>
               </div>
             </div>
          )}

          {selectedTables.length > 0 && selectedTableId !== 'all' && (
             <div className="flex flex-col gap-4">
               <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Mode</span>
                      <span className={cn("font-mono text-sm uppercase tracking-wider", selectedTables[0].settings.mode === 'tournament' ? 'text-yellow-400' : 'text-blue-400')}>{selectedTables[0].settings.mode || 'REGULAR'}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Status</span>
                      <span className="text-white font-mono">{selectedTables[0].status.toUpperCase()}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">{selectedTables[0].settings.mode === 'tournament' ? 'Fees' : 'Liquidity'}</span>
                      <span className="text-yellow-400 font-mono font-bold">
                        {selectedTables[0].settings.mode === 'tournament' ? `$${selectedTables[0].liquidity.toLocaleString()}` : `$${selectedTables[0].liquidity.toLocaleString()}`}
                      </span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 text-center truncate">{selectedTables[0].settings.mode === 'tournament' ? 'Ticket Rev/Chips' : 'Min/Max Bet'}</span>
                      <span className="text-white font-mono text-sm max-w-full text-center">
                        {selectedTables[0].settings.mode === 'tournament' 
                          ? `$${(selectedTables[0].settings.tournament?.ticketPrice || 0) * playerStats.length} / ${Object.values(selectedTables[0].userBalances).reduce((sum: number, ub: any) => sum + ub.balance, 0)}` 
                          : `$${selectedTables[0].settings.minBet} / $${selectedTables[0].settings.maxBet}`}
                      </span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Players</span>
                      <span className="text-white font-mono">{selectedTables[0].seats.filter(s => s.userId).length} / {selectedTables[0].settings.maxSeats}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">Total Visits</span>
                      <span className="text-white font-mono">{selectedTables[0].visits || 0}</span>
                  </div>
               </div>
               <div className="flex flex-wrap gap-2 w-full">
                  <button 
                    onClick={() => onNavigate('host_table', selectedTableId)}
                    disabled={selectedTables[0].settings.mode === 'tournament' && selectedTables[0].status !== 'waiting'}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border",
                      selectedTables[0].settings.mode === 'tournament' && selectedTables[0].status !== 'waiting'
                        ? "bg-white/5 text-white/30 border-white/10"
                        : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/30"
                    )}
                  >
                    <Settings className="w-4 h-4" /> Edit
                  </button>
                  
                  {selectedTables[0].settings.mode === 'tournament' ? (
                    <>
                    <button 
                      onClick={() => onNavigate('host_table')}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-emerald-500/30"
                    >
                      <Plus className="w-4 h-4" /> New Tournament
                    </button>
                    {(selectedTables[0].status === 'waiting' || selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing') && (
                      <button 
                        onClick={() => handleCloseTable(selectedTableId)}
                        disabled={selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing'}
                        className={cn(
                          "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border",
                          (selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing') ? "bg-white/5 text-white/30 border-white/10" : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30"
                        )}
                      >
                        <XCircle className="w-4 h-4" /> {selectedTables[0].status === 'closed' ? 'Closed' : selectedTables[0].status === 'closing' ? 'Closing...' : 'Close'}
                      </button>
                    )}
                    </>
                  ) : selectedTables[0].status === 'closed' ? (
                    <button 
                      onClick={() => useGameStore.getState().resumeTable(selectedTableId)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-emerald-500/30"
                    >
                      <Play className="w-4 h-4" /> Start
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleCloseTable(selectedTableId)}
                      disabled={selectedTables[0].status === 'closing'}
                      className={cn(
                        "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border",
                        selectedTables[0].status === 'closing' ? "bg-white/5 text-white/30 border-white/10" : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30"
                      )}
                    >
                      <XCircle className="w-4 h-4" /> {selectedTables[0].status === 'closing' ? 'Closing...' : 'Close'}
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                        const link = `${window.location.origin}/t/${selectedTableId}`;
                        navigator.clipboard.writeText(link);
                        setToastMessage('Table link copied to clipboard!');
                        setTimeout(() => setToastMessage(null), 3000);
                    }}
                    disabled={selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing'}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border",
                      (selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing')
                        ? "bg-white/5 text-white/30 border-white/10"
                        : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border-orange-500/30"
                    )}
                  >
                    <Share2 className="w-4 h-4" /> Copy Link
                  </button>

                  <button
                    onClick={() => onNavigate('table', selectedTableId)}
                    disabled={selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing'}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border",
                      (selectedTables[0].status === 'closed' || selectedTables[0].status === 'closing')
                        ? "bg-white/5 text-white/30 border-white/10"
                        : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border-purple-500/30"
                    )}
                  >
                    <Play className="w-4 h-4" /> Enter Table
                  </button>
                  
                  <button 
                    onClick={() => {
                      if (selectedTables[0].status !== 'closed') {
                        setToastMessage('Close the table before withdrawing.');
                        setTimeout(() => setToastMessage(null), 3000);
                        return;
                      }
                      setWithdrawAmount(selectedTables[0].liquidity.toString());
                      setShowWithdrawPopup(true);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-indigo-500/30"
                  >
                    {selectedTables[0].settings.mode === 'tournament' ? 'Withdraw Fees' : 'Withdraw Liquidity'}
                  </button>
               </div>
             </div>
          )}

          <div className="bg-[#1a1c23] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
            {selectedTableId === 'all' ? (
              <div className="flex border-b border-white/5">
                <div className="flex-1 py-4 flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs text-emerald-400 border-b-2 border-emerald-400">
                  <Users className="w-4 h-4" /> Player List
                </div>
              </div>
            ) : (
              <div className="flex border-b border-white/5">
                <button
                  onClick={() => setActiveTab('players')}
                  className={cn(
                    "flex-1 py-4 flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs transition-colors",
                    activeTab === 'players' ? "bg-white/5 text-emerald-400 border-b-2 border-emerald-400" : "text-white/50 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <Users className="w-4 h-4" /> Player List
                </button>
                <button
                  onClick={() => setActiveTab('rounds')}
                  className={cn(
                    "flex-1 py-4 flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs transition-colors",
                    activeTab === 'rounds' ? "bg-white/5 text-emerald-400 border-b-2 border-emerald-400" : "text-white/50 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <Activity className="w-4 h-4" /> {selectedTables[0]?.settings.mode === 'tournament' ? 'Tournament Data' : 'Round Data'}
                </button>
              </div>
            )}

            <div className="p-4">
              {selectedTableId === 'all' || activeTab === 'players' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="text-xs uppercase text-white/40 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Avatar</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold cursor-pointer hover:text-white" onClick={() => { setSortField('time'); setSortAsc(!sortAsc); }}>Time {sortField==='time' && (sortAsc ? '↑' : '↓')}</th>
                        {selectedTableId !== 'all' && selectedTables[0]?.settings.mode === 'tournament' ? (
                          <th className="px-4 py-3 font-semibold text-right cursor-pointer hover:text-white" onClick={() => { setSortField('tournaments'); setSortAsc(!sortAsc); }}>Tournament X {sortField==='tournaments' && (sortAsc ? '↑' : '↓')}</th>
                        ) : (
                          <th className="px-4 py-3 font-semibold text-right cursor-pointer hover:text-white" onClick={() => { setSortField('rounds'); setSortAsc(!sortAsc); }}>Total Rounds {sortField==='rounds' && (sortAsc ? '↑' : '↓')}</th>
                        )}
                        <th className="px-4 py-3 font-semibold text-right cursor-pointer hover:text-white" onClick={() => { setSortField('wager'); setSortAsc(!sortAsc); }}>
                          <div className="flex items-center justify-end gap-1">
                            Wager
                            <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                              <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                            </div>
                            {sortField==='wager' && (sortAsc ? ' ↑' : ' ↓')}
                          </div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-right cursor-pointer hover:text-white" onClick={() => { setSortField('win'); setSortAsc(!sortAsc); }}>
                          <div className="flex items-center justify-end gap-1">
                            Win
                            <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                              <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                            </div>
                            {sortField==='win' && (sortAsc ? ' ↑' : ' ↓')}
                          </div>
                        </th>
                        {!(selectedTableId !== 'all' && selectedTables[0]?.settings.mode === 'tournament') && (
                          <th className="px-4 py-3 font-semibold text-right cursor-pointer hover:text-white" onClick={() => { setSortField('profit'); setSortAsc(!sortAsc); }}>
                            <div className="flex items-center justify-end gap-1">
                              Profit
                              <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                                <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                              </div>
                              {sortField==='profit' && (sortAsc ? ' ↑' : ' ↓')}
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayerStats.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-white/40">No players have joined yet.</td>
                        </tr>
                      )}
                      {sortedPlayerStats.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map(p => (
                        <tr key={p.userId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0d4f52] flex items-center justify-center font-bold text-white shadow-inner text-xs">
                              {p.name.substring(0, 2).toUpperCase()}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{p.name}</td>
                          <td className="px-4 py-3 text-white/60">{new Date(p.firstSeen).toLocaleString()}</td>
                          {selectedTableId !== 'all' && selectedTables[0]?.settings.mode === 'tournament' ? (
                            <td className="px-4 py-3 text-right font-mono">{p.tournaments.size}</td>
                          ) : (
                            <td className="px-4 py-3 text-right font-mono">{p.totalRounds}</td>
                          )}
                          <td className="px-4 py-3 text-right font-mono text-yellow-400/80">
                            <div className="flex items-center justify-end gap-1">
                              {p.wager.toLocaleString()}
                              <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                                <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400/80">
                            <div className="flex items-center justify-end gap-1">
                              {p.win.toLocaleString()}
                              <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                                <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                              </div>
                            </div>
                          </td>
                          {!(selectedTableId !== 'all' && selectedTables[0]?.settings.mode === 'tournament') && (
                            <td className={cn("px-4 py-3 text-right font-mono font-bold", p.profit > 0 ? "text-emerald-400" : p.profit < 0 ? "text-red-400" : "text-white/60")}>
                              <div className="flex items-center justify-end gap-1">
                                {p.profit > 0 ? '+' : ''}{p.profit.toLocaleString()}
                                <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0">
                                  <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                                </div>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sortedPlayerStats.length > rowsPerPage && (
                    <div className="flex justify-between items-center p-4 text-white/50 text-xs">
                      <span>Showing {page * rowsPerPage + 1} to {Math.min((page + 1) * rowsPerPage, sortedPlayerStats.length)} of {sortedPlayerStats.length}</span>
                      <div className="flex gap-2">
                        <button disabled={page === 0} onClick={() => setPage(page-1)} className="px-3 py-1 bg-white/5 disabled:opacity-30 rounded">Prev</button>
                        <button disabled={(page + 1) * rowsPerPage >= sortedPlayerStats.length} onClick={() => setPage(page+1)} className="px-3 py-1 bg-white/5 disabled:opacity-30 rounded">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedTables[0]?.settings.mode === 'tournament' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="text-xs uppercase text-white/40 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Start Time</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Seats</th>
                        <th className="px-4 py-3 font-semibold">Duration (min)</th>
                        <th className="px-4 py-3 font-semibold">Rounds Played</th>
                        <th className="px-4 py-3 font-semibold">Prize / Winners</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-white/60 whitespace-nowrap">{new Date(selectedTables[0].createdAt || Date.now()).toLocaleString()}</td>
                        <td className="px-4 py-3 text-white/80 font-mono uppercase">{selectedTables[0].status}</td>
                        <td className="px-4 py-3 font-mono">{selectedTables[0].seats.filter(s => s.userId).length} / {selectedTables[0].settings.maxSeats}</td>
                        <td className="px-4 py-3 font-mono">
                          {selectedTables[0].status === 'waiting' ? 0 : Math.floor((Date.now() - (selectedTables[0].createdAt || Date.now())) / 60000)}
                        </td>
                        <td className="px-4 py-3 font-mono">{relevantRecords.length}</td>
                        <td className="px-4 py-3 text-emerald-400 font-mono text-xs">
                          {selectedTables[0].status === 'closed' ? (
                             [...playerStats].sort((a,b) => b.win - a.win).slice(0, 3).map((w, idx) => (
                               <div key={w.userId} className="flex items-center gap-1">
                                 {idx+1}. {w.name} ({w.win.toLocaleString()}
                                 <div className="w-2.5 h-2.5 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden flex-shrink-0 inline-block align-middle mb-[1px]">
                                   <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                                 </div>)
                               </div>
                             ))
                          ) : 'TBD'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="text-xs uppercase text-white/40 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Round</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold">Seat</th>
                        <th className="px-4 py-3 font-semibold">Avatar</th>
                        <th className="px-4 py-3 font-semibold">User Name</th>
                        <th className="px-4 py-3 font-semibold text-right">Bet</th>
                        <th className="px-4 py-3 font-semibold text-right">Side Bet</th>
                        <th className="px-4 py-3 font-semibold text-right">Win</th>
                        <th className="px-4 py-3 font-semibold text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relevantRecords.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center py-8 text-white/40">No rounds played yet.</td>
                        </tr>
                      )}
                      {relevantRecords.flatMap((r, rIndex) => r.seatResults.map((sr, idx) => ({ ...sr, recordId: r.id, time: r.timestamp, roundNum: relevantRecords.length - rIndex })))
                        .slice(roundsPage * rowsPerPage, (roundsPage + 1) * rowsPerPage)
                        .map((sr, i) => (
                        <tr key={`${sr.recordId}-${i}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-white/60 font-mono">#{sr.roundNum}</td>
                          <td className="px-4 py-3 text-white/60 whitespace-nowrap">{new Date(sr.time).toLocaleTimeString()}</td>
                          <td className="px-4 py-3 text-white/60 font-mono">Seat {sr.seatIndex + 1}</td>
                          <td className="px-4 py-3">
                             <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${sr.userId}`} alt="Avatar" className="w-6 h-6 rounded-full bg-white/10" />
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{sr.userId?.startsWith('bot_') ? `Bot ${sr.userId.split('_')[1]}` : sr.userId || 'Empty'}</td>
                          <td className="px-4 py-3 text-right font-mono text-white/80">${sr.bet.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-white/60">${(sr.sideBet || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">${(sr.win || 0).toLocaleString()}</td>
                          <td className={cn("px-4 py-3 text-right font-mono font-bold", sr.net > 0 ? "text-emerald-400" : sr.net < 0 ? "text-red-400" : "text-white/60")}>
                            {sr.net > 0 ? '+' : ''}{sr.net.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {relevantRecords.flatMap(r => r.seatResults).length > rowsPerPage && (
                    <div className="flex justify-between items-center p-4 text-white/50 text-xs">
                      <span>Showing {roundsPage * rowsPerPage + 1} to {Math.min((roundsPage + 1) * rowsPerPage, relevantRecords.flatMap(r => r.seatResults).length)} of {relevantRecords.flatMap(r => r.seatResults).length}</span>
                      <div className="flex gap-2">
                        <button disabled={roundsPage === 0} onClick={() => setRoundsPage(roundsPage-1)} className="px-3 py-1 bg-white/5 disabled:opacity-30 rounded">Prev</button>
                        <button disabled={(roundsPage + 1) * rowsPerPage >= relevantRecords.flatMap(r => r.seatResults).length} onClick={() => setRoundsPage(roundsPage+1)} className="px-3 py-1 bg-white/5 disabled:opacity-30 rounded">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {confirmAction && (
        <ConfirmModal 
          action={confirmAction}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
