import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayingCard } from './PlayingCardUI';
import { Trophy } from 'lucide-react';
import { PlayingCard as PlayingCardType, Hand } from '@/store/gameStore';
import { getAvatarUrl } from '@/utils/avatar';

import { DelayedScore } from './DelayedScore';

export const RoyalBlackjackLogo = ({ className }: { className?: string }) => {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rbjBgGrad" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#1b5e3a" />
          <stop offset="65%" stopColor="#0d311e" />
          <stop offset="100%" stopColor="#05140c" />
        </radialGradient>
        <linearGradient id="rbjGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff1a8" />
          <stop offset="35%" stopColor="#e5c158" />
          <stop offset="70%" stopColor="#b88928" />
          <stop offset="100%" stopColor="#f5d97e" />
        </linearGradient>
        <linearGradient id="rbjCardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>

      {/* Outer Luxury Gold Coin Rim & Deep Emerald Felt Center */}
      <circle cx="50" cy="50" r="49" fill="url(#rbjGoldGrad)" />
      <circle cx="50" cy="50" r="45.5" fill="url(#rbjBgGrad)" stroke="#091910" strokeWidth="1.5" />
      <circle
        cx="50"
        cy="50"
        r="41.5"
        fill="none"
        stroke="url(#rbjGoldGrad)"
        strokeWidth="1"
        strokeDasharray="3 2.5"
        opacity="0.75"
      />

      {/* Overlapping Playing Cards Emblem (Left Card + Right Ace of Spades) */}
      <g transform="translate(36, 56) rotate(-14)">
        <rect
          x="-12"
          y="-16"
          width="24"
          height="32"
          rx="3.5"
          fill="#132a1e"
          stroke="url(#rbjGoldGrad)"
          strokeWidth="1.8"
        />
        <text
          x="-7"
          y="-6"
          fill="#f5d97e"
          fontSize="8"
          fontWeight="900"
          fontFamily="serif"
        >
          K
        </text>
        <path d="M0 -3 L4 3 L0 9 L-4 3 Z" fill="#e11d48" />
      </g>

      <g transform="translate(57, 56) rotate(10)">
        <rect
          x="-13"
          y="-17"
          width="26"
          height="34"
          rx="3.5"
          fill="url(#rbjCardGrad)"
          stroke="url(#rbjGoldGrad)"
          strokeWidth="1.8"
        />
        {/* Spade Pip Center */}
        <path
          d="M0 -8 C-5 -2 -8 1 -8 4.5 C-8 7 -6 8.5 -3.8 8.5 C-2.2 8.5 -1 7.6 -0.5 6.8 L-2 11.5 L2 11.5 L0.5 6.8 C1 7.6 2.2 8.5 3.8 8.5 C6 8.5 8 7 8 4.5 C8 1 5 -2 0 -8 Z"
          fill="#0f172a"
        />
      </g>

      {/* Royal Crown Resting Above the Cards */}
      <g transform="translate(50, 24)">
        <path
          d="M-18 8 L-21 -5 L-9 2 L0 -9 L9 2 L21 -5 L18 8 Z"
          fill="url(#rbjGoldGrad)"
          stroke="#422c06"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <rect x="-18" y="8" width="36" height="4" rx="1.5" fill="url(#rbjGoldGrad)" stroke="#422c06" strokeWidth="1" />
        <circle cx="-21" cy="-6.5" r="2" fill="#fff1a8" />
        <circle cx="0" cy="-11" r="2.4" fill="#fff1a8" />
        <circle cx="21" cy="-6.5" r="2" fill="#fff1a8" />
        <circle cx="-9" cy="10" r="1.2" fill="#dc2626" />
        <circle cx="0" cy="10" r="1.4" fill="#10b981" />
        <circle cx="9" cy="10" r="1.2" fill="#dc2626" />
      </g>
    </svg>
  );
};

export function DealerArea({
  houseId,
  name,
  houseName,
  houseAvatar,
  dealerHand,
  totalSeats,
  recentWinAmount,
  mode,
  liquidity
}: {
  houseId: string;
  name: string;
  houseName?: string;
  houseAvatar?: string;
  dealerHand: Hand | null;
  totalSeats: number;
  recentWinAmount?: any;
  mode?: 'regular' | 'tournament';
  liquidity?: number;
}) {
  const [imgError, setImgError] = React.useState(false);
  const resolvedHostName = houseName?.trim() || name.replace("'s Table", "").trim() || 'Host';
  const displayDealerName = houseId === 'system' ? 'Royal BlackJack' : resolvedHostName;

  return (
    <div className="w-full flex-[3] flex flex-col items-center justify-start min-h-[108px] sm:min-h-[128px] lg:min-h-[145px] [@media(max-height:740px)]:min-h-[100px] [@media(max-height:740px)]:scale-[0.86] [@media(max-height:740px)]:origin-top [@media(max-height:520px)_and_(orientation:landscape)]:min-h-[68px] [@media(max-height:520px)_and_(orientation:landscape)]:scale-[0.72] [@media(max-height:520px)_and_(orientation:landscape)]:origin-top z-10 pt-0 shadow-none">
      {/* Dealer Avatar & Name */}
      <div className="relative flex items-center justify-center gap-2 z-20 px-3 mt-1 sm:mt-1.5 ml-0 py-0.5">
        <div id="dealer-avatar" className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full overflow-hidden border-2 border-[#d4af37]/70 shadow-lg bg-[#14241b] flex flex-shrink-0 items-center justify-center relative">
          {houseId === 'system' ? (
            <RoyalBlackjackLogo className="w-full h-full object-cover z-10" />
          ) : houseAvatar && !imgError ? (
            <img
              src={houseAvatar}
              alt={displayDealerName}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover z-10"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-[#3b4252] to-[#1e222b] flex items-center justify-center text-white font-bold text-sm select-none">
              {(displayDealerName || 'D').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-white/90 font-bold text-xs sm:text-sm tracking-wide flex items-center gap-1">
            {mode === 'tournament' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
            {displayDealerName}
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
        <div className="flex flex-col items-center gap-2 mt-1.5 sm:mt-2 relative z-30">
          <div className="flex relative">
            <AnimatePresence>
              {dealerHand.cards.map((c, i) => (
                <PlayingCard
                  key={i}
                  card={c}
                  index={i}
                  size="lg"
                  globalDelayIndex={i < 2 ? i * (totalSeats + 1) + totalSeats : 0}
                />
              ))}
            </AnimatePresence>

            {/* Dealer Score Badge pinned to the cards with 100% opaque, high-contrast dark green/gold pill */}
            {dealerHand && dealerHand.cards.length > 0 && (
              <motion.div 
                key="score"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 z-40 bg-[#09120c] px-3.5 py-0.5 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.95)] border-2 border-[#d4af37] font-mono text-xs sm:text-sm font-extrabold text-[#ffd86b] whitespace-nowrap flex items-center justify-center min-w-[32px]"
              >
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
        </div>
      ) : (
        <div className="w-[56px] h-[82px] sm:w-[64px] sm:h-[94px] md:w-[70px] md:h-[102px] lg:w-[80px] lg:h-[116px] border border-dashed border-white/10 rounded-lg opacity-20 flex items-center justify-center mt-2">
        </div>
      )}
    </div>
  );
}
