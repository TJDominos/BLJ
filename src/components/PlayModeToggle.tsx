import React from 'react';
import { useUIStore, selectPlayMode } from '../store/uiStore';
import { cn } from '../lib/utils';
import { motion, PanInfo } from 'motion/react';
import { CurrencyIcon } from './CurrencyIcon';

export function PlayModeToggle({ disabled, onUnlockRequest }: { disabled?: boolean, onUnlockRequest?: () => void }) {
    const playMode = useUIStore(selectPlayMode);
    const setPlayMode = useUIStore(state => state.setPlayMode);

    const toggleMode = () => {
        if (disabled) {
            if (onUnlockRequest) {
                onUnlockRequest();
            } else {
                alert("You have locked funds on the table. Please unlock them or leave the table to switch mode.");
            }
            return;
        }
        setPlayMode(playMode === 'Gcoin' ? 'Bonus' : 'Gcoin');
    };

    const handleDragEnd = (event: any, info: PanInfo) => {
        if (disabled) {
            if (onUnlockRequest) {
                onUnlockRequest();
            } else {
                alert("You have locked funds on the table. Please unlock them or leave the table to switch mode.");
            }
            return;
        }
        const dragDistance = info.offset.x;
        
        if (playMode === 'Gcoin' && dragDistance > 15) {
            setPlayMode('Bonus');
        } else if (playMode === 'Bonus' && dragDistance < -15) {
            setPlayMode('Gcoin');
        }
    };

    return (
        <motion.div 
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
            onClick={toggleMode}
            className={cn(
                "flex items-center bg-black/40 rounded-full p-0.5 border border-white/10 backdrop-blur-sm cursor-pointer select-none touch-none", 
                disabled && "opacity-50"
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-center rounded-full transition-all overflow-hidden relative z-10 duration-300",
                    playMode === 'Gcoin'
                        ? "px-2.5 py-1 gap-1.5 bg-gradient-to-b from-[#eac574] to-[#997027] text-white shadow-[0_0_10px_rgba(234,197,116,0.5)] border border-[#ffeed2]/40"
                        : "w-7 h-7 hover:bg-white/10 border border-transparent"
                )}
            >
                <CurrencyIcon currency="Gcoin" className={playMode === 'Gcoin' ? "w-3.5 h-3.5" : "w-4 h-4"} />
                {playMode === 'Gcoin' && <span className="text-[10px] font-bold leading-none mt-px text-[#ffeed2]">Gcoin</span>}
            </div>
            
            <div
                className={cn(
                    "flex items-center justify-center rounded-full transition-all overflow-hidden relative z-10 duration-300",
                    playMode === 'Bonus'
                        ? "px-2.5 py-1 gap-1.5 bg-gradient-to-b from-[#2b7fff] to-[#1a5bb8] text-white shadow-[0_0_10px_rgba(43,127,255,0.5)] border border-[#2b7fff]/40"
                        : "w-7 h-7 hover:bg-white/10 border border-transparent"
                )}
            >
                <CurrencyIcon currency="Bonus" className={playMode === 'Bonus' ? "w-3.5 h-3.5" : "w-4 h-4 opacity-40"} />
                {playMode === 'Bonus' && <span className="text-[10px] font-bold leading-none mt-px text-white">Bonus</span>}
            </div>
        </motion.div>
    );
}
