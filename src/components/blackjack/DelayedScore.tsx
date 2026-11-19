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
  isSplitHand?: boolean;
  forceInitialDealDelay?: boolean;
}

export const DelayedScore: React.FC<DelayedScoreProps> = ({
  score,
  cardsLength,
  totalSeats,
  seatIdx = 0,
  isDealer = false,
  tableStatus = 'playing',
  isSplitHand = false,
  forceInitialDealDelay = false,
}) => {
  const [displayedScore, setDisplayedScore] = useState<number | string>(score);

  useEffect(() => {
    let delay = 0;
    const effectiveSeats = Math.max(1, Math.min(totalSeats, 3));
    const clampedIdx = Math.max(0, Math.min(seatIdx, effectiveSeats - 1));

    if (isSplitHand) {
      delay = cardsLength <= 2 && tableStatus === 'playing' ? 180 : 0;
    } else if (cardsLength <= 2 && (tableStatus === 'playing' || forceInitialDealDelay)) {
      setDisplayedScore("");
      if (isDealer) {
        delay = ((effectiveSeats + 1) * 2 - 1) * 0.15 * 1000 + 280;
      } else {
        delay = ((effectiveSeats + 1) + (effectiveSeats - 1 - clampedIdx)) * 0.15 * 1000 + 280;
      }
    } else {
      delay = 0;
    }

    const timeout = setTimeout(() => {
      setDisplayedScore(score);
    }, delay);

    return () => clearTimeout(timeout);
  }, [score, cardsLength, seatIdx, totalSeats, isDealer, tableStatus, isSplitHand, forceInitialDealDelay]);

  return (
    <>{displayedScore !== "" && displayedScore !== 0 ? displayedScore : ""}</>
  );
};

export function useDealRevealedSeats(
  tableStatus: string | undefined,
  totalSeats: number,
  holdReveal: boolean = false
): (seatIdx: number, originalSeatIndex?: number) => boolean {
  const [revealedSeats, setRevealedSeats] = useState<Record<number, boolean>>({});
  const prevStatusRef = React.useRef<string | undefined>(tableStatus);
  const isJustStartingPlay =
    holdReveal || (tableStatus === 'playing' && prevStatusRef.current !== 'playing');

  useEffect(() => {
    if (holdReveal) {
      if (tableStatus === 'playing') {
        setRevealedSeats({});
      }
      return;
    }

    if (tableStatus === 'playing' && prevStatusRef.current !== 'playing') {
      prevStatusRef.current = 'playing';
      setRevealedSeats({});
      const timers: ReturnType<typeof setTimeout>[] = [];
      const effectiveSeats = Math.max(1, Math.min(totalSeats, 3));
      for (let sIdx = 0; sIdx < Math.max(totalSeats, 12); sIdx++) {
        const clampedIdx = Math.min(sIdx, effectiveSeats - 1);
        const delay = ((effectiveSeats + 1) + (effectiveSeats - 1 - clampedIdx)) * 150 + 280;
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
  }, [tableStatus, totalSeats, holdReveal]);

  return (seatIdx: number, originalSeatIndex?: number) => {
    if (holdReveal) return false;
    if (tableStatus !== 'playing') return true;
    if (isJustStartingPlay) return false;
    const lookupIdx = originalSeatIndex !== undefined ? originalSeatIndex : seatIdx;
    return Boolean(revealedSeats[lookupIdx]);
  };
}

