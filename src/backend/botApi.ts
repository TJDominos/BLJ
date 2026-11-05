import { Table } from '../store/gameStore';

export const botApi = {
  // Real multiplayer room mode: do not inject fake bot players into seats
  arrangeBots(table: Table) {
    table.seats.forEach((s) => {
      if (s.userId && s.userId.startsWith('bot_')) {
        s.userId = null;
        s.isReady = false;
        s.hand = null;
      }
    });
  },

  handleRoundEnd(_table: Table) {
    // No-op: only real human players participate in rounds
  }
};
