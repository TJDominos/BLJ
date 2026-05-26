import { useEffect } from 'react';
import { Table } from '../store/gameStore';

export function useBotBehavior(
  table: Table | undefined | null, 
  hit: (tableId: string, seatIndex: number) => Promise<void>, 
  stand: (tableId: string, seatIndex: number) => Promise<void>
) {
  useEffect(() => {
    if (table?.status === 'playing' && table.currentTurnIndex >= 0) {
      const activeSeat = table.currentTurnIndex;
      const seat = table.seats[activeSeat];
      if (seat?.userId?.startsWith('bot_') && seat.hand?.status === 'playing') {
        const isInitialDeal = seat.hand?.cards?.length === 2;
        const delayMs = isInitialDeal ? Math.max(1500, table.seats.length * 300 + 1000) : 1500;
        
        const timer = setTimeout(() => {
          if (seat.hand!.score < 17) {
            hit(table.id, activeSeat);
          } else {
            stand(table.id, activeSeat);
          }
        }, delayMs);
        
        return () => clearTimeout(timer);
      }
    }
  }, [table?.status, table?.currentTurnIndex, table?.seats, hit, stand, table?.id]);
}
