import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { PlayingCard as PlayingCardType } from '@/store/gameStore';
import { soundManager } from '@/lib/sounds';

export interface PlayingCardProps {
  card: PlayingCardType;
  index: number;
  globalDelayIndex?: number;
  // Size variants for responsiveness
  size?: 'sm' | 'md' | 'lg';
  pan?: number;
}

const getCardColor = (suit: string) => {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-slate-900';
};

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
    default: return '';
  }
};

export const PlayingCard: React.FC<PlayingCardProps> = ({ card, index, globalDelayIndex = 0, size = 'md', pan = 0 }) => {
  useEffect(() => {
    // Play deal sound with the same delay as the animation
    const timeout = setTimeout(() => {
      soundManager.playCardDeal(pan);
    }, globalDelayIndex * 150);
    return () => clearTimeout(timeout);
  }, [globalDelayIndex, pan]);
  // Define different component sizes to be responsive
  const sizeClasses = {
    sm: "w-[36px] h-[54px] sm:w-[50px] sm:h-[75px] md:w-[60px] md:h-[90px] p-1 sm:p-1.5 -ml-[18px] sm:-ml-[25px]",
    md: "w-[36px] h-[54px] sm:w-[50px] sm:h-[75px] md:w-[60px] md:h-[90px] lg:w-[68px] lg:h-[102px] p-1 sm:p-1.5 md:p-2 -ml-[18px] sm:-ml-[25px] md:-ml-[30px]",
    lg: "w-[50px] h-[75px] md:w-[70px] md:h-[105px] lg:w-[80px] lg:h-[120px] p-1.5 md:p-2.5 lg:p-3 -ml-[25px] md:-ml-[35px] lg:-ml-[40px]"
  };

  const textClasses = {
    sm: "text-[12px] sm:text-[14px]",
    md: "text-[12px] sm:text-[14px] md:text-[18px] lg:text-[20px]",
    lg: "text-[14px] md:text-[20px] lg:text-[24px]"
  };

  const suitClasses = {
    sm: "text-[20px] sm:text-[32px]",
    md: "text-[20px] sm:text-[32px] md:text-[40px] lg:text-[48px]",
    lg: "text-[32px] md:text-[48px] lg:text-[56px]"
  };

  return (
    <motion.div
      initial={{ x: "30vw", y: -300, opacity: 0, scale: 0.5, rotate: -180 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{ delay: globalDelayIndex * 0.15, type: "spring", stiffness: 200, damping: 20 }}
      className={cn(
        "rounded-lg bg-white border border-gray-200 shadow-xl flex flex-col justify-between transform shrink-0",
        sizeClasses[size],
        index === 0 && "!ml-0"
      )}
    >
      {card.isHidden ? (
        <div 
          className="w-full h-full rounded overflow-hidden bg-cover bg-center" 
          style={{ backgroundImage: "url('/card-back.png')", backgroundColor: "#18452B" }}
        />
      ) : (
        <>
          <div className={cn("font-bold leading-none", textClasses[size], getCardColor(card.suit))}>
            {card.value}
          </div>
          <div className="flex-1 flex justify-center items-center">
             <span className={cn(suitClasses[size], getCardColor(card.suit))}>
               {getSuitSymbol(card.suit)}
             </span>
          </div>
        </>
      )}
    </motion.div>
  );
};
