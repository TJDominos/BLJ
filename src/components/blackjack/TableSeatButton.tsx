import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { PlayerSeat, User } from '@/store/gameStore';
import { getAvatarUrl } from '@/utils/avatar';

interface TableSeatButtonProps {
  seat: PlayerSeat;
  seatIdx: number;
  totalSeats: number;
  currentUser: User | null;
  isSelected: boolean;
  dealCountdown: number | null;
  actionCountdown?: number | null;
  shakeSeats: boolean;
  onClick: () => void;
}

export function TableSeatButton({
  seat,
  seatIdx,
  totalSeats,
  currentUser,
  isSelected,
  dealCountdown,
  actionCountdown = null,
  shakeSeats,
  onClick,
}: TableSeatButtonProps) {
  const isSeated = seat.userId !== null;
  const isCurrentUser = isSelected || (currentUser && seat.userId === currentUser.id);

  // Correct avatar and name resolution (authoritative identity from session/user/seat)
  const seatAvatar =
    (isCurrentUser ? currentUser?.avatar : seat.avatar) ||
    (seat.userId ? getAvatarUrl(seat.userId, seat.avatar) : undefined);

  const seatName = (isCurrentUser ? currentUser?.name : seat.name) || 'Player';

  return (
    <motion.div
      onClick={onClick}
      animate={shakeSeats && !isSelected && !isSeated ? { x: [-10, 10, -10, 10, 0] } : {}}
      transition={{ duration: 0.4 }}
      className={cn(
        "absolute bottom-[8px] sm:bottom-[10px] [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-[2px] left-1/2 -translate-x-1/2 w-[45px] h-[45px] sm:w-[50px] sm:h-[50px] md:w-[60px] md:h-[60px] [@media(max-height:520px)_and_(orientation:landscape)]:!w-[38px] [@media(max-height:520px)_and_(orientation:landscape)]:!h-[38px] text-[10px] sm:text-[12px] [@media(max-height:520px)_and_(orientation:landscape)]:!text-[9px] z-50 shadow-xl bg-black/60 rounded-full",
        "flex flex-col items-center justify-center border transition-all cursor-pointer font-bold uppercase tracking-widest leading-none",
        seat.isReady
          ? "border-[#32d5a4] text-[#32d5a4] bg-[#32d5a4]/30 shadow-[0_0_15px_rgba(50,213,164,0.3)] backdrop-blur-[2px]"
          : isSelected
          ? "border-amber-400/80 text-amber-400 bg-black/40 shadow-[0_0_15px_rgba(251,191,36,0.3)] backdrop-blur-[2px]"
          : isSeated
          ? "border-white/20 text-white/50 bg-black/40"
          : "border-white/10 text-white bg-black/60 shadow-lg hover:border-white/50 backdrop-blur-[2px]",
        shakeSeats && !isSelected && !isSeated && "border-red-500/80 text-white bg-red-500/60"
      )}
    >
      {isSeated ? (
        <div className="flex flex-col items-center justify-center w-full h-full relative">
          {isSelected && !seat.isReady && (
            <div className="absolute inset-[3px] rounded-full ring-2 ring-amber-400 ring-offset-0 animate-pulse shadow-[0_0_20px_rgba(251,191,36,0.8)] z-0" />
          )}

          {seatAvatar ? (
            <img
              src={seatAvatar}
              alt={seatName}
              className={cn(
                "w-[80%] h-[80%] rounded-full object-cover relative z-10",
                seat.isReady
                  ? isSelected
                    ? "ring-2 ring-offset-1 ring-offset-black ring-[#32d5a4] shadow-[0_0_15px_rgba(50,213,164,0.8)]"
                    : "shadow-[0_0_10px_rgba(50,213,164,0.5)]"
                  : isSelected
                  ? "opacity-100"
                  : "opacity-85"
              )}
            />
          ) : (
            <div
              className={cn(
                "w-[80%] h-[80%] rounded-full relative z-10 flex items-center justify-center font-bold text-white text-xs select-none bg-gradient-to-br from-[#126b6f] to-[#0a3e40]",
                seat.isReady
                  ? isSelected
                    ? "ring-2 ring-offset-1 ring-offset-black ring-[#32d5a4] shadow-[0_0_15px_rgba(50,213,164,0.8)]"
                    : "shadow-[0_0_10px_rgba(50,213,164,0.5)]"
                  : isSelected
                  ? "opacity-100"
                  : "opacity-85"
              )}
            >
              {seatName.charAt(0).toUpperCase()}
            </div>
          )}

          {/* 50% Semi-Transparent Action Timer Overlay on Avatar */}
          {actionCountdown !== null && actionCountdown !== undefined && (
            <div
              className={cn(
                "absolute inset-[10%] flex items-center justify-center rounded-full bg-black/50 z-20 pointer-events-none transition-all",
                actionCountdown <= 5 ? "ring-2 ring-amber-400 animate-pulse" : "ring-1 ring-amber-300/70"
              )}
            >
              <span
                className={cn(
                  "font-mono font-black text-sm sm:text-base md:text-lg leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]",
                  actionCountdown <= 5 ? "text-amber-300" : "text-white"
                )}
              >
                {actionCountdown}
              </span>
            </div>
          )}

          {seat.isReady && dealCountdown !== null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] flex flex-col items-center justify-center bg-black/65 rounded-full z-20 shadow-[inset_0_0_10px_rgba(50,213,164,0.2)]">
              <span className="text-[6px] sm:text-[8px] font-black text-[#32d5a4] uppercase mt-0.5" style={{ WebkitTextStroke: '0.2px black' }}>
                READY
              </span>
            </div>
          )}

          {/* Seat Player Name Tag */}
          <div className="absolute -bottom-2.5 sm:-bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center z-30 pointer-events-none">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold tracking-tight shadow-md border whitespace-nowrap truncate max-w-[62px] sm:max-w-[74px] text-center leading-tight",
                isSelected
                  ? "bg-amber-400 text-black border-amber-300 font-extrabold shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                  : seat.isReady
                  ? "bg-[#183a2d] text-[#32d5a4] border-[#32d5a4]/40"
                  : "bg-black/85 text-slate-200 border-white/20"
              )}
            >
              {seatName}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[1px]">
          <span className="text-[8px] sm:text-[10px] md:text-[12px] text-white/50 tracking-widest font-mono uppercase">
            SEAT {totalSeats - seatIdx}
          </span>
          <span>Sit</span>
        </div>
      )}
    </motion.div>
  );
}
