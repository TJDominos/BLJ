import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayingCard } from './PlayingCardUI';
import { Trophy } from 'lucide-react';
import { PlayingCard as PlayingCardType, Hand } from '@/store/gameStore';

import { DelayedScore } from './DelayedScore';

const CloverAvatar = ({ className }: { className?: string }) => {
  const heartPath = "M12 21.05C12 21.05 1.5 14.5 1.5 8.5C1.5 4.5 4.5 1.5 8 1.5C10 1.5 11.5 2.5 12 4C12.5 2.5 14 1.5 16 1.5C20.5 1.5 22.5 4.5 22.5 8.5C22.5 14.5 12 21.05 12 21.05Z";
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="white" />
      <g transform="translate(50, 50)">
        <g><path d={heartPath} fill="#f48232" transform="scale(1.5) translate(-12, -20.5)" /></g>
        <g transform="rotate(90)"><path d={heartPath} fill="#3baba3" transform="scale(1.5) translate(-12, -20.5)" /></g>
        <g transform="rotate(180)"><path d={heartPath} fill="#1d66bc" transform="scale(1.5) translate(-12, -20.5)" /></g>
        <g transform="rotate(270)"><path d={heartPath} fill="#5d318e" transform="scale(1.5) translate(-12, -20.5)" /></g>
        <circle cx="0" cy="0" r="8" fill="black" />
      </g>
    </svg>
  );
};

export function DealerArea({
  houseId,
  name,
  dealerHand,
  totalSeats,
  recentWinAmount,
  mode,
  liquidity
}: {
  houseId: string;
  name: string;
  dealerHand: Hand | null;
  totalSeats: number;
  recentWinAmount?: any;
  mode?: 'regular' | 'tournament';
  liquidity?: number;
}) {
  return (
    <div className="w-full flex-[4] flex flex-col items-center justify-start min-h-[160px] sm:min-h-[200px] lg:min-h-[220px] z-10 pt-0 shadow-none">
      {/* Dealer Avatar & Name */}
      <div className="relative flex items-center justify-center gap-2 z-20 px-3 mt-3 ml-0 py-1">
        <div id="dealer-avatar" className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden border-2 border-[#1e2025] shadow-lg bg-[#2a2d36] flex flex-shrink-0 items-center justify-center relative">
          {houseId === 'system' ? (
            <CloverAvatar className="w-full h-full object-cover z-10" />
          ) : (
            <img 
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffdfbf,ffd5dc`} 
              alt={name}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-white/80 font-bold text-xs sm:text-sm tracking-wide flex items-center gap-1">
            {mode === 'tournament' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
            {houseId === 'system' ? 'Randseed' : name.replace("'s Table", "")}
          </span>
          {mode === 'tournament' && (
             <span className="text-[10px] text-yellow-400 font-bold tracking-wider uppercase flex items-center gap-1">
               Tournament
             </span>
          )}
          {houseId !== 'system' && mode !== 'tournament' && liquidity !== undefined && (
             <span className="text-[10px] text-[#20a37c] font-mono tracking-wider uppercase flex items-center gap-1">
                LIQ: ${liquidity.toLocaleString()}
             </span>
          )}
        </div>
      </div>

      {dealerHand ? (
        <div className="flex flex-col items-center gap-4 mt-5">
          <div className="flex relative">
            <AnimatePresence>
              {dealerHand.cards.map((c, i) => (
                <PlayingCard key={i} card={c} index={i} globalDelayIndex={i < 2 ? i * (totalSeats + 1) + totalSeats : 0} />
              ))}
            </AnimatePresence>
          </div>
          {dealerHand && dealerHand.cards.length > 0 && (
            <motion.div 
              key="score"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-black/30 px-3 py-1 rounded shadow-inner border border-white/5 font-mono text-xs text-white">
              <DelayedScore 
                score={dealerHand.score} 
                cardsLength={dealerHand.cards.length} 
                totalSeats={totalSeats} 
                isDealer={true} 
                tableStatus={dealerHand.cards.some(c => c.isHidden) ? 'playing' : 'dealer_turn'}
              />
            </motion.div>
          )}
        </div>
      ) : (
        <div className="w-[42px] h-[62px] sm:w-[56px] sm:h-[80px] md:w-[72px] md:h-[104px] lg:w-[92px] lg:h-[130px] border border-dashed border-white/10 rounded-lg opacity-20 flex items-center justify-center mt-5">
        </div>
      )}
    </div>
  );
}
