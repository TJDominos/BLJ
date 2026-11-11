import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface DelayedScoreProps {
  score: number;
  cardsLength: number;
  totalSeats: number;
  seatIdx?: number;
  isDealer?: boolean;
  tableStatus?: string;
}

export const DelayedScore: React.FC<DelayedScoreProps> = ({ score, cardsLength, totalSeats, seatIdx = 0, isDealer = false, tableStatus = 'playing' }) => {
  const [displayedScore, setDisplayedScore] = useState<number | string>(score);

  useEffect(() => {
    let delay = 0;
    
    // Only apply the long delay during the initial dealing phase
    if (cardsLength <= 2 && tableStatus === 'playing') {
      // Clear score immediately while waiting for dealing animation
      setDisplayedScore("");
      if (isDealer) {
        // Dealer receives 2nd card (hidden one) at the very end of 2nd round
        delay = ((totalSeats + 1) * 2 - 1) * 0.15 * 1000 + 400; 
      } else {
        // Player receives 2nd card at delay: (totalSeats + 1) + (totalSeats - 1 - seatIdx)
        delay = ((totalSeats + 1) + (totalSeats - 1 - seatIdx)) * 0.15 * 1000 + 400;
      }
    } else {
      delay = 0; 
    }

    const timeout = setTimeout(() => {
      setDisplayedScore(score);
    }, delay);

    return () => clearTimeout(timeout);
  }, [score, cardsLength, seatIdx, totalSeats, isDealer, tableStatus]);

  return (
    <>{displayedScore !== "" && displayedScore !== 0 ? displayedScore : ""}</>
  );
};

export function useDealRevealedSeats(
  tableStatus: string | undefined,
  totalSeats: number
): (seatIdx: number, originalSeatIndex?: number) => boolean {
  const [revealedSeats, setRevealedSeats] = useState<Record<number, boolean>>({});
  const prevStatusRef = React.useRef<string | undefined>(tableStatus);
  const isJustStartingPlay = tableStatus === 'playing' && prevStatusRef.current !== 'playing';

  useEffect(() => {
    if (tableStatus === 'playing' && prevStatusRef.current !== 'playing') {
      prevStatusRef.current = 'playing';
      setRevealedSeats({});
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let sIdx = 0; sIdx < Math.max(totalSeats, 12); sIdx++) {
        const effectiveSeats = Math.max(1, totalSeats);
        const clampedIdx = Math.min(sIdx, effectiveSeats - 1);
        const delay = ((effectiveSeats + 1) + (effectiveSeats - 1 - clampedIdx)) * 150 + 400;
        const timer = setTimeout(() => {
          setRevealedSeats((prev) => ({ ...prev, [sIdx]: true }));
        }, delay);
        timers.push(timer);
      }
      return () => {
        timers.forEach(clearTimeout);
      };
    }

    if (tableStatus !== 'playing') {
      prevStatusRef.current = tableStatus;
    }
  }, [tableStatus, totalSeats]);

  return (seatIdx: number, originalSeatIndex?: number) => {
    if (tableStatus !== 'playing') return true;
    if (isJustStartingPlay) return false;
    const lookupIdx = originalSeatIndex !== undefined ? originalSeatIndex : seatIdx;
    return Boolean(revealedSeats[lookupIdx]);
  };
}

