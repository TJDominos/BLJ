import React, { useState } from 'react';
import { useGameStore, TableSettings, TournamentSettings } from '@/store/gameStore';
import { calculateBaseRTP } from '@/backend/gameRules';
import { systemConfig } from '@/config/systemConfig';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChevronDown, ChevronRight, Copy, Coins, Settings as SettingsIcon, CheckCircle2, RefreshCw, X, Play, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HeaderUI } from '@/components/blackjack/HeaderUI';

export function HostTableView({ onNavigate, onToggleSidebar, editTableId }: { onNavigate: (view: 'lobby' | 'table' | 'dashboard' | 'manage_tables', editId?: string) => void, onToggleSidebar?: () => void, editTableId?: string | null }) {
  const { currentUser, createTable, tables, updateTableSettings } = useGameStore();

  const editingTable = editTableId ? tables[editTableId] : null;

  const [expandedSection, setExpandedSection] = useState<'liquidity' | 'settings' | null>('settings');
  const [depositAmount, setDepositAmount] = useState('150');
  const [mockTableId] = useState(() => Math.random().toString(36).substring(2, 8));
  const [isMuted, setIsMuted] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const defaultTournament: TournamentSettings = {
       ticketPrice: 100,
       startingChips: 1000,
       hostFeePct: 3,
       platformFeePct: 2,
       minBetChips: 50,
       isForcedAnte: true,
       isScheduledEscalation: false,
       antePct: 1,
       escalationRounds: 2,
       isSurvivorCap: true,
       targetSurvivors: 2, // Default max seats is 3, so survivors is 2
       isHardCapRounds: false,
       maxRounds: 30,
       prizeDistribution: 'survivorPaytable',
       minSeats: 3,
       autoCloseAndRefundTimeHours: 1
  };

  const [settings, setSettings] = useState<TableSettings>(editingTable?.settings ? {
    ...editingTable.settings,
    name: editingTable.name || editingTable.settings.name || '',
    description: editingTable.description || editingTable.settings.description || '',
    mode: editingTable.settings.mode || 'regular',
    tournament: editingTable.settings.tournament || defaultTournament
  } : {
    name: '',
    description: '',
    minBet: 10,
    maxBet: 50,
    minBuyIn: 50,
    secretBets: true,
    actionTimeLimit: systemConfig.actionTimeLimit.normal,
    isPublic: true,
    maxSeats: 3,
    winningRule: 'standard',
    order: 'seat',
    mode: 'regular',
    tournament: defaultTournament
  });

  const minLiquidity = settings.maxBet * settings.maxSeats;

  const prevMinLiquidity = React.useRef(minLiquidity);
  React.useEffect(() => {
    if (prevMinLiquidity.current !== minLiquidity) {
      setDepositAmount(minLiquidity.toString());
      prevMinLiquidity.current = minLiquidity;
    }
  }, [minLiquidity]);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!settings.name) return;
    if (settings.mode !== 'tournament' && (!settings.minBet || !settings.maxBet || settings.maxBet < settings.minBet)) return;
    if (settings.mode === 'tournament') {
        if (settings.tournament?.startingChips === '' as any || settings.tournament!.startingChips < 1000) return;
        if (settings.tournament?.hostFeePct === '' as any) return;
    }
    setIsHosting(true);
    if (editingTable) {
        await updateTableSettings(editingTable.id, settings);
        setIsHosting(false);
        onNavigate('manage_tables');
    } else {
        const newTableId = await createTable(settings, settings.mode === 'tournament' ? 0 : minLiquidity);
        setIsHosting(false);
        onNavigate('table', newTableId); 
    }
  };

  const [copiedToast, setCopiedToast] = useState(false);

  const copyToClipboard = (_text: string) => {
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  if (!currentUser) return null;

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent font-sans overflow-hidden">
      
      <HeaderUI 
        onLeave={() => onNavigate('table')}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        onToggleSidebar={() => onToggleSidebar && onToggleSidebar()}
      />

      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="w-full max-w-[1024px] flex flex-col items-center gap-2 z-40 px-2 sm:px-4 pt-2 sm:pt-3 pb-1 relative pointer-events-none">
          <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 pointer-events-auto w-full max-w-[420px] mx-auto mt-[-2px]">
            <div className="bg-[#1e2025]/90 backdrop-blur-sm border border-white/10 rounded-full px-3 sm:px-6 shadow-2xl flex items-center justify-center flex-1 h-[36px] min-w-[240px]">
               <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider">
                 <span className="text-white/40 uppercase">Balance</span>
                 <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                 </div>
                 <span className="text-[#32d5a4] text-sm">{currentUser.balance.toLocaleString('en-US', {minimumFractionDigits: currentUser.balance % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}</span>
               </div>
            </div>
            <button 
              onClick={() => onNavigate('table')}
              className="flex text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#126b6f] hover:bg-[#0d4f52] items-center gap-1 shadow-lg transition-transform hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" /> Back to Table
            </button>
          </div>
        </div>

        <div className="w-full max-w-[1024px] flex flex-col min-h-[500px] pl-[24px] py-[12px] pr-[12px] sm:pr-[24px] gap-[12px] mx-auto z-10 pointer-events-auto bg-[#1a1b23] sm:rounded-[32px] sm:mb-[48px] mb-[48px] pb-12 border border-x-0 border-white/5 sm:border-x shadow-2xl shrink-0">
        
        {/* Title */}
        <div className="flex flex-col items-center gap-2 py-4 text-center px-4">
          <p className="text-white/60 text-sm w-full leading-relaxed">
            Create private games for friends or public high-roller tables with user-hosted blackjack, fully backed by on-chain verifiable randomness.
          </p>
        </div>

        {/* Table Mode Switcher */}
        <div className="flex bg-black/40 rounded-xl p-1 border border-white/5 w-full md:w-fit self-center">
            <button
                className={`flex-1 px-8 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${settings.mode === 'regular' || !settings.mode ? 'bg-[#126b6f] text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                onClick={() => setSettings({ ...settings, mode: 'regular' })}
            >
                Regular
            </button>
            <button
                className={`flex-1 px-8 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${settings.mode === 'tournament' ? 'bg-[#126b6f] text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                onClick={() => {
                   let newMaxSeats = settings.maxSeats;
                   if (newMaxSeats < 3) newMaxSeats = 3;
                   setSettings({ ...settings, mode: 'tournament', maxSeats: newMaxSeats, tournament: { ...settings.tournament!, targetSurvivors: Math.max(1, (settings.tournament?.minSeats || 3) - 1) } });
                }}
            >
                Tournament
            </button>
        </div>

        {/* 1. Set the table */}
      <Card className="overflow-hidden bg-white/5 shadow-sm rounded-3xl border border-white/10 p-3">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'settings' ? null : 'settings')}
          className="w-full flex justify-between items-center hover:bg-white/5 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
             <div className={`p-2 sm:p-3 rounded-full shrink-0 ${expandedSection === 'settings' ? 'bg-[#126b6f] text-white' : 'bg-white/10 shadow-sm text-white/80'}`}>
               <SettingsIcon className="w-4 h-4 sm:w-6 sm:h-6" />
             </div>
             <div className="text-left flex flex-col gap-1 sm:gap-2 truncate">
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 sm:items-center">
                  <div className="flex items-center gap-1.5 font-bold tracking-wider">
                    <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Table Rules:</span>
                    <div className="flex items-center gap-1 text-white text-[13px] sm:text-[16px] truncate">
                      {settings.mode === 'tournament' ? (
                        <>
                          <span>Entry</span>
                          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                          </div>
                          <span>{settings.tournament?.ticketPrice?.toLocaleString('en-US') || 0} Game Coins</span>
                        </>
                      ) : (
                        <>
                          <span>Min</span>
                          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                          </div>
                          <span>{settings.minBet.toLocaleString('en-US', {minimumFractionDigits: settings.minBet % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})} <span className="text-white/40">/</span> Max</span>
                          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                          </div>
                          <span>{settings.maxBet.toLocaleString('en-US', {minimumFractionDigits: settings.maxBet % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:block w-px h-4 bg-white/10 mx-2"></div>
                  <div className="flex items-center gap-1.5 font-bold tracking-wider">
                    <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Seats / Time:</span>
                    <span className="text-white text-[13px] sm:text-[16px] truncate">{settings.maxSeats} Seats / {settings.actionTimeLimit}s</span>
                  </div>
                </div>
             </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2">
             <span className="hidden sm:inline text-[13px] sm:text-[14px] font-bold uppercase tracking-wider text-[#126b6f] shrink-0">Set Table</span>
             {expandedSection === 'settings' ? <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 shrink-0" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 shrink-0" />}
          </div>
        </button>

        <AnimatePresence>
          {expandedSection === 'settings' && (
            <motion.div 
               initial={{ height: 0 }} 
               animate={{ height: 'auto' }} 
               exit={{ height: 0 }}
               className="overflow-hidden bg-black/20 text-white"
            >
              <div className="p-3 border-t border-white/5 flex flex-col gap-4">
                 <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                       Table Name <span className="text-rose-400">*</span>
                     </label>
                     <Input 
                       type="text" 
                       value={settings.name || ''}
                       onChange={e => setSettings({ ...settings, name: e.target.value })}
                       maxLength={30}
                       placeholder="Limit to 30 characters"
                       className={`h-10 bg-white/5 text-white ${hasAttemptedSubmit && !settings.name ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                     />
                     {hasAttemptedSubmit && !settings.name && (
                       <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                         Table name is required
                       </p>
                     )}
                   </div>
                  
                  {settings.mode !== 'tournament' && (
                  <>
                  <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
                       Min Bet 
                       <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                       </div>
                     </label>
                     <Input 
                        type="text" 
                        value={settings.minBet === '' as any ? '' : (settings.minBet || 0).toLocaleString()}
                        onChange={e => {
                          const valStr = e.target.value.replace(/,/g, '');
                          if (valStr === '') {
                            setSettings({ ...settings, minBet: '' as any });
                          } else {
                            const val = parseInt(valStr);
                            if (!isNaN(val)) {
                              setSettings({ ...settings, minBet: val, maxBet: val * 5, minBuyIn: val * 5 });
                            }
                          }
                        }}
                        className={`h-10 bg-white/5 text-white ${settings.minBet === '' as any || settings.minBet < 1 ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                      />
                      {settings.minBet === '' as any || settings.minBet < 1 ? (
                        <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                          Must be at least 1
                        </p>
                      ) : null}
                   </div>
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
                       Max Bet 
                       <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                       </div>
                     </label>
                     <Input 
                        type="text" 
                        value={settings.maxBet === '' as any ? '' : (settings.maxBet || 0).toLocaleString()}
                        onChange={e => {
                          const valStr = e.target.value.replace(/,/g, '');
                          if (valStr === '') {
                            setSettings({ ...settings, maxBet: '' as any });
                          } else {
                            const val = parseInt(valStr);
                            if (!isNaN(val)) {
                              setSettings({ ...settings, maxBet: val });
                            }
                          }
                        }}
                        className={`h-10 bg-white/5 text-white ${settings.maxBet === '' as any || (settings.maxBet > 0 && settings.maxBet < (settings.minBet || 1)) ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                      />
                      {settings.maxBet === '' as any ? (
                        <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                          Required
                        </p>
                      ) : settings.maxBet > 0 && settings.maxBet < (settings.minBet || 1) ? (
                        <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                          less than min bet
                        </p>
                      ) : null}
                   </div>
                 </div>
                 
                 <div className="mt-4">
                   <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
                     Min Buy-In To Sit
                     <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                     </div>
                   </label>
                   <Input 
                      type="text" 
                      value={settings.minBuyIn === '' as any ? '' : (settings.minBuyIn || (settings.minBet * 5)).toLocaleString()}
                      onChange={e => {
                        const valStr = e.target.value.replace(/,/g, '');
                        if (valStr === '') {
                          setSettings({ ...settings, minBuyIn: '' as any });
                        } else {
                          const val = parseInt(valStr);
                          if (!isNaN(val)) {
                            setSettings({ ...settings, minBuyIn: val });
                          }
                        }
                      }}
                      className={`h-10 bg-white/5 text-white ${settings.minBuyIn === '' as any || (settings.minBuyIn > 0 && settings.minBuyIn < (settings.minBet || 1)) ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                    />
                    {settings.minBuyIn === '' as any ? (
                      <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                        Required
                      </p>
                    ) : settings.minBuyIn > 0 && settings.minBuyIn < (settings.minBet || 1) ? (
                      <p className="text-red-500 text-[10px] mt-1.5 font-semibold uppercase tracking-wider">
                        less than min bet
                      </p>
                    ) : null}
                 </div>
                 </>
                 )}

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                         Max Seats ({settings.mode === 'tournament' ? '3-15' : '1-7'})
                       </label>
                       <select 
                         value={settings.maxSeats.toString()}
                         onChange={e => {
                           const minSeatsAllowed = settings.mode === 'tournament' ? 3 : 1;
                           const maxSeatsAllowed = settings.mode === 'tournament' ? 15 : 7;
                           const newSeats = Math.min(maxSeatsAllowed, Math.max(minSeatsAllowed, parseInt(e.target.value) || minSeatsAllowed));
                           
                           let newSettings = { ...settings, maxSeats: newSeats };
                           if (settings.mode === 'tournament' && newSettings.tournament) {
                             const newTournament = { ...newSettings.tournament };
                             newTournament.targetSurvivors = Math.max(1, Math.min(newTournament.targetSurvivors || 1, (newTournament.minSeats || 3) - 1));
                             if (newTournament.minSeats && newTournament.minSeats > newSeats) {
                               newTournament.minSeats = newSeats;
                             }
                             newSettings.tournament = newTournament;
                           }
                           setSettings(newSettings);
                         }}
                         className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#126b6f]"
                       >
                         {(settings.mode === 'tournament' ? [3,4,5,6,7,8,9,10,11,12,13,14,15] : [1,2,3,4,5,6,7]).map(n => <option key={n} value={n}>{n}</option>)}
                       </select>
                    </div>
                    {settings.mode === 'tournament' && (
                       <div>
                         <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap">
                           Min Seats (to start)
                         </label>
                         <select 
                           value={settings.tournament?.minSeats?.toString() || '3'}
                           onChange={e => {
                             const minS = parseInt(e.target.value);
                             let tSettings = { ...settings.tournament!, minSeats: minS };
                             if (tSettings.isSurvivorCap && tSettings.targetSurvivors !== undefined && tSettings.targetSurvivors > minS - 1) {
                               tSettings.targetSurvivors = Math.max(1, minS - 1);
                             }
                             setSettings({ ...settings, tournament: tSettings });
                           }}
                           className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#126b6f]"
                         >
                           {Array.from({ length: Math.min(settings.maxSeats, 7) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                         </select>
                       </div>
                    )}
                    <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                         Action Time
                       </label>
                       <select 
                         value={settings.actionTimeLimit.toString()}
                         onChange={e => setSettings({ ...settings, actionTimeLimit: parseInt(e.target.value) })}
                         className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#126b6f]"
                       >
                         <option value={systemConfig.actionTimeLimit.fast.toString()}>Fast ({systemConfig.actionTimeLimit.fast}s)</option>
                         <option value={systemConfig.actionTimeLimit.normal.toString()}>Normal ({systemConfig.actionTimeLimit.normal}s)</option>
                         <option value={systemConfig.actionTimeLimit.slow.toString()}>Slow ({systemConfig.actionTimeLimit.slow}s)</option>
                       </select>
                    </div>
                    {settings.mode === 'tournament' && (
                       <div>
                         <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap overflow-hidden text-ellipsis" title="Auto Cancel (Timeout)">
                           Auto Cancel (Timeout)
                         </label>
                         <select 
                           value={settings.tournament?.autoCloseAndRefundTimeHours?.toString() || '1'}
                           onChange={e => setSettings({ ...settings, tournament: { ...settings.tournament!, autoCloseAndRefundTimeHours: parseInt(e.target.value) } })}
                           className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#126b6f]"
                         >
                           {[1, 2, 4, 8, 12, 24].map(h => <option key={h} value={h}>{h} Hour{h > 1 ? 's' : ''}</option>)}
                         </select>
                       </div>
                    )}
                 </div>


                </div>

                <div className="hidden md:block w-px bg-white/10" />
                
                <div className="flex-1 space-y-4 md:pt-0 pt-2 flex flex-col justify-start">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                      Description
                    </label>
                    <Input 
                      type="text" 
                      value={settings.description || ''}
                      onChange={e => setSettings({ ...settings, description: e.target.value })}
                      maxLength={50}
                      placeholder="Up to 50 chars..."
                      className="h-10 bg-white/5 border-white/10 text-white focus:border-[#126b6f]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                        Table Visibility
                      </label>
                      <label className="flex h-10 w-full items-center justify-between px-3 rounded-xl border border-white/10 bg-white/5 shadow-sm cursor-pointer hover:border-white/20 transition-colors">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="text-xs font-medium text-white shrink-0">{settings.isPublic ? 'Public' : 'Private'}</span>
                          <span className="text-[10px] text-white/40 font-normal truncate mt-0.5">{settings.isPublic ? '(Visible in lobby)' : '(Invite link only)'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.isPublic ? 'bg-[#126b6f]' : 'bg-white/20'}`}
                          >
                            <input 
                              type="checkbox" 
                              checked={settings.isPublic}
                              onChange={e => setSettings({ ...settings, isPublic: e.target.checked })}
                              className="sr-only"
                            />
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.isPublic ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                          </div>
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                        Bet Visibility
                      </label>
                      <label className="flex h-10 w-full items-center justify-between px-3 rounded-xl border border-white/10 bg-white/5 shadow-sm cursor-pointer hover:border-white/20 transition-colors">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="text-xs font-medium text-white shrink-0">Secret</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                         <div
                           className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.secretBets ? 'bg-[#126b6f]' : 'bg-white/20'}`}
                         >
                          <input 
                            type="checkbox" 
                            checked={settings.secretBets}
                            onChange={e => setSettings({ ...settings, secretBets: e.target.checked })}
                            className="sr-only"
                          />
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.secretBets ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                         </div>
                        </div>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 shadow-sm overflow-hidden">
                      <div className="flex flex-col flex-1 min-w-0 pr-2">
                        <span className="text-xs font-semibold text-white/50 mb-1">Invite Link</span>
                        <span className="text-sm font-mono text-white truncate">{`/t/${mockTableId}`}</span>
                      </div>
                      <button 
                        onClick={(e) => { 
                          e.preventDefault(); 
                          const link = `/t/${mockTableId}`;
                          copyToClipboard(link); 
                        }} 
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {settings.mode === 'tournament' && (
               <div className="flex flex-col gap-4 border-t border-white/10 pt-4 mt-6">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="grid grid-cols-2 gap-2">
                     <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1 whitespace-nowrap">
                         Ticket Price (Coins)
                         <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                         </div>
                       </label>
                       <Input 
                         type="text" 
                         value={settings.tournament?.ticketPrice === '' as any ? '' : (settings.tournament?.ticketPrice || 0).toLocaleString()}
                         onChange={e => {
                           const rawStr = e.target.value.replace(/,/g, '');
                           if (rawStr === '') {
                             setSettings({ ...settings, tournament: { ...settings.tournament!, ticketPrice: '' as any } });
                           } else {
                             const val = parseInt(rawStr);
                             if (!isNaN(val)) {
                               setSettings({ ...settings, tournament: { ...settings.tournament!, ticketPrice: val } });
                             }
                           }
                         }}
                         className={`h-10 bg-white/5 text-white ${settings.tournament?.ticketPrice === '' as any || settings.tournament!.ticketPrice < 0 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                       />
                       {settings.tournament?.ticketPrice === '' as any ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Ticket Price is required.</div>
                       ) : settings.tournament!.ticketPrice < 0 ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Must be at least 0.</div>
                       ) : null}
                     </div>
                     <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-emerald-300/80 mb-2 block whitespace-nowrap">
                         Locked Allowance
                       </label>
                       <Input 
                         type="text" 
                         value={settings.tournament?.startingChips === '' as any ? '' : (settings.tournament?.startingChips || 5000).toLocaleString()}
                         onChange={e => {
                           const rawStr = e.target.value.replace(/,/g, '');
                           if (rawStr === '') {
                             setSettings({ ...settings, tournament: { ...settings.tournament!, startingChips: '' as any } });
                           } else {
                             const val = parseInt(rawStr);
                             if (!isNaN(val)) {
                               setSettings({ ...settings, tournament: { ...settings.tournament!, startingChips: val } });
                             }
                           }
                         }}
                         className={`h-10 bg-white/5 text-emerald-300 ${settings.tournament?.startingChips === '' as any || settings.tournament!.startingChips < 100 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                       />
                       {settings.tournament?.startingChips === '' as any ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Allowance is required.</div>
                       ) : settings.tournament!.startingChips < 100 ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Must be at least 100.</div>
                       ) : null}
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     <div>
                       <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap">Min Bet <span className="text-rose-400">*</span></label>
                       <Input 
                         type="text" 
                         value={settings.tournament?.minBetChips === '' as any ? '' : (settings.tournament?.minBetChips || 0).toLocaleString()}
                         onChange={e => {
                           const valStr = e.target.value.replace(/,/g, '');
                           const val = valStr === '' ? '' as any : parseInt(valStr) || 0;
                           setSettings({ ...settings, tournament: { ...settings.tournament!, minBetChips: val } });
                         }}
                         className={`h-10 bg-white/5 text-sm text-white ${settings.tournament?.minBetChips === '' as any || settings.tournament!.minBetChips < 0 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                       />
                       {settings.tournament?.minBetChips === '' as any ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Min bet is required.</div>
                       ) : settings.tournament!.minBetChips < 0 ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Must be at least 0.</div>
                       ) : null}
                     </div>
                     <div>
                       <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap">Min Side Bet</label>
                       <Input 
                         type="text" 
                         value={settings.tournament?.minSideBetChips === '' as any ? '' : (settings.tournament?.minSideBetChips || 0).toLocaleString()}
                         onChange={e => {
                           const valStr = e.target.value.replace(/,/g, '');
                           const val = valStr === '' ? '' as any : parseInt(valStr) || 0;
                           setSettings({ ...settings, tournament: { ...settings.tournament!, minSideBetChips: val } });
                         }}
                         className={`h-10 bg-white/5 text-sm text-white ${settings.tournament?.minSideBetChips === '' as any || (settings.tournament!.minSideBetChips !== undefined && settings.tournament!.minSideBetChips < 0) ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'}`}
                       />
                       {settings.tournament?.minSideBetChips === '' as any ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Required.</div>
                       ) : (settings.tournament!.minSideBetChips !== undefined && settings.tournament!.minSideBetChips < 0) ? (
                          <div className="text-[10px] text-red-500 mt-1.5">Must be at least 0.</div>
                       ) : null}
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     <div className="group relative">
                       <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap">Host Fee (%)</label>
                       <Input 
                         type="text" 
                         value={settings.tournament?.hostFeePct === '' as any ? '' : settings.tournament?.hostFeePct ?? ''}
                          onChange={e => {
                            let val = e.target.value.replace(/,/g, '');
                            if (val === '') {
                              setSettings({ ...settings, tournament: { ...settings.tournament!, hostFeePct: '' as any } });
                            } else {
                              setSettings({ ...settings, tournament: { ...settings.tournament!, hostFeePct: parseInt(val) || 0 } });
                            }
                          }}
                          className={`h-10 bg-white/5 text-sm ${settings.tournament?.hostFeePct === '' as any || settings.tournament!.hostFeePct < 0 || settings.tournament!.hostFeePct > 5 ? 'border-red-500 text-white focus:border-red-500' : 'border-white/10 text-white focus:border-[#126b6f]'}`}
                        />
                        {settings.tournament?.hostFeePct === '' as any ? (
                           <div className="text-[10px] text-red-500 mt-1.5">
                             Required.
                           </div>
                        ) : settings.tournament!.hostFeePct < 0 || settings.tournament!.hostFeePct > 5 ? (
                           <div className="text-[10px] text-red-500 mt-1.5">
                             Must be 0 to 5%.
                           </div>
                        ) : null}
                     </div>
                     <div>
                       <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-2 block whitespace-nowrap">Platform Fee</label>
                       <Input 
                         type="number" 
                         value="2"
                         readOnly
                         className="h-10 bg-black/40 border-white/5 text-white/50 text-sm focus:outline-none focus:ring-0 cursor-default"
                       />
                     </div>
                   </div>
                 </div>

                 <div className="flex flex-col gap-4 border border-white/10 rounded-xl p-4 bg-black/20">
                   <label className="text-xs font-semibold uppercase tracking-wider text-white mb-2 block">Win Conditions & Parameters (Select at least one win condition)</label>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                     <div className="flex flex-col gap-3">
                       <div className="flex items-center flex-wrap gap-3">
                         <label className="flex items-center gap-2 cursor-pointer w-fit">
                           <input type="checkbox" 
                             checked={settings.tournament?.isSurvivorCap}
                             onChange={e => {
                               const checked = e.target.checked;
                               const newT = { ...settings.tournament!, isSurvivorCap: checked };
                               if (checked) {
                                 newT.prizeDistribution = 'survivorPaytable';
                               } else {
                                 if (!newT.isHardCapRounds) {
                                  newT.isHardCapRounds = true; 
                                 }
                                 newT.prizeDistribution = 'splitByChips';
                               }
                               setSettings({ ...settings, tournament: newT });
                             }}
                             className="w-4 h-4 rounded bg-[#1a1b23] border-white/10 accent-[#126b6f]"
                           />
                           <span className="text-sm font-semibold text-white whitespace-nowrap">Survivor Cap</span>
                         </label>
                         {false && (
                           <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                             <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Target (Max {Math.max(1, Math.floor(settings.maxSeats * 0.5))})</label>
                             <Input 
                               type="text" 
                               value={settings.tournament?.targetSurvivors === '' as any ? '' : settings.tournament?.targetSurvivors ?? ''}
                               onChange={e => {
                                  let valStr = e.target.value.replace(/,/g, '');
                                  if (valStr === '') {
                                    setSettings({ ...settings, tournament: { ...settings.tournament!, targetSurvivors: '' as any } })
                                  } else {
                                    setSettings({ ...settings, tournament: { ...settings.tournament!, targetSurvivors: parseInt(valStr) || 0 } })
                                  }
                               }}
                               className={`h-6 w-10 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 ${(settings.tournament?.targetSurvivors === '' as any || settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? 'text-red-500' : 'text-white'}`}
                             />
                           </div>
                            {settings.tournament?.targetSurvivors === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > Math.max(1, Math.floor(settings.maxSeats * 0.5))) ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 1 to {Math.max(1, Math.floor(settings.maxSeats * 0.5))}</div>
                            ) : null}
                          </div>
                          )}
                       </div>
                     </div>

                   <div className="flex flex-col gap-3">
                     <div className="flex items-center flex-wrap gap-3">
                       <label className="flex items-center gap-2 cursor-pointer w-fit">
                         <input type="checkbox" 
                           checked={settings.tournament?.isHardCapRounds}
                           onChange={e => {
                             const checked = e.target.checked;
                             const newT = { ...settings.tournament!, isHardCapRounds: checked };
                             if (!checked && !newT.isSurvivorCap) {
                                newT.isSurvivorCap = true; 
                                newT.prizeDistribution = 'survivorPaytable';
                             }
                             if (!checked && newT.isScheduledEscalation) {
                                newT.isScheduledEscalation = false;
                                newT.isForcedAnte = true;
                             }
                             setSettings({ ...settings, tournament: newT });
                           }}
                           className="w-4 h-4 rounded bg-[#1a1b23] border-white/10 accent-[#126b6f]"
                         />
                         <span className="text-sm font-semibold text-white whitespace-nowrap">Round Cap</span>
                       </label>
                       {settings.tournament?.isHardCapRounds && (
                         <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Rounds (20-1000)</label>
                              <Input 
                                type="text" 
                                value={settings.tournament?.maxRounds === '' as any ? '' : (settings.tournament?.maxRounds || 0).toLocaleString()}
                                onChange={e => {
                                  const valStr = e.target.value.replace(/,/g, '');
                                  if (valStr === '') {
                                    setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: '' as any } });
                                  } else {
                                    const val = parseInt(valStr);
                                    if (!isNaN(val)) {
                                      setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: val } });
                                    }
                                  }
                                }}
                                placeholder="Rnds"
                                className={`h-6 w-12 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 ${settings.tournament?.maxRounds === '' as any || settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000 ? 'text-red-500' : 'text-white'}`}
                              />
                            </div>
                            {settings.tournament?.maxRounds === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000 ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 20 to 1000</div>
                            ) : null}
                          </div>
                       )}
                     </div>
                   </div>
                   </div>

                   <hr className="border-white/10 my-1" />

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                     <div className="flex flex-col gap-3">
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-1 block">Escalation Settings</label>
                       
                       <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-3">
                           <label className="flex items-center gap-2 cursor-pointer w-fit">
                             <input type="checkbox" 
                               checked={settings.tournament?.isForcedAnte}
                               onChange={e => {
                                 setSettings({ ...settings, tournament: { ...settings.tournament!, isForcedAnte: e.target.checked } });
                               }}
                               className="w-4 h-4 rounded bg-[#1a1b23] border-white/10 accent-[#126b6f]"
                             />
                             <span className="text-sm font-semibold text-white">Forced Ante</span>
                           </label>
                           {settings.tournament?.isForcedAnte && (
                             <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Ante % (Max 2)</label>
                                  <Input 
                                    type="text" 
                                    value={settings.tournament?.antePct === '' as any ? '' : (settings.tournament?.antePct || 0).toLocaleString()}
                                    onChange={e => {
                                      const valStr = e.target.value.replace(/,/g, '');
                                      if (valStr === '') {
                                        setSettings({ ...settings, tournament: { ...settings.tournament!, antePct: '' as any } });
                                      } else {
                                        const val = parseInt(valStr);
                                        if (!isNaN(val)) {
                                          setSettings({ ...settings, tournament: { ...settings.tournament!, antePct: val } });
                                        }
                                      }
                                    }}
                                    className={`h-8 max-w-[60px] bg-white/5 text-white ${settings.tournament?.antePct === '' as any || settings.tournament!.antePct < 0 || settings.tournament!.antePct > 2 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'} text-sm px-2 text-center`}
                                  />
                                </div>
                                {settings.tournament?.antePct === '' as any ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                                ) : settings.tournament!.antePct < 0 || settings.tournament!.antePct > 2 ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 0 to 2</div>
                                ) : null}
                              </div>
                           )}
                         </div>

                         <div className="flex items-center gap-3">
                           <label className="flex items-center gap-2 cursor-pointer w-fit">
                             <input type="checkbox" 
                               checked={settings.tournament?.isScheduledEscalation}
                               onChange={e => {
                                 setSettings({ ...settings, tournament: { ...settings.tournament!, isScheduledEscalation: e.target.checked } });
                               }}
                               className="w-4 h-4 rounded bg-[#1a1b23] border-white/10 accent-[#126b6f]"
                             />
                             <span className="text-sm font-semibold text-white">Double Blinds</span>
                           </label>
                           {settings.tournament?.isScheduledEscalation && (
                             <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">X Rounds (5-30)</label>
                                  <Input 
                                    type="text" 
                                    value={settings.tournament?.escalationRounds === '' as any ? '' : (settings.tournament?.escalationRounds || 0).toLocaleString()}
                                    onChange={e => {
                                      const valStr = e.target.value.replace(/,/g, '');
                                      if (valStr === '') {
                                        setSettings({ ...settings, tournament: { ...settings.tournament!, escalationRounds: '' as any } });
                                      } else {
                                        const val = parseInt(valStr);
                                        if (!isNaN(val)) {
                                          setSettings({ ...settings, tournament: { ...settings.tournament!, escalationRounds: val } });
                                        }
                                      }
                                    }}
                                    className={`h-8 max-w-[60px] bg-white/5 text-white ${settings.tournament?.escalationRounds === '' as any || settings.tournament!.escalationRounds < 5 || settings.tournament!.escalationRounds > 30 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'} text-sm px-2 text-center`}
                                  />
                                </div>
                                {settings.tournament?.escalationRounds === '' as any ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                                ) : settings.tournament!.escalationRounds < 5 || settings.tournament!.escalationRounds > 30 ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 5 to 30</div>
                                ) : null}
                              </div>
                           )}
                         </div>
                       </div>
                     </div>

                     <div className="flex flex-col gap-2">
                         {settings.tournament?.isSurvivorCap && (
                            <div className="flex flex-col gap-1 mb-2 pt-2 border-t border-white/5">
                             <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1">Target Winners (Max {(settings.tournament?.minSeats || 3) - 1})</label>
                              <div className="flex items-center w-full gap-2 bg-[#1a1b23] border border-white/10 rounded-xl px-2 py-1 focus-within:border-[#126b6f] focus-within:ring-1 focus-within:ring-[#126b6f]">
                                <Input 
                                  type="text" 
                                  value={settings.tournament?.targetSurvivors === '' as any ? '' : settings.tournament?.targetSurvivors ?? ''}
                                  onChange={e => {
                                     let valStr = e.target.value.replace(/,/g, '');
                                     if (valStr === '') {
                                       setSettings({ ...settings, tournament: { ...settings.tournament!, targetSurvivors: '' as any } })
                                     } else {
                                       setSettings({ ...settings, tournament: { ...settings.tournament!, targetSurvivors: parseInt(valStr) || 0 } })
                                     }
                                  }}
                                  className={`h-8 w-full bg-transparent border-none focus:outline-none focus:border-none p-0 px-1 !ring-0 ${(settings.tournament?.targetSurvivors === '' as any || settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > ((settings.tournament?.minSeats || 3) - 1)) ? 'text-red-500' : 'text-white'}`}
                                />
                              </div>
                              {settings.tournament?.targetSurvivors === '' as any ? (
                                <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                              ) : (settings.tournament!.targetSurvivors < 1 || settings.tournament!.targetSurvivors > ((settings.tournament?.minSeats || 3) - 1)) ? (
                                <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be between 1 and {(settings.tournament?.minSeats || 3) - 1}</div>
                              ) : null}
                            </div>
                         )}

                         <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-1 flex justify-between">
                           <span>Prize Pool</span>
                         </label>
                         <select 
                           value={settings.tournament?.prizeDistribution}
                           onChange={e => setSettings({ ...settings, tournament: { ...settings.tournament!, prizeDistribution: e.target.value as any } })}
                           className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#126b6f]"
                         >
                           <option value="survivorPaytable" disabled={!settings.tournament?.isSurvivorCap} className={!settings.tournament?.isSurvivorCap ? 'opacity-30' : ''}>
                              {(() => {
                                const t = settings.tournament?.targetSurvivors || 1;
                                if (t === 1) return "100%";
                                if (t === 2) return "70% / 30%";
                                if (t === 3) return "50% / 30% / 20%";
                                if (t === 4) return "40% / 30% / 20% / 10%";
                                if (t === 5) return "35% / 25% / 20% / 15% / 5%";
                                return "30% / 20% / 15% / 15% / 10% / ...";
                              })()} {!settings.tournament?.isSurvivorCap ? '(Requires Survivor Cap)' : ''}
                           </option>
                           <option value="splitByChips" disabled={settings.tournament?.isSurvivorCap} className={settings.tournament?.isSurvivorCap ? 'opacity-30' : ''}>
                             Split By Game Coins {settings.tournament?.isSurvivorCap ? '(Disabled: Survivor Cap)' : ''}
                           </option>
                         </select>
                         {settings.tournament?.isSurvivorCap && (
                            <div className="text-[10px] text-orange-400/80 mt-1 italic">
                               * "Split By Game Coins" is disabled while Survivor Cap is active.
                            </div>
                         )}
                         {settings.tournament?.prizeDistribution === 'splitByChips' && (
                            <div className="text-[10px] text-white/50 mt-1 italic">
                               All remaining players split prize proportionally by Game Coins.
                            </div>
                         )}
                     </div>
                   </div>
                 </div>
              </div>
              )}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

        {/* 2. Add Liquidity */}
        {settings.mode !== 'tournament' && (
        <Card className="overflow-hidden bg-white/5 shadow-sm rounded-3xl border border-white/10 p-3">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'liquidity' ? null : 'liquidity')}
            className="w-full flex justify-between items-center hover:bg-white/5 transition-colors rounded-xl"
          >
          <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
             <div className={`p-2 sm:p-3 rounded-full shrink-0 ${expandedSection === 'liquidity' ? 'bg-[#126b6f] text-white' : 'bg-white/10 shadow-sm text-white/80'}`}>
               <Coins className="w-4 h-4 sm:w-6 sm:h-6" />
             </div>
             <div className="text-left flex flex-col gap-1 sm:gap-2 min-w-0 flex-1">
                <div className="flex flex-row flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 items-center">
                   <div className="flex items-center gap-1.5 font-bold tracking-wider shrink-0">
                     <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Liquidity Requirement:</span>
                     <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                     </div>
                     <span className="text-white text-[13px] sm:text-[16px] truncate">{(settings.maxBet * settings.maxSeats).toLocaleString()}</span>
                   </div>
                   <div className="hidden sm:block w-px h-4 bg-white/10"></div>
                   <div className="flex items-center gap-1.5 font-bold tracking-wider shrink-0">
                     <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Liquidity Balance:</span>
                     <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                     </div>
                     <span className="text-[#20a37c] text-[13px] sm:text-[16px] truncate">{(editTableId && editingTable ? editingTable.liquidity : 0).toLocaleString()}</span>
                   </div>
                </div>
                 <p className="text-[11px] sm:text-[14px] text-white/50 text-left leading-snug mt-0.5 sm:mt-1 whitespace-normal">
                   Allocate Game Coins (Gcoin) to fund table liquidity. Returned automatically upon closing.
                 </p>
             </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2">
             <span className="hidden sm:inline text-[13px] sm:text-[14px] font-bold uppercase tracking-wider text-[#126b6f] shrink-0">Add Liquidity</span>
             {expandedSection === 'liquidity' ? <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 shrink-0" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 shrink-0" />}
          </div>
        </button>

        <AnimatePresence>
          {expandedSection === 'liquidity' && (
            <motion.div 
               initial={{ height: 0 }} 
               animate={{ height: 'auto' }} 
               exit={{ height: 0 }}
               className="overflow-hidden bg-black/20 text-white"
            >
              <div className="p-0 border-t border-white/5 flex flex-col gap-[16px]">
                <div className="px-3 pt-3 pb-0">
                  <div className="bg-[#126b6f]/20 p-4 rounded-xl border border-[#126b6f]/30 text-sm text-[#2ebaba]">
                    <div className="flex items-center gap-2 font-semibold mb-1 text-[#28a19b] justify-between">
                      <span>Liquidity Requirement</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                        </div>
                        <span>{(settings.maxBet * settings.maxSeats).toLocaleString()}</span>
                      </div>
                    </div>
                    <p>Minimum table liquidity is calculated as: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[#2ebaba] border border-[#2ebaba]/20">Max Bet × Seats</span> (to cover 1 round).</p>
                    <p className="mt-2 text-red-500 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Note: If liquidity falls below this minimum before a new round starts, the table will be paused until refilled.</p>
                  </div>
                </div>
                <div className="space-y-1 px-3 pt-2 pb-3">
                  <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <div className="flex flex-col gap-3 w-full flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row gap-2 w-full items-start">
                        <div className="relative flex-[1.5] w-full flex flex-col gap-1.5">
                          <div className="relative w-full">
                            <Input 
                              type="number" 
                              value={depositAmount}
                              onChange={e => setDepositAmount(e.target.value)}
                              min={0}
                              step="any"
                              className="h-10 bg-black/20 sm:bg-white/5 border-white/10 w-full text-white focus:border-[#126b6f] focus:ring-[#126b6f]"
                            />
                          </div>
                          <div className="flex gap-4 min-w-0 flex-shrink-0 text-[10px] sm:text-xs text-white/50 pl-1">
                            <span>Allocate <span className="font-bold text-white/90">{Math.floor(Number(depositAmount || 0)).toLocaleString()}</span> Gcoin from your Game Coins balance.</span>
                          </div>
                        </div>

                        <Button 
                          className="w-full sm:w-auto bg-[#126b6f] hover:bg-[#0d4f52] text-white font-bold uppercase tracking-widest text-xs h-[40px] px-6 shrink-0 shadow-sm"
                          onClick={() => {
                            if (editTableId) {
                              useGameStore.getState().depositLiquidity(editTableId, Number(depositAmount));
                            }
                            setExpandedSection('settings');
                          }}
                        >
                          Add Gcoin
                        </Button>
                      </div>

                      <div className="flex justify-between items-center mt-1 px-1">
                        <div className="text-xs text-white/50">Liquidity Balance: <span className="font-bold text-white/90">{editTableId ? editingTable?.liquidity : 0}</span> Gcoin</div>
                        <button 
                          className="flex items-center text-xs font-semibold text-[#2ebaba] hover:text-white transition-colors"
                          disabled={isRefreshing}
                          onClick={async () => {
                            setIsRefreshing(true);
                            await new Promise(r => setTimeout(r, 500));
                            setIsRefreshing(false);
                          }}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                          {isRefreshing ? 'Refreshing...' : 'Refresh Balance'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      )}

      {/* 3. Host */}
      <div className="pt-4 pb-8 flex flex-col gap-3">
        <Button 
          size="lg" 
          disabled={isHosting}
          className="w-full h-14 text-sm font-black uppercase tracking-widest shadow-[0_4px_8px_rgba(0,0,0,0.5)] hover:shadow-lg transition-transform hover:scale-[1.02] active:scale-95 bg-gradient-to-b from-[#28a19b] to-[#126b6f] hover:from-[#2ebaba] hover:to-[#178287] border border-[#0d4f52] text-white rounded-full disabled:opacity-50"
          onClick={handleSubmit}
        >
          {isHosting ? (
             <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
          ) : editTableId ? (
             <><SettingsIcon className="w-5 h-5 mr-2" /> Save Settings</>
          ) : (
             <><CheckCircle2 className="w-5 h-5 mr-2" /> Host Table</>
          )}
        </Button>
        {settings.mode === 'tournament' && (
           <p className="text-[11px] text-white/50 text-center uppercase tracking-wider font-semibold">Start Auto: 3 mins after full (participants get site message/email).</p>
        )}
        {editTableId && (
          <Button 
            size="lg"
            variant="outline"
            className="w-full h-14 text-sm font-black uppercase tracking-widest bg-transparent border border-white/20 text-white hover:bg-white/5 rounded-full"
            onClick={() => onNavigate('manage_tables', editTableId || undefined)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
    </div>

    </div>
  );
}
