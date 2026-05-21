import { Table } from '../store/gameStore';

// In-memory mock database representing the Canister State
export const tablesDb: Record<string, Table> = {
  // Keep the same default system table
  'table_1': {
    id: 'table_1',
    name: 'System Table',
    houseId: 'system',
    liquidity: 100000,
    initialLiquidity: 100000,
    safeAccountAddress: '0x1234...5678',
    settings: {
      minBet: 10,
      maxBet: 500,
      minBuyIn: 50,
      secretBets: false,
      actionTimeLimit: 15,
      isPublic: true,
      maxSeats: 7,
      winningRule: 'standard',
      order: 'seat'
    },
    seats: [
      { userId: null, isReady: false, hand: null },
      { userId: null, isReady: false, hand: null },
      { userId: 'bot_3', isReady: true, hand: { cards: [], bet: 100, sideBets: { pair: 0, twentyOnePlusThree: 0 }, status: 'playing', score: 0 } },
      { userId: null, isReady: false, hand: null },
      { userId: 'bot_2', isReady: true, hand: { cards: [], bet: 50, sideBets: { pair: 0, twentyOnePlusThree: 0 }, status: 'playing', score: 0 } },
      { userId: null, isReady: false, hand: null },
      { userId: 'bot_1', isReady: true, hand: { cards: [], bet: 25, sideBets: { pair: 0, twentyOnePlusThree: 0 }, status: 'playing', score: 0 } }
    ],
    userBalances: {
      'bot_1': { balance: 1000, initialBuyIn: 1000 },
      'bot_2': { balance: 500, initialBuyIn: 500 },
      'bot_3': { balance: 2000, initialBuyIn: 2000 },
    },
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
