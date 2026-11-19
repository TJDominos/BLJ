import React, { useState, useEffect } from 'react';

export const CARD_DEAL_STEP_SEC = 0.22;
export const CARD_DEAL_STEP_MS = 220;
export const CARD_LAND_BUFFER_MS = 260;

/**
 * Computes the exact sequential dealing order of occupied seats that have cards in this round,
 * matching a real casino table: Seat 1 (far right, seats.length - 1) -> Seat 7 (far left, 0),
 * skipping empty seats (or respecting server VRF turnOrder when table uses Random order).
 */
export function computeActiveDealtSeatOrder(
  seats: Array<{ userId: string | null; hand: any; isSplitHand?: boolean }> | undefined,
  turnOrder?: number[]
): number[] {
  if (!Array.isArray(seats) || seats.length === 0) return [];
  const baseOrder =
    Array.isArray(turnOrder) && turnOrder.length === seats.length
      ? turnOrder
      : Array.from({ length: seats.length }, (_, i) => seats.length - 1 - i);

  const ordered: number[] = [];
  const seen = new Set<number>();

  for (const idx of baseOrder) {
    if (seen.has(idx) || idx < 0 || idx >= seats.length) continue;
    seen.add(idx);
    const s = seats[idx];
    if (s && s.userId && s.hand && !s.isSplitHand) {
      ordered.push(idx);
    }
  }

  for (let idx = seats.length - 1; idx >= 0; idx--) {
    if (seen.has(idx)) continue;
    const s = seats[idx];
    if (s && s.userId && s.hand && !s.isSplitHand) {
      ordered.push(idx);
    }
  }

  return ordered;
}

/**
 * Total ms until the final card of the 2-pass casino deal (Dealer's 2nd hole card) lands.
 * Pass 1: N active seats (0..N-1) -> Dealer upcard (N)
 * Pass 2: N active seats (N+1..2N) -> Dealer hole card (2N+1)
 */
export function getInitialDealTotalMs(activeDealtCount: number): number {
  const n = Math.max(1, activeDealtCount);
  return (2 * n + 1) * CARD_DEAL_STEP_MS + CARD_LAND_BUFFER_MS;
}

export interface DelayedScoreProps {
  score: number;
  cardsLength: number;
  totalSeats: number;
  seatIdx?: number;
  dealRank?: number;
  activeDealtCount?: number;
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
  dealRank,
  activeDealtCount,
  isDealer = false,
  tableStatus = 'playing',
  isSplitHand = false,
  forceInitialDealDelay = false,
}) => {
  const [displayedScore, setDisplayedScore] = useState<number | string>(score);

  useEffect(() => {
    let delay = 0;
    const n = Math.max(1, activeDealtCount ?? totalSeats);
    const rank =
      typeof dealRank === 'number' && dealRank >= 0
        ? dealRank
        : Math.max(0, Math.min(n - 1, totalSeats - 1 - seatIdx));

    if (isSplitHand) {
      delay = cardsLength <= 2 && tableStatus === 'playing' ? 180 : 0;
    } else if (cardsLength <= 2 && (tableStatus === 'playing' || forceInitialDealDelay)) {
      setDisplayedScore("");
      if (isDealer) {
        // Reveal dealer's visible score right after the dealer's 2nd card lands
        delay = (2 * n + 1) * CARD_DEAL_STEP_MS + CARD_LAND_BUFFER_MS;
      } else {
        // Reveal each seated player's score right after their 2nd card lands
        delay = ((n + 1) + rank) * CARD_DEAL_STEP_MS + CARD_LAND_BUFFER_MS;
      }
    } else {
      delay = 0;
    }

    const timeout = setTimeout(() => {
      setDisplayedScore(score);
    }, delay);

    return () => clearTimeout(timeout);
  }, [
    score,
    cardsLength,
    seatIdx,
    totalSeats,
    dealRank,
    activeDealtCount,
    isDealer,
    tableStatus,
    isSplitHand,
    forceInitialDealDelay,
  ]);

  return (
    <>{displayedScore !== "" && displayedScore !== 0 ? displayedScore : ""}</>
  );
};

/**
 * Tracks when the full authentic 2-pass casino deal finishes so player turn HUDs,
 * side-bet outcomes, and action countdowns only activate after all initial cards
 * (Seat 1 -> Seat N -> Dealer, twice) have landed.
 */
export function useDealRevealedSeats(
  tableStatus: string | undefined,
  activeDealtOrder: number[],
  holdReveal: boolean = false
): (seatIdx: number, originalSeatIndex?: number) => boolean {
  const [revealedSeats, setRevealedSeats] = useState<Record<number, boolean>>({});
  const [allInitialDealt, setAllInitialDealt] = useState<boolean>(tableStatus !== 'playing');
  const prevStatusRef = React.useRef<string | undefined>(tableStatus);
  const isJustStartingPlay =
    holdReveal || (tableStatus === 'playing' && prevStatusRef.current !== 'playing');

  const orderKey = activeDealtOrder.join(',');

  useEffect(() => {
    if (holdReveal) {
      if (tableStatus === 'playing') {
        setRevealedSeats({});
        setAllInitialDealt(false);
      }
      return;
    }

    if (tableStatus === 'playing' && prevStatusRef.current !== 'playing') {
      prevStatusRef.current = 'playing';
      setRevealedSeats({});
      setAllInitialDealt(false);

      const timers: ReturnType<typeof setTimeout>[] = [];
      const order = activeDealtOrder.length > 0 ? activeDealtOrder : [0];
      const n = order.length;

      // Mark each seat's own 2nd card as landed in exact Seat 1 -> Seat N sequence
      order.forEach((sIdx, rank) => {
        const delay = ((n + 1) + rank) * CARD_DEAL_STEP_MS + CARD_LAND_BUFFER_MS;
        const timer = setTimeout(() => {
          setRevealedSeats((prev) => ({ ...prev, [sIdx]: true }));
        }, delay);
        timers.push(timer);
      });

      // Only open player action turns once the dealer's final (2nd) card has landed
      const fullDealTimer = setTimeout(() => {
        setAllInitialDealt(true);
      }, getInitialDealTotalMs(n));
      timers.push(fullDealTimer);

      return () => {
        timers.forEach(clearTimeout);
      };
    }

    if (tableStatus !== 'playing') {
      prevStatusRef.current = tableStatus;
      setAllInitialDealt(true);
    }
  }, [tableStatus, orderKey, holdReveal]);

  return (seatIdx: number, originalSeatIndex?: number) => {
    if (holdReveal) return false;
    if (tableStatus !== 'playing') return true;
    if (isJustStartingPlay) return false;
    const lookupIdx = originalSeatIndex !== undefined ? originalSeatIndex : seatIdx;
    return allInitialDealt && Boolean(revealedSeats[lookupIdx] || allInitialDealt);
  };
}
