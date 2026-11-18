import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerSeat, User, useGameStore } from '@/store/gameStore';
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
  isPending?: boolean;
  isInteractionLocked?: boolean;
  isDisconnected?: boolean;
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
  isPending = false,
  isInteractionLocked = false,
  isDisconnected = false,
  onClick,
}: TableSeatButtonProps) {
  const { onlinePlayers, isGameOwner } = useGameStore();
  const [imgError, setImgError] = useState(false);

  const isSeated = seat.userId !== null;
  const isCurrentUser = Boolean(isSelected || (currentUser && seat.userId === currentUser.id));
  const onlineEntry = React.useMemo(
    () => (seat.userId ? onlinePlayers.find((p) => p.userId === seat.userId) : undefined),
    [onlinePlayers, seat.userId]
  );

  // Unique signature for this seat's current occupancy state
  const seatStepKey = `${seatIdx}:${seat.userId ?? 'empty'}:${seat.isReady ? 'ready' : 'unready'}`;
  const lockedSeatStepRef = useRef<string | null>(null);
  const [lockedSeatStep, setLockedSeatStep] = useState<string | null>(null);
  const prevIsPendingRef = useRef<boolean>(isPending);

  useEffect(() => {
    if (lockedSeatStep && lockedSeatStep !== seatStepKey) {
      lockedSeatStepRef.current = null;
      setLockedSeatStep(null);
    }
  }, [seatStepKey, lockedSeatStep]);

  useEffect(() => {
    // If parent finished pending action and seatStepKey did not change (e.g. modal cancelled or error), unlock
    if (prevIsPendingRef.current && !isPending) {
      lockedSeatStepRef.current = null;
      setLockedSeatStep(null);
    }
    prevIsPendingRef.current = isPending;
  }, [isPending]);

  // Correct avatar, name, and isOwner resolution from SDK player profile
  const seatAvatar = getAvatarUrl(
    seat.userId || undefined,
    (isCurrentUser ? currentUser?.avatar : undefined) || onlineEntry?.avatar || seat.avatar
  );
  const seatName =
    (isCurrentUser ? currentUser?.name : undefined) ||
    onlineEntry?.name ||
    seat.name ||
    'Player';
  const isSeatOwner = isCurrentUser
    ? Boolean(isGameOwner || onlineEntry?.isGameCreator)
    : Boolean(onlineEntry?.isGameCreator);
  const displaySeatNum = totalSeats - seatIdx;

  useEffect(() => {
    setImgError(false);
  }, [seatAvatar]);

  const isStepLocked =
    lockedSeatStepRef.current === seatStepKey || lockedSeatStep === seatStepKey;
  const isDisabled =
    isPending ||
    isInteractionLocked ||
    isStepLocked ||
    Boolean(seat.isReady) ||
    (isSeated && !isCurrentUser);

  const handleSeatClick = () => {
    if (isDisabled) return;
    if (lockedSeatStepRef.current === seatStepKey) return;
    lockedSeatStepRef.current = seatStepKey;
    setLockedSeatStep(seatStepKey);
    // Safety fallback unlock after 3.5s in case a confirmation modal was dismissed
    setTimeout(() => {
      if (lockedSeatStepRef.current === seatStepKey) {
        lockedSeatStepRef.current = null;
        setLockedSeatStep((cur) => (cur === seatStepKey ? null : cur));
      }
    }, 3500);
    onClick();
  };

  return (
    <motion.button
      type="button"
      aria-label={isSeated ? `Seat ${displaySeatNum} (${seatName})` : `Sit at Seat ${displaySeatNum}`}
      disabled={isDisabled}
      onClick={handleSeatClick}
      animate={shakeSeats && !isSelected && !isSeated ? { x: [-10, 10, -10, 10, 0] } : {}}
      transition={{ duration: 0.4 }}
      className={cn(
        "pointer-events-auto absolute bottom-[8px] sm:bottom-[10px] [@media(max-height:520px)_and_(orientation:landscape)]:!bottom-[2px] left-1/2 -translate-x-1/2 w-[45px] h-[45px] sm:w-[50px] sm:h-[50px] md:w-[60px] md:h-[60px] [@media(max-height:520px)_and_(orientation:landscape)]:!w-[38px] [@media(max-height:520px)_and_(orientation:landscape)]:!h-[38px] text-[10px] sm:text-[12px] [@media(max-height:520px)_and_(orientation:landscape)]:!text-[9px] z-50 shadow-xl bg-black/60 rounded-full p-0",
        "flex flex-col items-center justify-center border transition-all cursor-pointer font-bold uppercase tracking-widest leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:cursor-default",
        seat.isReady
          ? "border-[#32d5a4] text-[#32d5a4] bg-[#32d5a4]/30 shadow-[0_0_15px_rgba(50,213,164,0.3)] backdrop-blur-[2px]"
          : isSelected
          ? "border-amber-400/80 text-amber-400 bg-black/40 shadow-[0_0_15px_rgba(251,191,36,0.3)] backdrop-blur-[2px]"
          : isSeated
          ? "border-white/20 text-white/50 bg-black/40"
          : "border-white/10 text-white bg-black/60 shadow-lg hover:border-white/50 backdrop-blur-[2px]",
        (isPending || isStepLocked) && "opacity-75 ring-2 ring-amber-400/60",
        shakeSeats && !isSelected && !isSeated && "border-red-500/80 text-white bg-red-500/60"
      )}
    >
      {(isPending || (isStepLocked && !isSeated)) && (
        <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/55 z-40 pointer-events-none">
          <span className="w-4 h-4 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
        </span>
      )}
      {isSeated ? (
        <div className="flex flex-col items-center justify-center w-full h-full relative">
          {isSelected && !seat.isReady && (
            <div className="absolute inset-[3px] rounded-full ring-2 ring-amber-400 ring-offset-0 animate-pulse shadow-[0_0_20px_rgba(251,191,36,0.8)] z-0" />
          )}

          {seatAvatar && !imgError ? (
            <img
              src={seatAvatar}
              alt={seatName}
              onError={() => setImgError(true)}
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
          <div className="absolute -bottom-2.5 sm:-bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-30 pointer-events-none gap-0.5">
            {isDisconnected && (
              <span className="px-1 py-[1px] rounded bg-amber-500/95 text-black text-[7px] font-black tracking-tight uppercase whitespace-nowrap shadow">
                WAIT 10s
              </span>
            )}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold tracking-tight shadow-md border whitespace-nowrap truncate max-w-[68px] sm:max-w-[82px] text-center leading-tight inline-flex items-center justify-center gap-0.5",
                isDisconnected
                  ? "bg-amber-950/90 text-amber-300 border-amber-400/60"
                  : isSelected
                  ? "bg-amber-400 text-black border-amber-300 font-extrabold shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                  : seat.isReady
                  ? "bg-[#183a2d] text-[#32d5a4] border-[#32d5a4]/40"
                  : "bg-black/85 text-slate-200 border-white/20"
              )}
            >
              {isSeatOwner && (
                <Crown
                  className={cn(
                    "w-2.5 h-2.5 shrink-0",
                    isSelected && !isDisconnected ? "text-amber-950" : "text-[#ffd86b]"
                  )}
                />
              )}
              <span className="truncate">{seatName}</span>
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
    </motion.button>
  );
}
