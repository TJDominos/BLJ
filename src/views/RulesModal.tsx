import React from 'react';
import { motion } from 'motion/react';
import { X, ShieldCheck, Trophy } from 'lucide-react';
import { WinningRule, TableSettings } from '@/store/gameStore';
import { calculateBaseRTP, gameRules } from '@/backend/gameRules';

export function RulesModal({ onClose, winningRule, settings }: { onClose: () => void, winningRule: WinningRule, settings?: TableSettings }) {
  const isTournament = settings?.mode === 'tournament';
  const tSettings = settings?.tournament;
  const prizePool = isTournament ? Math.round((tSettings?.ticketPrice || 0) * (settings.maxSeats || 3) * (1 - ((tSettings?.hostFeePct || 3) + (tSettings?.platformFeePct || 2)) / 100)) : 0;
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-[#1e2025] border border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex justify-between items-center p-4 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-2">
            {isTournament ? <Trophy className="w-5 h-5 text-yellow-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
            <h2 className="text-lg font-bold text-white tracking-wider uppercase">{isTournament ? "Tournament Prizes & Rules" : "Game Rules"}</h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div 
          className="overflow-y-auto p-4 md:p-6 space-y-6 text-sm text-white/80 hide-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
          
          {isTournament && (
             <div className="space-y-4 mb-6 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
               <h3 className="text-yellow-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2"><Trophy className="w-3.5 h-3.5" /> Prize Pool: Gcoin {prizePool.toLocaleString()}</h3>
               <div className="space-y-2 mt-3">
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Ticket Price</span>
                   <span className="font-mono text-white">Gcoin {settings.tournament?.ticketPrice || 0}</span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Starting Chips</span>
                   <span className="font-mono text-white">{settings.tournament?.startingChips || 0} CHIPS</span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Prize Distribution</span>
                   <span className="font-mono text-white text-right">
                     {settings.tournament?.targetSurvivors === 1 ? '🥇 Winner takes all' : '🏆 Proportional Split'}
                   </span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Target Winners</span>
                   <span className="font-mono text-white text-right">
                     {settings.tournament?.targetSurvivors === 1 ? '1 Winner' : (settings.tournament?.targetSurvivors ? `${settings.tournament.targetSurvivors} Survivors` : 'All Survivors')}
                   </span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Max Rounds</span>
                   <span className="font-mono text-white text-right">
                     {settings.tournament?.maxRounds || 'Unlimited'}
                   </span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                   <span className="text-white/60">Escalation</span>
                   <span className="font-mono text-white text-right">
                     {settings.tournament?.isScheduledEscalation ? `Ante Multiplier per ${settings.tournament.escalationRounds} Rounds` : 'No Scheduled Escalation'}
                   </span>
                 </div>
                 {settings.tournament?.isForcedAnte && (
                   <div className="flex justify-between text-xs border-b border-white/5 pb-1">
                     <span className="text-white/60">Forced Ante</span>
                     <span className="font-mono text-white text-right">
                       {settings.tournament.antePct}% (of Player's Chip Stack)
                     </span>
                   </div>
                 )}
               </div>
             </div>
          )}

          <div className="space-y-2">
            <h3 className="text-white font-semibold uppercase tracking-wider text-xs">Payouts</h3>
            <ul className="space-y-1.5 font-mono text-xs">
              <li className="flex justify-between"><span>Blackjack</span><span className="text-emerald-400">3:2</span></li>
              <li className="flex justify-between"><span>Standard Win</span><span className="text-emerald-400">1:1</span></li>
              <li className="flex justify-between"><span>Insurance</span><span className="text-emerald-400">2:1</span></li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-white font-semibold uppercase tracking-wider text-xs">Perfect Pairs (Up to 25:1)</h3>
            <ul className="space-y-1.5 font-mono text-xs">
              <li className="flex justify-between"><span>Perfect Pair (Same suit)</span><span className="text-[#ece424]">25:1</span></li>
              <li className="flex justify-between"><span>Colored Pair (Same color)</span><span className="text-[#ece424]">12:1</span></li>
              <li className="flex justify-between"><span>Mixed Pair (Different color)</span><span className="text-[#ece424]">6:1</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-white font-semibold uppercase tracking-wider text-xs">21+3 (Up to 100:1)</h3>
            <p className="text-[10px] text-white/50 leading-tight mb-2">Based on your first two cards and the dealer's upcard.</p>
            <ul className="space-y-1.5 font-mono text-xs">
              <li className="flex justify-between"><span>Suited Trips</span><span className="text-[#ece424]">100:1</span></li>
              <li className="flex justify-between"><span>Straight Flush</span><span className="text-[#ece424]">40:1</span></li>
              <li className="flex justify-between"><span>Three of a Kind</span><span className="text-[#ece424]">30:1</span></li>
              <li className="flex justify-between"><span>Straight</span><span className="text-[#ece424]">10:1</span></li>
              <li className="flex justify-between"><span>Flush</span><span className="text-[#ece424]">5:1</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-white font-semibold uppercase tracking-wider text-xs">Table Rules</h3>
            <ul className="space-y-1.5 text-xs">
              <li>• Dealer must draw to 16 and stand on all 17s</li>
              <li>• Double Down on any two initial cards</li>
              <li>• Split any pair of equal value cards</li>
              <li>• No re-splitting allowed</li>
              <li>• Insurance offered on dealer Ace</li>
              <li>• 6 Decks, shuffled automatically</li>
              {winningRule === 'dealer_wins_ties' && (
                <li><span className="text-[#ff6b6b]">• Ties (Pushes) go to the Dealer</span></li>
              )}
              <li>• Game relies on on-chain verifiable randomness (RTP: {calculateBaseRTP(winningRule)} Base)</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
