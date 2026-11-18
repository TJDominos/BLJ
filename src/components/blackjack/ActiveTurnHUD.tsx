import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { soundManager } from '@/lib/sounds';

interface ActiveTurnHUDProps {
  tableId: string;
  activeSeatIndex: number;
  canBuyInsurance: boolean;
  canSplit: boolean;
  canDouble: boolean;
}

export function ActiveTurnHUD({
  tableId,
  activeSeatIndex,
  canBuyInsurance,
  canSplit,
  canDouble
}: ActiveTurnHUDProps) {
  const { buyInsurance, split, doubleDown, hit, stand, tables } = useGameStore();
  const table = tables[tableId];
  const activeSeat = table?.seats?.[activeSeatIndex];
  const activeHand = activeSeat?.hand;

  // Unique signature for the current decision point in this hand:
  // Once any action button is clicked in this step, no button can be clicked again
  // until the server advances the step (e.g. new card dealt, split created, insurance added, or next turn).
  const currentStepKey = `${tableId}:${table?.roundsPlayed ?? 0}:${table?.seats?.length ?? 0}:${activeSeatIndex}:${activeHand?.cards?.length ?? 0}:${activeHand?.status ?? ''}:${activeHand?.insuranceBet ?? 0}`;

  const lockedStepKeyRef = useRef<string | null>(null);
  const [lockedStep, setLockedStep] = useState<{ key: string; action: string } | null>(null);

  useEffect(() => {
    if (lockedStep && lockedStep.key !== currentStepKey) {
      lockedStepKeyRef.current = null;
      setLockedStep(null);
    }
  }, [currentStepKey, lockedStep]);

  const isStepLocked =
    lockedStepKeyRef.current === currentStepKey || lockedStep?.key === currentStepKey;
  const pendingAction = lockedStep?.key === currentStepKey ? lockedStep.action : null;

  const runAction = async (
    label: string,
    fn: () => Promise<{ ok?: boolean } | unknown>
  ) => {
    // Synchronous ref check prevents same-frame double-clicks before React re-renders
    if (lockedStepKeyRef.current === currentStepKey) return;
    lockedStepKeyRef.current = currentStepKey;
    setLockedStep({ key: currentStepKey, action: label });
    soundManager.playClick();

    // Safety fallback timer in case network drops and state never transitions
    const fallbackTimer = setTimeout(() => {
      if (lockedStepKeyRef.current === currentStepKey) {
        lockedStepKeyRef.current = null;
        setLockedStep((cur) => (cur?.key === currentStepKey ? null : cur));
      }
    }, 5000);

    try {
      const res = await fn();
      const explicitlyFailed =
        res && typeof res === 'object' && 'ok' in res && (res as { ok?: boolean }).ok === false;
      if (explicitlyFailed) {
        clearTimeout(fallbackTimer);
        if (lockedStepKeyRef.current === currentStepKey) {
          lockedStepKeyRef.current = null;
        }
        setLockedStep((cur) => (cur?.key === currentStepKey ? null : cur));
      }
    } catch {
      clearTimeout(fallbackTimer);
      if (lockedStepKeyRef.current === currentStepKey) {
        lockedStepKeyRef.current = null;
      }
      setLockedStep((cur) => (cur?.key === currentStepKey ? null : cur));
    }
  };

  return (
    <div className="flex gap-1.5 sm:gap-3 pointer-events-auto flex-wrap justify-center mb-[4px] shrink-0 max-w-full">
      {canBuyInsurance && (
        <button
          type="button"
          disabled={isStepLocked}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-purple-500/20 cursor-pointer"
          onClick={() => void runAction('insurance', () => buyInsurance(tableId, activeSeatIndex))}
        >
          {pendingAction === 'insurance' ? '...' : 'Insurance'}
        </button>
      )}
      {canSplit && (
        <button
          type="button"
          disabled={isStepLocked}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-blue-500/20 cursor-pointer"
          onClick={() => void runAction('split', () => split(tableId, activeSeatIndex))}
        >
          {pendingAction === 'split' ? '...' : 'Split'}
        </button>
      )}
      {canDouble && (
        <button
          type="button"
          disabled={isStepLocked}
          className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-yellow-500/20 cursor-pointer"
          onClick={() => void runAction('double', () => doubleDown(tableId, activeSeatIndex))}
        >
          {pendingAction === 'double' ? '...' : 'Double'}
        </button>
      )}
      <button
        type="button"
        disabled={isStepLocked}
        className="bg-[#33a852] hover:bg-[#2c9646] disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-5 sm:px-8 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-green-500/20 cursor-pointer"
        onClick={() => void runAction('hit', () => hit(tableId, activeSeatIndex))}
      >
        {pendingAction === 'hit' ? 'Hitting...' : 'Hit'}
      </button>
      <button
        type="button"
        disabled={isStepLocked}
        className="bg-[#ea4335] hover:bg-[#d63a2d] disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-5 sm:px-8 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-red-500/20 cursor-pointer"
        onClick={() => void runAction('stand', () => stand(tableId, activeSeatIndex))}
      >
        {pendingAction === 'stand' ? 'Standing...' : 'Stand'}
      </button>
    </div>
  );
}


