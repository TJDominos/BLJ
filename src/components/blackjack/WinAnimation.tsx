import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useUIStore, selectRecentWinAmount } from '@/store/uiStore';

export function WinAnimation() {
  const recentWinAmount = useUIStore(selectRecentWinAmount);
  const [animatingCoins, setAnimatingCoins] = useState<{ id: string, delay: number, seatIdx: number, rotate: number, offsetX: number, offsetY: number }[]>([]);

  useEffect(() => {
    // trigger animation if any seat won
    if (recentWinAmount?.seats && recentWinAmount.seats.length > 0) {
      const coins: any[] = [];
      recentWinAmount.seats.forEach((seatIdx) => {
         for(let i=0; i<15; i++) {
           coins.push({ 
             id: `coin-${seatIdx}-${i}-${Date.now()}`, 
             delay: i * 0.05 + Math.random() * 0.1, 
             seatIdx,
             offsetX: (Math.random() - 0.5) * 60,
             offsetY: (Math.random() - 0.5) * 60,
             rotate: Math.random() * 720
           });
         }
      });
      setAnimatingCoins(coins);

      setTimeout(() => {
        setAnimatingCoins([]);
      }, 4000);
    }
  }, [recentWinAmount]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {animatingCoins.map(coin => (
        <CoinAnimation key={coin.id} coin={coin} />
      ))}
    </AnimatePresence>,
    document.body
  );
}

function CoinAnimation({ coin }: { coin: any }) {
  const [positions, setPositions] = useState<{ start: {x: number, y: number}, mid: {x: number, y: number}, end: {x: number, y: number} } | null>(null);

  useEffect(() => {
    // The starting point can be center of screen or dealer avatar
    const trayEl = document.getElementById('dealer-avatar') || document.body;
    const seatEl = document.getElementById(`seat-${coin.seatIdx}`) || document.body;
    // Always fly from dealer (start), to the player's seat (mid), and optionally to balance (end).
    // If the seat doesn't have an explicit balance container, we can just let it vanish at the seat.
    const balanceEl = document.getElementById('balance-container') || seatEl;

    const trayRect = trayEl.getBoundingClientRect();
    const seatRect = seatEl.getBoundingClientRect();
    const balanceRect = balanceEl.getBoundingClientRect();

    const start = trayEl !== document.body ? { x: trayRect.left + trayRect.width / 2, y: trayRect.top + trayRect.height / 2 } : { x: window.innerWidth / 2, y: 100 };
    const mid = seatEl !== document.body ? { x: seatRect.left + seatRect.width / 2 + coin.offsetX, y: seatRect.top + seatRect.height / 2 + coin.offsetY } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    
    // Slight jitter to scatter on the UI
    const end = { x: balanceRect.left + 20, y: balanceRect.top + balanceRect.height / 2 };
    
    setPositions({ start, mid, end });
  }, [coin]);

  if (!positions) return null;

  return (
    <motion.div
      initial={{ 
        x: positions.start.x, 
        y: positions.start.y, 
        scale: 0,
        opacity: 0,
        rotateY: 0,
        rotateX: 0,
        rotateZ: 0
      }}
      animate={{ 
        x: [positions.start.x, positions.start.x + coin.offsetX, positions.mid.x, positions.end.x], 
        y: [positions.start.y, positions.start.y - 100, positions.mid.y, positions.end.y],
        scale: [0, 1.8, 1.2, 0],
        opacity: [0, 1, 1, 0],
        rotateY: [0, 720, 1440, 2160],
        rotateX: [0, 360, coin.rotate, 0],
        rotateZ: [0, coin.rotate, 0, 0]
      }}
      transition={{ 
        duration: 2.5, 
        times: [0, 0.2, 0.6, 1],
        ease: "easeInOut",
        delay: coin.delay
      }}
      className="fixed z-[100] w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-b from-[#ffeed2] via-[#ffc53d] to-[#b47a18] border-[1px] border-[#8e6022] shadow-[0_5px_15px_rgba(255,197,61,0.8),inset_0_2px_4px_rgba(255,255,255,0.8)] pointer-events-none overflow-hidden flex items-center justify-center transform-gpu"
      style={{ left: -10, top: -10 }}
    >
      <div className="absolute top-[10%] right-[10%] w-[30%] h-[30%] bg-white rounded-full blur-[1px] opacity-70"></div>
      <div className="w-[60%] h-[60%] rounded-full border border-[#ca891d]/50 opacity-50 absolute"></div>
    </motion.div>
  );
}
