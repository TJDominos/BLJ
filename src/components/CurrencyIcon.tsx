import React from 'react';
import { cn } from '../lib/utils';

export function CurrencyIcon({ currency, className }: { currency: 'Gcoin' | 'Bonus' | 'Chip', className?: string }) {
  if (currency === 'Gcoin') {
    return (
      <div className={cn("rounded-full border-[1.5px] border-[#8e6022] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden bg-gradient-to-b from-[#ffeed2] to-[#ffc53d]", className)}>
        <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-white/60 rounded-full blur-[0.5px]"></div>
      </div>
    );
  }
  
  if (currency === 'Bonus') {
    return (
      <div className={cn("rounded-full bg-[#2b7fff] flex items-center justify-center relative overflow-hidden", className)}>
        <svg viewBox="0 0 24 24" className="w-[75%] h-[75%]">
          <circle cx="12" cy="6.5" r="4.5" fill="white" />
          <circle cx="17.2" cy="10.3" r="4.5" fill="white" />
          <circle cx="15.2" cy="16.5" r="4.5" fill="white" />
          <circle cx="8.8" cy="16.5" r="4.5" fill="white" />
          <circle cx="6.8" cy="10.3" r="4.5" fill="white" />
          <circle cx="12" cy="12" r="4.5" fill="white" />
          <circle cx="12" cy="12" r="3" fill="#2b7fff" />
        </svg>
      </div>
    );
  }

  // Chip
  return (
    <div className={cn("rounded-full border border-white/50 bg-[#c0392b] flex items-center justify-center relative overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_1px_3px_rgba(0,0,0,0.6)]", className)}>
       <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-white/30"></div>
       <div className="w-[40%] h-[40%] rounded-full bg-[#3498db] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] z-10"></div>
    </div>
  );
}
