import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameTable } from '@/store/gameStore';

interface DealControlHUDProps {
  table: GameTable;
  mySeats: number[];
  betAmountStr: string;
  onBetChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBetBlur: () => void;
  onMinus: () => void;
  onPlus: () => void;
  
  sideBetsEnabled: boolean;
  pairBetStr: string;
  onPairChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPairBlur: () => void;
  onPairMinus: () => void;
  onPairPlus: () => void;

  plus3BetStr: string;
  onPlus3Change: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPlus3Blur: () => void;
  onPlus3Minus: () => void;
  onPlus3Plus: () => void;

  onDeal: () => void;
  dealCountdown: number | null;
  isTournament: boolean;
  onSideBetsToggle: () => void;
}

export function DealControlHUD({
  table,
  mySeats,
  betAmountStr,
  onBetChange,
  onBetBlur,
  onMinus,
  onPlus,
  sideBetsEnabled,
  pairBetStr,
  onPairChange,
  onPairBlur,
  onPairMinus,
  onPairPlus,
  plus3BetStr,
  onPlus3Change,
  onPlus3Blur,
  onPlus3Minus,
  onPlus3Plus,
  onDeal,
  dealCountdown,
  isTournament,
  onSideBetsToggle
}: DealControlHUDProps) {

  const isAnySeatNotReady = mySeats.some(sIdx => !table.seats[sIdx].isReady);

  return (
    <div className="absolute bottom-1 sm:bottom-4 w-full flex flex-col items-center z-30 px-4 pointer-events-none">
      <div className="relative flex flex-col pointer-events-auto z-10 w-[96%] sm:w-auto drop-[0_10px_20px_rgba(0,0,0,0.6)]">
        <div 
          className="relative flex flex-row items-center border-[2px] border-[#6b4c2a] rounded-full bg-gradient-to-b from-[#eac574] via-[#d0a758] to-[#997027] p-1 md:p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.4)] max-w-full w-full sm:w-[420px] h-[44px] sm:h-[60px]"
        >
          <div className="absolute left-1 right-1 inset-y-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20 pointer-events-none rounded-full"></div>

          {/* Left Filigree */}
          <div className="hidden sm:flex w-6 sm:w-10 items-center justify-center text-[#5c3e1b] opacity-80 z-10 mr-1">
            <svg viewBox="0 0 60 120" className="h-[2rem] w-auto">
                <path d="M60 0 C30 0 20 20 10 40 C0 55 0 65 10 80 C20 100 30 120 60 120 Z" fill="#d0a758" stroke="currentColor" strokeWidth="2" />
                <path d="M50 15 C30 15 25 30 30 40 C35 50 45 45 45 35" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <path d="M55 45 C40 45 35 55 40 65 C45 75 55 70 55 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <path d="M50 105 C30 105 25 90 30 80 C35 70 45 75 45 85" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>

          <div className="flex-1 flex flex-row gap-2 sm:gap-4 items-center z-10 mx-auto justify-center w-full max-w-full">
              {/* Bet Input Body */}
              <div className="flex flex-col gap-0.5 items-center shrink">
                {isTournament ? (
                  <span className="text-[8px] sm:text-[9px] text-[#ffc53d] font-bold uppercase tracking-wider mb-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">Min Blind: {table.settings.tournament?.minBetChips || 50}</span>
                ) : (
                  <span className="text-[10px] sm:text-[12px] text-[#eac574] font-bold tracking-widest uppercase drop-shadow-md leading-none shadow-black whitespace-nowrap">
                    Bet Amount
                  </span>
                )}
                <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[110px] sm:w-[150px] shrink-0 h-[32px] sm:h-[44px] p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.4)] border border-[#3a2510]">
                    <button 
                      onClick={onMinus}
                      className="w-[24px] h-[24px] sm:w-[36px] sm:h-[36px] rounded-[8px] sm:rounded-xl bg-gradient-to-b from-[#bd945d] to-[#987241] flex justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold text-xl"
                    >
                      <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <input 
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-white font-black text-[12px] sm:text-[18px] min-w-[20px] text-center px-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                        value={betAmountStr}
                        onChange={onBetChange}
                        onBlur={onBetBlur}
                    />
                    <button 
                      onClick={onPlus}
                      className="w-[24px] h-[24px] sm:w-[36px] sm:h-[36px] rounded-[8px] sm:rounded-xl bg-gradient-to-b from-[#bd945d] to-[#987241] flex justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold text-xl"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>
              </div>

              {/* SIDE Toggles */}
              <div className="flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] sm:text-xs text-white/90 font-black uppercase tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] mb-[1px]" style={{WebkitTextStroke: '0.5px rgba(0,0,0,0.5)'}}>Side</span>
                <button 
                  onClick={onSideBetsToggle}
                  className={cn("w-8 h-4 sm:w-12 sm:h-6 rounded-full p-0.5 sm:p-1 transition-colors relative shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] border border-black/30", sideBetsEnabled ? "bg-[#32d5a4]" : "bg-[#454746]")}>
                    <div className={cn("w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-transform shadow-md", sideBetsEnabled ? "bg-white translate-x-4 sm:translate-x-6" : "bg-[#c0c0c0] translate-x-0")} />
                </button>
              </div>

              {/* DEAL Button */}
              {(() => {
                if (!isAnySeatNotReady && mySeats.length > 0) {
                  return (
                    <div className="relative w-[70px] sm:w-[120px] h-[32px] sm:h-[44px] flex items-center justify-center">
                       <span className="text-white/60 font-bold text-xs sm:text-sm tracking-widest uppercase">Ready</span>
                    </div>
                  );
                }
                
                return (
                  <button 
                    onClick={onDeal}
                    className={cn(
                      "relative overflow-hidden min-w-[70px] sm:min-w-[120px] h-[32px] sm:h-[44px] bg-gradient-to-b from-[#28a19b] to-[#126b6f] text-white rounded-[12px] sm:rounded-[20px] px-2 font-black tracking-widest text-[12px] sm:text-[16px] uppercase transition-all shadow-[inset_0_2px_2px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.4),0_4px_8px_rgba(0,0,0,0.5)] border border-[#0d4f52] flex items-center justify-center shrink-0 group hover:from-[#2ebaba] hover:to-[#178287]",
                      dealCountdown !== null ? "animate-pulse shadow-[0_0_15px_rgba(40,161,155,0.8)]" : "active:scale-95"
                    )}
                  >
                    {dealCountdown !== null && (
                       <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                         <div className="h-full bg-white transition-all duration-1000 ease-linear" style={{ width: `${(dealCountdown / (table.settings.actionTimeLimit || 15)) * 100}%` }}></div>
                       </div>
                    )}
                    <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] z-10 leading-none">{dealCountdown !== null ? dealCountdown : "Deal"}</span>
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  </button>
                );
              })()}
          </div>

          {/* Right Filigree */}
          <div className="hidden sm:flex w-6 sm:w-10 items-center justify-center text-[#5c3e1b] opacity-80 z-10 ml-1 scale-x-[-1]">
             <svg viewBox="0 0 60 120" className="h-[2rem] w-auto">
                <path d="M60 0 C30 0 20 20 10 40 C0 55 0 65 10 80 C20 100 30 120 60 120 Z" fill="#d0a758" stroke="currentColor" strokeWidth="2" />
                <path d="M50 15 C30 15 25 30 30 40 C35 50 45 45 45 35" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <path d="M55 45 C40 45 35 55 40 65 C45 75 55 70 55 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <path d="M50 105 C30 105 25 90 30 80 C35 70 45 75 45 85" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {sideBetsEnabled && (
          <div className="bg-gradient-to-b from-[#2b1c0e] to-[#1a1005] border border-t-0 border-[#513518] rounded-b-2xl pb-1.5 sm:pb-3 shadow-[0_10px_20px_rgba(0,0,0,0.6)] flex flex-row gap-2 sm:gap-4 justify-center items-center z-0 relative w-[90%] max-w-[360px] mx-auto -mt-6 sm:-mt-6">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 pointer-events-none rounded-b-2xl"></div>
              
              <div className="flex flex-col gap-0.5 items-center pt-8 sm:pt-8 w-full">
                <div className="flex flex-row justify-center gap-4 sm:gap-6 w-full">
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="text-[10px] sm:text-[12px] text-[#eac574] font-bold tracking-wide text-center drop-shadow-md leading-none whitespace-nowrap">
                      Perfect Pair <span className="text-white/60 text-[9px] sm:text-[10px] font-mono">(11:1)</span>
                    </span>
                    <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[95px] sm:w-[130px] h-[30px] sm:h-[40px] p-0.5 sm:p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6)] border border-[#3a2510]">
                        <button 
                          onClick={onPairMinus}
                          className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                        >
                          <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                        <input 
                          type="text"
                          className="flex-1 bg-transparent border-none outline-none text-white font-black text-[11px] sm:text-[14px] min-w-0 text-center px-0.5 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                          value={pairBetStr}
                          onChange={onPairChange}
                          onBlur={onPairBlur}
                          placeholder="10"
                        />
                        <button 
                          onClick={onPairPlus}
                          className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                        >
                          <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-0.5 items-center">
                    <span className="text-[10px] sm:text-[12px] text-[#eac574] font-bold tracking-wide text-center drop-shadow-md leading-none whitespace-nowrap">
                      21+3 <span className="text-white/60 text-[9px] sm:text-[10px] font-mono">(100:1)</span>
                    </span>
                    <div className="flex items-center bg-gradient-to-b from-[#6e4620] to-[#513518] rounded-full w-[95px] sm:w-[130px] h-[30px] sm:h-[40px] p-0.5 sm:p-1 shadow-[inset_0_3px_5px_rgba(0,0,0,0.6)] border border-[#3a2510]">
                        <button 
                          onClick={onPlus3Minus}
                          className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                        >
                          <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                        <input 
                          type="text"
                          className="flex-1 bg-transparent border-none outline-none text-white font-black text-[11px] sm:text-[14px] min-w-0 text-center px-0.5 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                          value={plus3BetStr}
                          onChange={onPlus3Change}
                          onBlur={onPlus3Blur}
                          placeholder="10"
                        />
                        <button 
                          onClick={onPlus3Plus}
                          className="flex w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] rounded-full bg-gradient-to-b from-[#bd945d] to-[#987241] justify-center items-center text-white/90 hover:text-white hover:from-[#cda36c] hover:to-[#a78150] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-[#836338] shrink-0 font-bold"
                        >
                          <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
