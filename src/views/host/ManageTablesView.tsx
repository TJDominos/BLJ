import React, { useState, useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ChevronLeft, Plus, XCircle, Users, Activity, Loader2, Play, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HeaderUI } from '@/components/blackjack/HeaderUI';

export function ManageTablesView({ onNavigate, onToggleSidebar }: { onNavigate: (view: 'lobby' | 'create' | 'table' | 'host_table' | 'manage_tables', editId?: string) => boolean | void, onToggleSidebar?: () => void }) {
  const { tables, currentUser, gameRecords, closeTable } = useGameStore();
  const [selectedTableId, setSelectedTableId] = useState<string | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'players' | 'rounds'>('players');

  const myTables = Object.values(tables).filter(t => t.houseId === currentUser?.id);

  const selectedTables = useMemo(() => {
    if (selectedTableId === 'all') return myTables;
    return myTables.filter(t => t.id === selectedTableId);
  }, [myTables, selectedTableId]);

  const selectedTableIds = useMemo(() => selectedTables.map(t => t.id), [selectedTables]);

  const relevantRecords = useMemo(() => {
    return gameRecords.filter(r => selectedTableIds.includes(r.tableId)).sort((a, b) => b.timestamp - a.timestamp);
  }, [gameRecords, selectedTableIds]);

  const playerStats = useMemo(() => {
    const stats: Record<string, { userId: string, name: string, firstSeen: number, totalRounds: number, wager: number, win: number, profit: number }> = {};
    
    // We don't have user names in game records directly, but we can guess it or use the userId 
    // In db, we have usersDb but we don't have access to it directly from store unless we fetch it.
    // For now we will just use userId as name if actual user objects are not available.
    
    relevantRecords.forEach(record => {
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
              profit: 0
            };
          }
          const p = stats[sr.userId];
          p.totalRounds++;
          p.wager += sr.bet;
          const winAmount = sr.bet + sr.net;
          p.win += winAmount > 0 ? winAmount : 0;
          p.profit += sr.net;
          if (record.timestamp < p.firstSeen) p.firstSeen = record.timestamp;
        }
      });
    });
    
    return Object.values(stats);
  }, [relevantRecords]);

  const handleCloseTable = async (tableId: string) => {
    if (window.confirm('Are you sure you want to close this table? Remaining liquidity will be returned to your balance.')) {
        await closeTable(tableId);
        // if user closed their last table, navigate back to lobby
        if (myTables.length === 1) {
            onNavigate('table');
        } else if (selectedTableId === tableId) {
            setSelectedTableId('all');
        }
    }
  };

  const handleCloseAll = async () => {
      if (window.confirm('Are you sure you want to close ALL your tables?')) {
          for (const t of myTables) {
              if (t.status !== 'closed') {
                  await closeTable(t.id);
              }
          }
          onNavigate('table');
      }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0f1118]">
      <HeaderUI onLeave={() => onNavigate('table')} onToggleSidebar={onToggleSidebar} isMuted={false} setIsMuted={() => {}} />

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
              {myTables.length > 0 && selectedTableId === 'all' && (
                 <button 
                   onClick={handleCloseAll}
                   className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-red-500/30"
                 >
                   <XCircle className="w-4 h-4" /> Close All
                 </button>
              )}
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
            {myTables.filter(t => t.status !== 'closed').map(table => (
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
                <div className={cn("w-2 h-2 rounded-full", table.status === 'playing' ? "bg-emerald-400" : "bg-yellow-400")}></div>
              </button>
            ))}
          </div>

          {selectedTables.length > 0 && selectedTableId !== 'all' && (
             <div className="flex flex-col gap-4">
               <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Mode</span>
                      <span className={cn("font-mono text-sm uppercase tracking-wider", selectedTables[0].settings.mode === 'tournament' ? 'text-yellow-400' : 'text-blue-400')}>{selectedTables[0].settings.mode || 'REGULAR'}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Status</span>
                      <span className="text-white font-mono">{selectedTables[0].status.toUpperCase()}</span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Liquidity</span>
                      <span className="text-yellow-400 font-mono font-bold">
                        {selectedTables[0].settings.mode === 'tournament' ? 'N/A' : `$${selectedTables[0].liquidity.toLocaleString()}`}
                      </span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 text-center truncate">{selectedTables[0].settings.mode === 'tournament' ? 'Ticket/Chips' : 'Min/Max Bet'}</span>
                      <span className="text-white font-mono text-sm max-w-full text-center">
                        {selectedTables[0].settings.mode === 'tournament' 
                          ? `$${selectedTables[0].settings.tournament?.ticketPrice} / ${selectedTables[0].settings.tournament?.startingChips}` 
                          : `$${selectedTables[0].settings.minBet} / $${selectedTables[0].settings.maxBet}`}
                      </span>
                  </div>
                  <div className="bg-[#1a1c23] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
                      <span className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">Players</span>
                      <span className="text-white font-mono">{selectedTables[0].seats.filter(s => s.userId).length} / {selectedTables[0].settings.maxSeats}</span>
                  </div>
               </div>
               <div className="flex flex-wrap gap-2 w-full">
                  <button 
                    onClick={() => onNavigate('host_table', selectedTableId)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-blue-500/30"
                  >
                    <Settings className="w-4 h-4" /> Edit
                  </button>
                  <button 
                    onClick={() => handleCloseTable(selectedTableId)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-red-500/30"
                  >
                    <XCircle className="w-4 h-4" /> Close
                  </button>
                  {selectedTables[0].status === 'paused' ? (
                    <button 
                      onClick={() => useGameStore.getState().resumeTable(selectedTableId)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-emerald-500/30"
                    >
                      <Play className="w-4 h-4" /> Start
                    </button>
                  ) : (
                    <button 
                      onClick={() => useGameStore.getState().pauseTable(selectedTableId)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-yellow-500/30"
                    >
                      <XCircle className="w-4 h-4" /> Pause
                    </button>
                  )}
                  <button 
                    onClick={() => useGameStore.getState().withdrawLiquidity(selectedTableId, Number(prompt('Amount to withdraw:', '0') || 0))}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg font-bold uppercase text-xs tracking-wider transition-colors border border-indigo-500/30"
                  >
                    Withdraw Liquidity
                  </button>
               </div>
             </div>
          )}

          <div className="bg-[#1a1c23] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
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
                <Activity className="w-4 h-4" /> Round Data
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'players' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="text-xs uppercase text-white/40 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Avatar</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold text-right">Total Rounds</th>
                        <th className="px-4 py-3 font-semibold text-right">Wager</th>
                        <th className="px-4 py-3 font-semibold text-right">Win</th>
                        <th className="px-4 py-3 font-semibold text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerStats.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-white/40">No players have joined yet.</td>
                        </tr>
                      )}
                      {playerStats.map(p => (
                        <tr key={p.userId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0d4f52] flex items-center justify-center font-bold text-white shadow-inner text-xs">
                              {p.name.substring(0, 2).toUpperCase()}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{p.name}</td>
                          <td className="px-4 py-3 text-white/60">{new Date(p.firstSeen).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono">{p.totalRounds}</td>
                          <td className="px-4 py-3 text-right font-mono text-yellow-400/80">${p.wager.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400/80">${p.win.toLocaleString()}</td>
                          <td className={cn("px-4 py-3 text-right font-mono font-bold", p.profit > 0 ? "text-emerald-400" : p.profit < 0 ? "text-red-400" : "text-white/60")}>
                            {p.profit > 0 ? '+' : ''}{p.profit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-white/80">
                    <thead className="text-xs uppercase text-white/40 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold">User Name</th>
                        <th className="px-4 py-3 font-semibold text-right">Bet Amount</th>
                        <th className="px-4 py-3 font-semibold text-right">Win Amount</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relevantRecords.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-white/40">No rounds played yet.</td>
                        </tr>
                      )}
                      {relevantRecords.flatMap(r => r.seatResults.map((sr, idx) => ({ ...sr, recordId: r.id, time: r.timestamp }))).map((sr, i) => (
                        <tr key={`${sr.recordId}-${i}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-white/60 whitespace-nowrap">{new Date(sr.time).toLocaleTimeString()}</td>
                          <td className="px-4 py-3 font-bold text-white">{sr.userId?.startsWith('bot_') ? `Bot ${sr.userId.split('_')[1]}` : sr.userId || 'Empty'}</td>
                          <td className="px-4 py-3 text-right font-mono text-yellow-400/80">${sr.bet.toLocaleString()}</td>
                          <td className={cn("px-4 py-3 text-right font-mono font-bold", sr.net > 0 ? "text-emerald-400" : "text-white/60")}>
                            ${(sr.net > 0 ? sr.bet + sr.net : 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-white/10 text-white/80 px-2 py-1 rounded text-xs font-mono uppercase tracking-wider">{sr.action}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
