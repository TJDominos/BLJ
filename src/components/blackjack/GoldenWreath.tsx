import React from 'react';
import { motion } from 'motion/react';

export function GoldenWreath({ delay = 0.5 }: { delay?: number }) {
  return (
    <motion.div 
      initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ 
        type: "spring", 
        stiffness: 100, 
        damping: 10,
        delay: delay 
      }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 w-[110px] h-[110px] sm:w-[150px] sm:h-[150px]"
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,197,61,0.8)] overflow-visible">
        <defs>
          <linearGradient id="goldGradFeather" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff5d1" />
            <stop offset="40%" stopColor="#ffc53d" />
            <stop offset="80%" stopColor="#b37b00" />
            <stop offset="100%" stopColor="#ffe680" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#glow)">
          {/* Left Feather Wreath */}
          {/* Main Stem */}
          <path d="M 50 95 C 10 90, -5 50, 15 15 C 20 8, 30 5, 45 10" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Feathery Barbs - Left Side */}
          <path d="M 45 92 Q 25 90 20 85" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 38 88 Q 15 80 12 75" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 30 80 Q 5 70 8 62" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 22 70 Q -2 55 5 45" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 16 58 Q -5 40 8 30" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 13 45 Q 0 25 18 15" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 15 30 Q 15 15 30 10" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 22 20 Q 25 5 42 8" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          {/* Inner Barbs - Left */}
          <path d="M 42 93 Q 35 80 40 75" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 35 85 Q 25 70 32 65" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 26 73 Q 16 60 25 55" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 20 62 Q 10 45 22 40" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 15 48 Q 10 30 25 25" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 15 32 Q 20 20 35 15" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />

          {/* Right Feather Wreath */}
          {/* Main Stem */}
          <path d="M 50 95 C 90 90, 105 50, 85 15 C 80 8, 70 5, 55 10" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Feathery Barbs - Right Side */}
          <path d="M 55 92 Q 75 90 80 85" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 62 88 Q 85 80 88 75" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 70 80 Q 95 70 92 62" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 78 70 Q 102 55 95 45" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 84 58 Q 105 40 92 30" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 87 45 Q 100 25 82 15" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 85 30 Q 85 15 70 10" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 78 20 Q 75 5 58 8" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          {/* Inner Barbs - Right */}
          <path d="M 58 93 Q 65 80 60 75" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 65 85 Q 75 70 68 65" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 74 73 Q 84 60 75 55" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 80 62 Q 90 45 78 40" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 85 48 Q 90 30 75 25" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
          <path d="M 85 32 Q 80 20 65 15" fill="none" stroke="url(#goldGradFeather)" strokeWidth="1" />
        </g>
      </svg>
      
      {/* Subtle glow effect behind cards */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 bg-[#ffc53d]/20 rounded-full blur-xl"></div>
    </motion.div>
  );
}
