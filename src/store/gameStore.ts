import { create } from 'zustand';

export type User = {
  id: string;
  name: string;
  balance: number;
};

export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface PlayingCard {
  suit: CardSuit;
  value: CardValue;
  isHidden?: boolean;
}

export interface SideBets {
  pair: number;
  twentyOnePlusThree: number;
}

export type HandStatus = 'playing' | 'stood' | 'busted' | 'blackjack' | 'won' | 'lost' | 'push';

export interface Hand {
  cards: PlayingCard[];
  bet: number;
  insuranceBet?: number;
  sideBets?: SideBets;
  status: HandStatus;
  score: number;
}

export interface PlayerSeat {
  userId: string | null; // null if empty
  isReady: boolean;
  hand: Hand | null;
  isSplitHand?: boolean;
  originalSeatIndex?: number;
}

export type WinningRule = 'standard' | 'dealer_wins_ties';

export interface TableSettings {
  minBet: number;
  maxBet: number;
  secretBets: boolean;
  actionTimeLimit: number;
  isPublic: boolean;
  maxSeats: number;
  winningRule: WinningRule;
  order: 'seat' | 'random';
}

export interface Table {
  id: string;
  name: string;
  houseId: string; // The user hosting the table (or "system" if auto)
  liquidity: number;
  initialLiquidity: number;
  safeAccountAddress: string;
  settings: TableSettings;
  seats: PlayerSeat[]; // array matching maxSeats
  inviteLink: string;
  status: 'waiting' | 'playing' | 'paused' | 'closed'; // paused if lack of liquidity
  dealerHand: Hand | null;
  deck: PlayingCard[];
  discardCount: number;
  discardedCards: PlayingCard[];
  currentTurnIndex: number; // -1 for dealer, 0..maxSeats-1 for players
}

export interface SeatResult {
  seatIndex: number;
  bet: number;
  net: number;
  action: string;
}

export interface GameRecord {
  id: string;
  tableId: string;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  amountWon: number;
  timestamp: number;
  seatResults: SeatResult[];
}

interface GameStore {
  currentUser: User | null;
  tables: Record<string, Table>;
  activeTableId: string | null;
  gameRecords: GameRecord[];
  
  // Actions
  login: (name: string) => void;
  createTable: (settings: TableSettings, liquidity: number) => Promise<string>;
  joinTable: (tableId: string, seatIndex: number) => Promise<void>;
  leaveTable: (tableId: string) => Promise<void>;
  placeBet: (tableId: string, seatIndex: number, amount: number, sideBets?: SideBets) => Promise<void>;
  closeTable: (tableId: string) => Promise<void>;
  
  // Gameplay Actions (House & Players)
  startGame: (tableId: string) => Promise<void>;
  hit: (tableId: string, seatIndex: number) => Promise<void>;
  stand: (tableId: string, seatIndex: number) => Promise<void>;
  doubleDown: (tableId: string, seatIndex: number) => Promise<void>;
  split: (tableId: string, seatIndex: number) => Promise<void>;
  buyInsurance: (tableId: string, seatIndex: number) => Promise<void>;
  dealerPlay: (tableId: string) => Promise<void>;
  resolveGame: (tableId: string) => Promise<void>;
  addGameRecord: (record: GameRecord) => void;
}

const generateDeck = (): PlayingCard[] => {
  const suits: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: PlayingCard[] = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  // Shuffle
  return deck.sort(() => Math.random() - 0.5);
};

const calculateScore = (cards: PlayingCard[]): number => {
  let score = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.isHidden) continue;
    if (c.value === 'A') {
      aces += 1;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(c.value)) {
      score += 10;
    } else {
      score += parseInt(c.value);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
};

export const useGameStore = create<GameStore>((set, get) => ({
  currentUser: null,
  tables: {
    // some default table
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
        secretBets: false,
        actionTimeLimit: 30,
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
      inviteLink: 'https://ais-pre.run.app/t/table_1',
      status: 'waiting',
      dealerHand: null,
      deck: [],
      discardCount: 0,
      discardedCards: [],
      currentTurnIndex: -1
    }
  },
  activeTableId: null,
  gameRecords: [],

  login: (name: string) => {
    set({ currentUser: { id: `user_${Math.random().toString(36).substr(2, 9)}`, name, balance: 50000 } });
  },

  createTable: async (settings, liquidity) => {
    const user = get().currentUser;
    if (!user) return '';
    
    // Deduct liquidity locally for immediate feedback
    set((state) => ({
      currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - liquidity }
    }));
    
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.createTable(user.id, user.name, settings, liquidity);
    
    set((state) => ({
      tables: { ...state.tables, [table.id]: table },
      activeTableId: table.id
    }));
    return table.id;
  },

  joinTable: async (tableId, seatIndex) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.joinTable(tableId, user.id, seatIndex);

    set((state) => ({ tables: { ...state.tables, [tableId]: table }, activeTableId: tableId }));
  },

  leaveTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.leaveTable(tableId, user.id);

    set((state) => ({ tables: { ...state.tables, [tableId]: table }, activeTableId: null }));
  },

  placeBet: async (tableId, seatIndex, amount, sideBets) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const { table, deducted } = await gameApi.placeBet(tableId, seatIndex, user.id, amount, sideBets);
    
    set((state) => ({
      currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - deducted },
      tables: { ...state.tables, [tableId]: table }
    }));
  },

  startGame: async (tableId) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.startGame(tableId);
    
    set((state) => ({
      tables: { ...state.tables, [tableId]: table }
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  hit: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.hit(tableId, seatIndex);
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
       get().dealerPlay(tableId);
    }
  },

  stand: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.stand(tableId, seatIndex);
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  doubleDown: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    
    const user = get().currentUser;
    const initialTable = get().tables[tableId];
    if (user && initialTable) {
       const initialBet = initialTable.seats[seatIndex].hand?.bet || 0;
       set(state => ({ currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - initialBet } }));
    }

    const table = await gameApi.doubleDown(tableId, seatIndex);
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  split: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    
    const user = get().currentUser;
    const initialTable = get().tables[tableId];
    if (user && initialTable) {
       const initialBet = initialTable.seats[seatIndex].hand?.bet || 0;
       set(state => ({ currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - initialBet } }));
    }

    const table = await gameApi.split(tableId, seatIndex);
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  buyInsurance: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const user = get().currentUser;
    const initialTable = get().tables[tableId];
    if (user && initialTable) {
       const insuranceBet = (initialTable.seats[seatIndex].hand?.bet || 0) / 2;
       set(state => ({ currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - insuranceBet } }));
    }
    const table = await gameApi.buyInsurance(tableId, seatIndex);
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));
  },

  dealerPlay: async (tableId) => {
    const { gameApi } = await import('../backend/gameApi');
    const { table, winnings, seatResults } = await gameApi.dealerPlayAndResolve(tableId);
    
    set((state) => {
      const user = state.currentUser;
      const amountWon = user ? (winnings[user.id] || 0) : 0;
      
      let res: 'win' | 'lose' | 'push' | 'blackjack' = 'push';
      const mySeat = table.seats.find((s: any) => s.userId === user?.id);
      if (mySeat && mySeat.hand) {
         if (mySeat.hand.status === 'won') res = 'win';
         else if (mySeat.hand.status === 'lost') res = 'lose';
         else if (mySeat.hand.status === 'blackjack') res = 'blackjack';
         else res = 'push';
      }

      if (user && table.seats.some((s: any) => s.userId === user.id)) {
        const record: typeof state.gameRecords[0] = {
          id: Math.random().toString(36).substr(2, 9),
          tableId,
          result: res,
          amountWon,
          timestamp: Date.now(),
          seatResults: seatResults.filter((sr: any) => table.seats[sr.seatIndex]?.userId === user.id)
        };
        return {
          currentUser: { ...user, balance: user.balance + amountWon },
          tables: { ...state.tables, [tableId]: table },
          gameRecords: [record, ...state.gameRecords].slice(0, 50)
        };
      }

      return {
        currentUser: user ? { ...user, balance: user.balance + amountWon } : null,
        tables: { ...state.tables, [tableId]: table }
      };
    });
  },

  resolveGame: async (tableId) => {
    // Moved to dealerPlayAndResolve entirely
  },

  addGameRecord: (record) => {
    set((state) => ({ gameRecords: [record, ...state.gameRecords] }));
  },

  closeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.closeTable(tableId, user.id);
    
    set((state) => ({
      currentUser: { ...user, balance: user.balance + table.liquidity }, // Should ideally return delta from API
      tables: { ...state.tables, [tableId]: table },
      activeTableId: state.activeTableId === tableId ? null : state.activeTableId
    }));
  }
}));
