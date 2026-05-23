import React from 'react';
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

  return (
    <div className="flex gap-1.5 sm:gap-4 pointer-events-auto flex-wrap justify-center mb-[6px] shrink-0">
      {canBuyInsurance && (
        <button
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-[1rem] sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-purple-500/20"
          onClick={() => { soundManager.playClick(); buyInsurance(tableId, activeSeatIndex); }}
        >
          Insurance
        </button>
      )}
      {canSplit && (
        <button
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-[1rem] sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-blue-500/20"
          onClick={() => { soundManager.playClick(); split(tableId, activeSeatIndex); }}
        >
          Split
        </button>
      )}
      {canDouble && (
        <button
          className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-[1rem] sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-yellow-500/20"
          onClick={() => { soundManager.playClick(); doubleDown(tableId, activeSeatIndex); }}
        >
          Double
        </button>
      )}
      <button
        className="bg-[#33a852] hover:bg-[#2c9646] text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-5 sm:px-8 py-2 rounded-[1rem] sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-green-500/20"
        onClick={() => { soundManager.playClick(); hit(tableId, activeSeatIndex); }}
      >
        Hit
      </button>
      <button
        className="bg-[#ea4335] hover:bg-[#d63a2d] text-white font-bold uppercase tracking-wider text-xs sm:text-sm px-5 sm:px-8 py-2 rounded-[1rem] sm:rounded-[1rem] shadow-xl transition-transform active:scale-95 shadow-red-500/20"
        onClick={() => { soundManager.playClick(); stand(tableId, activeSeatIndex); }}
      >
        Stand
      </button>
    </div>
  );
}
