import React, { useState } from 'react';
import { useGameStore, TableSettings } from '@/store/gameStore';
import { calculateBaseRTP } from '@/backend/gameRules';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChevronDown, ChevronRight, Copy, Wallet, Settings as SettingsIcon, CheckCircle2, RefreshCw, QrCode, X, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { HeaderUI } from '@/components/blackjack/HeaderUI';
import { WalletSelector } from '@/components/WalletSelector';

export function HostTableView({ onNavigate, onToggleSidebar }: { onNavigate: (view: 'lobby' | 'table' | 'dashboard') => void, onToggleSidebar?: () => void }) {
  const { currentUser, createTable } = useGameStore();

  const [expandedSection, setExpandedSection] = useState<'liquidity' | 'settings' | null>('settings');
  const [depositAmount, setDepositAmount] = useState('15');
  const [currency, setCurrency] = useState<'USDC' | 'USDT'>('USDC');
  const [network, setNetwork] = useState<'Solana' | 'Ethereum' | 'BSC'>('Solana');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [mockTableId] = useState(() => Math.random().toString(36).substring(2, 8));
  const [isMuted, setIsMuted] = useState(false);

  const [depositMode, setDepositMode] = useState<'wallet' | 'manual'>('wallet');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settings, setSettings] = useState<TableSettings>({
    minBet: 10,
    maxBet: 50,
    secretBets: false,
    actionTimeLimit: 12,
    isPublic: true,
    maxSeats: 3,
    winningRule: 'standard',
    order: 'seat'
  });

  const minLiquidity = settings.maxBet * settings.maxSeats;

  const prevMinLiquidity = React.useRef(minLiquidity);
  React.useEffect(() => {
    if (prevMinLiquidity.current !== minLiquidity) {
      setDepositAmount((minLiquidity / 10).toString());
      prevMinLiquidity.current = minLiquidity;
    }
  }, [minLiquidity]);

  const getDepositAddress = () => {
    if (currency === 'USDC' && network === 'Solana') return 'So11111111111111111111111111111111111111112';
    if (currency === 'USDC' && network === 'Ethereum') return '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    if (currency === 'USDC' && network === 'BSC') return '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
    if (currency === 'USDT' && network === 'Solana') return 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    if (currency === 'USDT' && network === 'Ethereum') return '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    if (currency === 'USDT' && network === 'BSC') return '0x55d398326f99059fF775485246999027B3197955';
    return '0x...';
  };

  const handleSubmit = () => {
    // Top up logic or create table... 
    // Wait, backend will check balance.
    // For test simulation, let's just proceed
    createTable(settings, minLiquidity);
    // Switch back to table or wherever makes sense after hosting
    onNavigate('table'); 
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (!currentUser) return null;

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-y-auto overflow-x-hidden bg-transparent font-sans [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      
      <HeaderUI 
        onLeave={() => onNavigate('lobby')}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        onToggleSidebar={() => onToggleSidebar && onToggleSidebar()}
      />

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
            className="flex text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#5f40a1] hover:bg-[#4a327d] items-center gap-1 shadow-lg transition-transform hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" /> Back to Table
          </button>
        </div>
      </div>

      <div className="w-full max-w-[1024px] flex flex-col p-[12px] sm:p-[24px] gap-[12px] mx-auto z-10 pointer-events-auto bg-[#1a1b23] sm:rounded-[32px] sm:mb-[24px] mb-[24px] border border-x-0 border-white/5 sm:border-x shadow-2xl shrink-0">
        
        {/* Title */}
        <div className="flex flex-col items-center gap-2 py-4 text-center px-4">
          <p className="text-white/60 text-sm w-full leading-relaxed">
            Create private games for friends or public high-roller tables with user-hosted blackjack, fully backed by on-chain verifiable randomness.
          </p>
        </div>

        {/* 1. Set the table */}
      <Card className="overflow-hidden bg-white/5 shadow-sm rounded-3xl border border-white/10 p-3">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'settings' ? null : 'settings')}
          className="w-full flex justify-between items-center hover:bg-white/5 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
             <div className={`p-2 sm:p-3 rounded-full shrink-0 ${expandedSection === 'settings' ? 'bg-[#5f40a1] text-white' : 'bg-white/10 shadow-sm text-white/80'}`}>
               <SettingsIcon className="w-4 h-4 sm:w-6 sm:h-6" />
             </div>
             <div className="text-left flex flex-col gap-1 sm:gap-2 truncate">
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 sm:items-center">
                  <div className="flex items-center gap-1.5 font-bold tracking-wider">
                    <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Table Rules:</span>
                    <div className="flex items-center gap-1 text-white text-[13px] sm:text-[16px] truncate">
                      <span>Min</span>
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                      </div>
                      <span>{settings.minBet.toLocaleString('en-US', {minimumFractionDigits: settings.minBet % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})} <span className="text-white/40">/</span> Max</span>
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                      </div>
                      <span>{settings.maxBet.toLocaleString('en-US', {minimumFractionDigits: settings.maxBet % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}</span>
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
             <span className="hidden sm:inline text-[13px] sm:text-[14px] font-bold uppercase tracking-wider text-[#5f40a1] shrink-0">Set Table</span>
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
              <div className="p-3 border-t border-white/5 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
                       Min Bet 
                       <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                       </div>
                     </label>
                     <Input 
                       type="number" 
                       value={settings.minBet}
                       onChange={e => setSettings({ ...settings, minBet: parseInt(e.target.value) })}
                       min="1"
                       className="h-10 bg-white/5 border-white/10 text-white focus:border-[#5f40a1]"
                     />
                   </div>
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
                       Max Bet 
                       <div className="w-3 h-3 rounded-full bg-[#ffc53d] border-[1px] border-[#eaaa08] shadow-[0_0_2px_rgba(255,197,61,0.4)] relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-1 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                       </div>
                     </label>
                     <Input 
                       type="number" 
                       value={settings.maxBet}
                       onChange={e => setSettings({ ...settings, maxBet: parseInt(e.target.value) })}
                       min={settings.minBet}
                       className="h-10 bg-white/5 border-white/10 text-white focus:border-[#5f40a1]"
                     />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                         Seats (1-7)
                       </label>
                       <Input 
                         type="number" 
                         value={settings.maxSeats}
                         onChange={e => setSettings({ ...settings, maxSeats: Math.min(7, Math.max(1, parseInt(e.target.value) || 1)) })}
                         min="1" max="7"
                         className="h-10 bg-white/5 border-white/10 text-white focus:border-[#5f40a1]"
                       />
                    </div>
                    <div>
                       <label className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2 block">
                         Action Time
                       </label>
                       <select 
                         value={settings.actionTimeLimit.toString()}
                         onChange={e => setSettings({ ...settings, actionTimeLimit: parseInt(e.target.value) })}
                         className="w-full h-10 rounded-xl border border-white/10 bg-[#1a1b23] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5f40a1]"
                       >
                         <option value="6">Fast (6s)</option>
                         <option value="12">Normal (12s)</option>
                         <option value="30">Slow (30s)</option>
                       </select>
                    </div>
                 </div>
                </div>

                <div className="hidden md:block w-px bg-white/10" />
                
                <div className="flex-1 space-y-3 md:pt-0 pt-2 flex flex-col justify-end">
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
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.isPublic ? 'bg-[#5f40a1]' : 'bg-white/20'}`}
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
                           className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings.secretBets ? 'bg-[#5f40a1]' : 'bg-white/20'}`}
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
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 shadow-sm overflow-hidden">
                      <div className="flex flex-col flex-1 min-w-0 pr-2">
                        <span className="text-xs font-semibold text-white/50 mb-1">Invite Link</span>
                        <span className="text-sm font-mono text-white truncate">https://randseed.org/blackjack/table/{mockTableId}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.preventDefault(); copyToClipboard(`https://randseed.org/blackjack/table/${mockTableId}`); }} 
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

        {/* 2. Add Liquidity */}
        <Card className="overflow-hidden bg-white/5 shadow-sm rounded-3xl border border-white/10 p-3">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'liquidity' ? null : 'liquidity')}
          className="w-full flex justify-between items-center hover:bg-white/5 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
             <div className={`p-2 sm:p-3 rounded-full shrink-0 ${expandedSection === 'liquidity' ? 'bg-[#5f40a1] text-white' : 'bg-white/10 shadow-sm text-white/80'}`}>
               <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
             </div>
             <div className="text-left flex flex-col gap-1 sm:gap-2 min-w-0 flex-1">
                <div className="flex flex-row flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 items-center">
                   <div className="flex items-center gap-1.5 font-bold tracking-wider shrink-0">
                     <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Liquidity:</span>
                     <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                     </div>
                     <span className="text-white text-[13px] sm:text-[16px] truncate">{parseFloat('0').toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>
                   </div>
                   <div className="hidden sm:block w-px h-4 bg-white/10"></div>
                   <div className="flex items-center gap-1.5 font-bold tracking-wider shrink-0">
                     <span className="text-white/40 uppercase text-[11px] sm:text-[14px]">Profit:</span>
                     <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/40 rounded-full blur-[1px]"></div>
                     </div>
                     <span className="text-[#20a37c] text-[13px] sm:text-[16px] truncate">{(0).toLocaleString('en-US', {minimumFractionDigits: 0 % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2})}</span>
                   </div>
                </div>
                 <p className="text-[11px] sm:text-[14px] text-white/50 text-left leading-snug mt-0.5 sm:mt-1 whitespace-normal">
                   Deposit USDC/USDT to fund tables. Instant withdrawals upon closing
                 </p>
             </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2">
             <span className="hidden sm:inline text-[13px] sm:text-[14px] font-bold uppercase tracking-wider text-[#5f40a1] shrink-0">Add Liquidity</span>
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
                  <div className="bg-[#5f40a1]/20 p-4 rounded-xl border border-[#5f40a1]/30 text-sm text-[#a78bfa]">
                    <div className="flex items-center gap-2 font-semibold mb-1 text-[#c4b5fd] justify-between">
                      <span>Liquidity Requirement</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#ffc53d] border-[2px] border-[#eaaa08] shadow-[0_0_4px_rgba(255,197,61,0.4)] relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]"></div>
                        </div>
                        <span>{(settings.maxBet * settings.maxSeats).toLocaleString()}</span>
                      </div>
                    </div>
                    <p>Minimum table liquidity is calculated as: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[#a78bfa] border border-[#a78bfa]/20">Max Bet × Seats</span> (to cover 1 round).</p>
                    <p className="mt-2 text-red-500 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">Note: If liquidity falls below this minimum before a new round starts, the table will be paused and become private.</p>
                  </div>
                </div>
                <div className="space-y-1 px-3 pt-2 pb-3">
                  <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <div className="hidden sm:flex shrink-0 bg-white p-2 rounded-xl border border-white/10 flex-col items-center justify-center">
                      <QRCodeSVG value={getDepositAddress()} size={90} />
                    </div>
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
                              className="h-10 bg-black/20 sm:bg-white/5 border-white/10 w-full text-white focus:border-[#5f40a1] focus:ring-[#5f40a1]"
                            />
                          </div>
                          <div className="flex gap-4 min-w-0 flex-shrink-0 text-[10px] sm:text-xs text-white/50 pl-1">
                            <span>You will receive <span className="font-bold text-white/90">{Math.floor(Number(depositAmount || 0) * 10).toLocaleString()}</span> Gcoin. 1 USDC/USDT = 10 Gcoin</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-[1] gap-2 w-full sm:w-auto h-[40px]">
                            <select 
                               value={currency} 
                               onChange={e => setCurrency(e.target.value as any)}
                               className="flex-1 bg-[#1a1b23] text-white border border-white/10 rounded-xl px-2 h-full text-sm focus:outline-none focus:border-[#5f40a1] cursor-pointer min-w-0"
                            >
                               <option value="USDC">USDC</option>
                               <option value="USDT">USDT</option>
                            </select>
                            <select 
                               value={network} 
                               onChange={e => setNetwork(e.target.value as any)}
                               className="flex-1 bg-[#1a1b23] text-white border border-white/10 rounded-xl px-2 h-full text-sm focus:outline-none focus:border-[#5f40a1] cursor-pointer min-w-0"
                            >
                               <option value="Solana">SOL</option>
                               <option value="Ethereum">ETH</option>
                               <option value="BSC">BSC</option>
                            </select>
                        </div>

                        <Button 
                          className="w-full sm:w-auto bg-[#5f40a1] hover:bg-[#4a327d] text-white font-bold uppercase tracking-widest text-xs h-[40px] px-6 shrink-0 shadow-sm"
                          onClick={() => setShowWalletSelector(true)}
                        >
                          Deposit
                        </Button>
                      </div>

                      <div className="flex items-center gap-2 bg-white/5 px-3 sm:px-4 py-2.5 rounded min-w-0 max-w-full overflow-hidden border border-white/10">
                        <span className="shrink-0 text-xs text-white/50 hidden sm:inline">Address:</span>
                        <span className="font-mono text-sm text-white/90 truncate select-all">{getDepositAddress()}</span>
                        <button onClick={() => copyToClipboard(getDepositAddress())} className="hover:text-white text-white/50 shrink-0 ml-auto p-1.5"><Copy className="w-4 h-4" /></button>
                        <button onClick={() => setShowQRCode(true)} className="sm:hidden hover:text-white text-white/50 shrink-0 p-1.5"><QrCode className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* 3. Host */}
      <div className="pt-4 pb-8">
        <Button 
          size="lg" 
          className="w-full h-14 text-sm font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all bg-[#5f40a1] hover:bg-[#4a327d] text-white rounded-full"
          onClick={handleSubmit}
        >
          <CheckCircle2 className="w-5 h-5 mr-2" /> Host Table
        </Button>
      </div>
    </div>

    <WalletSelector
      isOpen={showWalletSelector}
      onClose={() => setShowWalletSelector(false)}
      depositAmount={depositAmount}
      currency={currency}
      onSelect={() => setExpandedSection('settings')}
    />

    <AnimatePresence>
      {showQRCode && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
           onClick={() => setShowQRCode(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center p-6 bg-[#1a1b23] border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm gap-6"
          >
            <div className="flex justify-between items-center w-full">
              <span className="font-bold text-white text-lg tracking-wide uppercase">Deposit Address</span>
              <button onClick={() => setShowQRCode(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-2xl flex items-center justify-center border-4 border-white/5">
              <QRCodeSVG value={getDepositAddress()} size={200} />
            </div>

            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center justify-between w-full p-3 bg-black/40 border border-white/10 rounded-xl relative">
                 <span className="font-mono text-xs text-white/90 truncate mr-2 select-all">{getDepositAddress()}</span>
                 <button onClick={() => copyToClipboard(getDepositAddress())} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white/70 hover:text-white transition-colors shrink-0">
                   <Copy className="w-4 h-4" />
                 </button>
              </div>
              <p className="text-center text-[11px] text-white/40 uppercase tracking-wider font-semibold px-2">Send {currency} ({network}) to this address.</p>
            </div>
            
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    </div>
  );
}
