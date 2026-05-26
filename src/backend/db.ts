import { Table } from '../store/gameStore';
import { systemConfig } from '../config/systemConfig';

// In-memory mock database representing the Canister State
export const tablesDb: Record<string, Table> = {
  // Keep the same default system table
  'table_1': {
    id: 'table_1',
    name: 'System Table',
    houseId: 'system',
    createdAt: Date.now() - 100000000,
    visits: 0,
    roundsPlayed: 0,
    liquidity: 100000,
    initialLiquidity: 100000,
    safeAccountAddress: '0x1234...5678',
    settings: {
      minBet: 10,
      maxBet: 500,
      minBuyIn: 50,
      secretBets: false,
      actionTimeLimit: systemConfig.actionTimeLimit.normal,
      isPublic: true,
      maxSeats: 7,
      winningRule: 'standard',
      order: 'seat'
    },
    seats: [
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null }
    ],
    userBalances: {},
    inviteLink: 'https://ais-pre.run.app/t/table_1',
    status: 'waiting',
    dealerHand: null,
    deck: [],
    discardCount: 0,
    discardedCards: [],
    currentTurnIndex: -1
  }
};

export const userBalances: Record<string, number> = {};

// Delay to simulate IC Canister consensus
export const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));
