import React from 'react';
import { useUIStore, selectPlayMode } from '../store/uiStore';
import { cn } from '../lib/utils';
import { Gift } from 'lucide-react';
import { motion, PanInfo } from 'motion/react';

export function PlayModeToggle({ disabled }: { disabled?: boolean }) {
    const playMode = useUIStore(selectPlayMode);
    const setPlayMode = useUIStore(state => state.setPlayMode);

    const toggleMode = () => {
        if (disabled) return;
        setPlayMode(playMode === 'Gcoin' ? 'Bonus' : 'Gcoin');
    };

    const handleDragEnd = (event: any, info: PanInfo) => {
        if (disabled) return;
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
                disabled && "opacity-50 pointer-events-none"
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
                <div className={cn("shrink-0 rounded-full border-[1.5px] border-[#8e6022] shadow-[0_1px_2px_rgba(0,0,0,0.4)] relative overflow-hidden", playMode === 'Gcoin' ? "w-3.5 h-3.5 bg-gradient-to-b from-[#ffeed2] to-[#ffc53d]" : "w-4 h-4 bg-gradient-to-b from-[#ffeed2] to-[#ffc53d]")}>
                   <div className="absolute top-0 right-0 w-1 h-1 bg-white/60 rounded-full blur-[0.5px]"></div>
                </div>
                {playMode === 'Gcoin' && <span className="text-[10px] font-bold leading-none mt-px">Gcoin</span>}
            </div>
            
            <div
                className={cn(
                    "flex items-center justify-center rounded-full transition-all overflow-hidden relative z-10 duration-300",
                    playMode === 'Bonus'
                        ? "px-2.5 py-1 gap-1.5 bg-gradient-to-b from-[#4f46e5] to-[#312e81] text-white shadow-[0_0_10px_rgba(79,70,229,0.5)] border border-indigo-400/40"
                        : "w-7 h-7 hover:bg-white/10 border border-transparent"
                )}
            >
                <Gift className={cn("shrink-0", playMode === 'Bonus' ? "w-3.5 h-3.5 text-indigo-200" : "w-4 h-4 text-white/40")} />
                {playMode === 'Bonus' && <span className="text-[10px] font-bold leading-none mt-px">Bonus</span>}
            </div>
        </motion.div>
    );
}
