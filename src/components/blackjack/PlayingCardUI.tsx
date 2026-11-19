import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { PlayingCard as PlayingCardType } from '@/store/gameStore';
import { soundManager } from '@/lib/sounds';
import { CARD_DEAL_STEP_MS, CARD_DEAL_STEP_SEC } from './DelayedScore';

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

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  index,
  globalDelayIndex = 0,
  size = 'md',
  pan = 0,
}) => {
  const mountDelayRef = useRef(globalDelayIndex);
  const mountPanRef = useRef(pan);

  useEffect(() => {
    // Play deal sound once on mount with the exact sequential dealing delay
    const timeout = setTimeout(() => {
      soundManager.playCardDeal(mountPanRef.current);
    }, mountDelayRef.current * CARD_DEAL_STEP_MS);
    return () => clearTimeout(timeout);
  }, []);

  // Launch each card smoothly from the top-right 6-Deck Shoe position toward its seat
  const shoeStartX = `${Math.round(32 - pan * 22)}vw`;

  // Define different component sizes to be responsive
  const sizeClasses = {
    sm: "w-[40px] h-[60px] sm:w-[50px] sm:h-[75px] md:w-[60px] md:h-[90px] p-1 sm:p-1.5 -ml-[18px] sm:-ml-[25px]",
    md: "w-[42px] h-[63px] sm:w-[50px] sm:h-[75px] md:w-[60px] md:h-[90px] lg:w-[68px] lg:h-[102px] p-1 sm:p-1.5 md:p-2 -ml-[19px] sm:-ml-[25px] md:-ml-[30px]",
    lg: "w-[52px] h-[76px] sm:w-[68px] sm:h-[100px] md:w-[74px] md:h-[110px] lg:w-[82px] lg:h-[122px] p-1 sm:p-2 md:p-2.5 lg:p-3 -ml-[22px] sm:-ml-[30px] md:-ml-[35px] lg:-ml-[40px]"
  };

  const textClasses = {
    sm: "text-[12px] sm:text-[14px]",
    md: "text-[13px] sm:text-[14px] md:text-[18px] lg:text-[20px]",
    lg: "text-[15px] sm:text-[19px] md:text-[21px] lg:text-[24px]"
  };

  const suitClasses = {
    sm: "text-[22px] sm:text-[32px]",
    md: "text-[24px] sm:text-[32px] md:text-[40px] lg:text-[48px]",
    lg: "text-[30px] sm:text-[42px] md:text-[48px] lg:text-[56px]"
  };

  return (
    <motion.div
      initial={{ x: shoeStartX, y: -260, opacity: 0, scale: 0.55, rotate: -28 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{
        delay: mountDelayRef.current * CARD_DEAL_STEP_SEC,
        type: "spring",
        stiffness: 210,
        damping: 22,
        mass: 0.85,
      }}
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
