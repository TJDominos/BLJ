import React, { useEffect, useState } from 'react';
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
  const { buyInsurance, split, doubleDown, hit, stand } = useGameStore();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    setPendingAction(null);
  }, [tableId, activeSeatIndex]);

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    if (pendingAction) return;
    soundManager.playClick();
    setPendingAction(label);
    try {
      await fn();
    } finally {
      setPendingAction((cur) => (cur === label ? null : cur));
    }
  };

  return (
    <div className="flex gap-1.5 sm:gap-3 pointer-events-auto flex-wrap justify-center mb-[4px] shrink-0 max-w-full">
      {canBuyInsurance && (
        <button
          disabled={Boolean(pendingAction)}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-purple-500/20 cursor-pointer"
          onClick={() => void runAction('insurance', () => buyInsurance(tableId, activeSeatIndex))}
        >
          {pendingAction === 'insurance' ? '...' : 'Insurance'}
        </button>
      )}
      {canSplit && (
        <button
          disabled={Boolean(pendingAction)}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-blue-500/20 cursor-pointer"
          onClick={() => void runAction('split', () => split(tableId, activeSeatIndex))}
        >
          {pendingAction === 'split' ? '...' : 'Split'}
        </button>
      )}
      {canDouble && (
        <button
          disabled={Boolean(pendingAction)}
          className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-3 sm:px-4 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-yellow-500/20 cursor-pointer"
          onClick={() => void runAction('double', () => doubleDown(tableId, activeSeatIndex))}
        >
          {pendingAction === 'double' ? '...' : 'Double'}
        </button>
      )}
      <button
        disabled={Boolean(pendingAction)}
        className="bg-[#33a852] hover:bg-[#2c9646] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-5 sm:px-8 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-green-500/20 cursor-pointer"
        onClick={() => void runAction('hit', () => hit(tableId, activeSeatIndex))}
      >
        {pendingAction === 'hit' ? 'Hitting...' : 'Hit'}
      </button>
      <button
        disabled={Boolean(pendingAction)}
        className="bg-[#ea4335] hover:bg-[#d63a2d] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider text-[11px] sm:text-sm px-5 sm:px-8 min-h-[38px] py-2 rounded-xl sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-red-500/20 cursor-pointer"
        onClick={() => void runAction('stand', () => stand(tableId, activeSeatIndex))}
      >
        {pendingAction === 'stand' ? 'Standing...' : 'Stand'}
      </button>
    </div>
  );
}

