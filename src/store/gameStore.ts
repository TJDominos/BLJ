import { create } from 'zustand';
import { systemConfig } from '../config/systemConfig';

export type User = {
  id: string;
  name: string;
  balance: number;
  bonusBalance?: number;
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
  sideBetPairWon?: number;
  sideBetPlus3Won?: number;
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

export type TableMode = 'regular' | 'tournament';

export interface TournamentSettings {
  ticketPrice: number;
  startingChips: number;
  hostFeePct: number; // max 5, default 3
  platformFeePct: number; // fixed 2
  minBetChips: number; // default 50
  minSideBetChips?: number;
  isForcedAnte?: boolean;
  isScheduledEscalation?: boolean;
  antePct?: number; 
  escalationRounds?: number;
  isSurvivorCap?: boolean;
  targetSurvivors?: number;
  isHardCapRounds?: boolean;
  maxRounds?: number;
  prizeDistribution: 'survivorPaytable' | 'splitByChips';
  minSeats?: number;
  autoCloseAndRefundTimeHours?: number;
}

export interface TableSettings {
  name?: string;
  description?: string;
  mode?: TableMode;
  tournament?: TournamentSettings;
  minBet: number;
  maxBet: number;
  minBuyIn: number;
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
  description?: string;
  houseId: string; // The user hosting the table (or "system" if auto)
  createdAt: number;
  visits: number;
  liquidity: number;
  initialLiquidity: number;
  safeAccountAddress: string;
  settings: TableSettings;
  seats: PlayerSeat[]; // array matching maxSeats
  userBalances: Record<string, { balance: number, initialBuyIn: number, currency?: 'Gcoin' | 'Bonus' }>;
  inviteLink: string;
  status: 'waiting' | 'playing' | 'paused' | 'closed' | 'closing'; // paused if lack of liquidity
  dealerHand: Hand | null;
  deck: PlayingCard[];
  discardCount: number;
  discardedCards: PlayingCard[];
  currentTurnIndex: number; // -1 for dealer, 0..maxSeats-1 for players
  roundsPlayed: number;
}

export interface SeatResult {
  seatIndex: number;
  userId?: string;
  bet: number;
  sideBet?: number;
  sideBetWin?: number;
  insuranceBet?: number;
  insuranceWin?: number;
  isSplit?: boolean;
  win?: number;
  net: number;
  action: string;
  score?: number;
}

export interface GameRecord {
  id: string;
  tableId: string;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  amountWon: number;
  timestamp: number;
  seatResults: SeatResult[];
  dealerScore?: number;
  currency?: 'Gcoin' | 'Bonus';
}

interface GameStore {
  currentUser: User | null;
  tables: Record<string, Table>;
  activeTableId: string | null;
  gameRecords: GameRecord[];
  
  // Actions
  login: (name: string) => void;
  createTable: (settings: TableSettings, liquidity: number) => Promise<string>;
  updateTableSettings: (tableId: string, settings: Partial<TableSettings>) => Promise<void>;
  depositLiquidity: (tableId: string, amount: number) => Promise<void>;
  pauseTable: (tableId: string) => Promise<void>;
  resumeTable: (tableId: string) => Promise<void>;
  withdrawLiquidity: (tableId: string, amount: number) => Promise<void>;
  joinTable: (tableId: string, seatIndex: number, currency?: 'Gcoin' | 'Bonus') => Promise<void>;
  observeTable: (tableId: string) => void;
  recordVisit: (tableId: string) => Promise<void>;
  leaveTable: (tableId: string, seatIndex?: number, isTimeout?: boolean) => Promise<void>;
  unlockTableBalance: (tableId: string) => Promise<void>;
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
      createdAt: Date.now(),
      visits: 0,
      houseId: 'system',
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
      currentTurnIndex: -1,
      roundsPlayed: 0
    }
  },
  activeTableId: null,
  gameRecords: [],

  login: (name: string) => {
    set({ currentUser: { id: `user_${Math.random().toString(36).substr(2, 9)}`, name, balance: 50000, bonusBalance: 10000 } });
  },

  createTable: async (settings, liquidity) => {
    const user = get().currentUser;
    if (!user) return '';
    
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.createTable(user.id, user.name, settings, liquidity);
    
    set((state) => ({
      tables: { ...state.tables, [table.id]: table },
      activeTableId: table.id
    }));
    return table.id;
  },

  updateTableSettings: async (tableId, settings) => {
    const user = get().currentUser;
    if (!user) return;
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.updateTableSettings(tableId, user.id, settings);
    set((state) => ({
      tables: { ...state.tables, [table.id]: table }
    }));
  },

  depositLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user) return;
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.depositLiquidity(tableId, user.id, amount);
    set((state) => ({
      tables: { ...state.tables, [table.id]: table }
    }));
  },

  pauseTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.pauseTable(tableId, user.id);
    set((state) => ({
      tables: { ...state.tables, [table.id]: table }
    }));
  },

  resumeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.resumeTable(tableId, user.id);
    set((state) => ({
      tables: { ...state.tables, [table.id]: table }
    }));
  },

  withdrawLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user) return;
    if (amount <= 0) return;
    const { hostTableApi } = await import('../backend/hostTableApi');
    const table = await hostTableApi.withdrawLiquidity(tableId, user.id, amount);
    set((state) => ({
      tables: { ...state.tables, [table.id]: table }
    }));
  },

  joinTable: async (tableId, seatIndex, currency = 'Gcoin') => {
    const user = get().currentUser;
    if (!user) return;
    
    // Check if user is already seated with balance at another table
    const currentActiveId = get().activeTableId;
    if (currentActiveId && currentActiveId !== tableId) {
      const activeTable = get().tables[currentActiveId];
      if (activeTable?.userBalances?.[user.id] && activeTable.userBalances[user.id].balance > 0) {
        if (!confirm(`You have locked balance on ${activeTable.name}. Switch anyway?`)) {
          return;
        }
      }
    }
    
    const tableData = get().tables[tableId];
    if (!tableData) return;
    
    const existingBal = tableData.userBalances[user.id]?.balance || 0;
    let lockAmount = 0;
    
    if (tableData.settings.mode === 'tournament') {
       if (existingBal === 0) {
          lockAmount = tableData.settings.tournament?.ticketPrice || 0;
          if (user.balance < lockAmount) {
             console.error("Insufficient balance for tournament ticket");
             return;
          }
       }
    } else {
       lockAmount = tableData.settings.minBuyIn;
       const availableBalance = currency === 'Bonus' ? (user.bonusBalance || 0) : user.balance;
       if (availableBalance < lockAmount) {
          alert(`Insufficient ${currency} balance.`);
          return;
       }
    }
    
    // Optimistic deduce
    if (lockAmount > 0) {
      if (currency === 'Bonus') {
        set(state => ({ currentUser: { ...state.currentUser!, bonusBalance: (state.currentUser!.bonusBalance || 0) - lockAmount } }));
      } else {
        set(state => ({ currentUser: { ...state.currentUser!, balance: state.currentUser!.balance - lockAmount } }));
      }
    }

    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.joinTable(tableId, user.id, seatIndex, lockAmount, currency);

    if (currentActiveId !== tableId) {
      // Async so we don't await
      get().recordVisit(tableId);
    }

    set((state) => ({ tables: { ...state.tables, [tableId]: table }, activeTableId: tableId }));
  },

  observeTable: (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const currentActiveId = get().activeTableId;
    if (currentActiveId && currentActiveId !== tableId) {
      const activeTable = get().tables[currentActiveId];
      if (activeTable?.userBalances?.[user.id] && activeTable.userBalances[user.id].balance > 0) {
        if (!confirm(`You have locked balance on ${activeTable.name}. Unlock or switch anyway?`)) {
          return;
        }
      }
    }
    if (currentActiveId !== tableId) {
      get().recordVisit(tableId);
    }
    set({ activeTableId: tableId });
  },

  recordVisit: async (tableId) => {
    const { hostTableApi } = await import('../backend/hostTableApi');
    await hostTableApi.recordVisit(tableId);
    // Ideally we fetch the table to update it visually, but since we have periodic refresh or other means, it's fine.
    // Or we can increment locally:
    set(state => {
      if (state.tables[tableId]) {
        return {
          tables: {
            ...state.tables,
            [tableId]: { ...state.tables[tableId], visits: (state.tables[tableId].visits || 0) + 1 }
          }
        };
      }
      return {};
    });
  },

  leaveTable: async (tableId, seatIndex, isTimeout) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const { table } = await gameApi.leaveTable(tableId, user.id, seatIndex, isTimeout);

    set((state) => ({ 
      tables: { ...state.tables, [tableId]: table }, 
      activeTableId: seatIndex === undefined ? null : state.activeTableId 
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  unlockTableBalance: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const { table, refundedAmount, currency } = await gameApi.unlockTableBalance(tableId, user.id);

    set((state) => {
      if (currency === 'Bonus') {
        return {
          currentUser: { ...state.currentUser!, bonusBalance: (state.currentUser!.bonusBalance || 0) + refundedAmount },
          tables: { ...state.tables, [tableId]: table }
        };
      } else {
        return {
          currentUser: { ...state.currentUser!, balance: state.currentUser!.balance + refundedAmount },
          tables: { ...state.tables, [tableId]: table }
        };
      }
    });

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  placeBet: async (tableId, seatIndex, amount, sideBets) => {
    const user = get().currentUser;
    if (!user) return;
    
    const { gameApi } = await import('../backend/gameApi');
    const { table, deducted } = await gameApi.placeBet(tableId, seatIndex, user.id, amount, sideBets);
    
    set((state) => ({
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
      const activeSeatsCount = table.seats.filter(s => s.isReady).length;
      setTimeout(() => {
        get().dealerPlay(tableId);
      }, (activeSeatsCount + 1) * 400 + 500);
    }
  },

  hit: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.hit(tableId, seatIndex, (interimTable) => {
      set((state) => ({ tables: { ...state.tables, [tableId]: interimTable } }));
    });
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
       get().dealerPlay(tableId);
    }
  },

  stand: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.stand(tableId, seatIndex, (interimTable) => {
      set((state) => ({ tables: { ...state.tables, [tableId]: interimTable } }));
    });
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  doubleDown: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    
    const table = await gameApi.doubleDown(tableId, seatIndex, (interimTable) => {
      set((state) => ({ tables: { ...state.tables, [tableId]: interimTable } }));
    });
    
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  split: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    
    const table = await gameApi.split(tableId, seatIndex);
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  buyInsurance: async (tableId, seatIndex) => {
    const { gameApi } = await import('../backend/gameApi');
    const table = await gameApi.buyInsurance(tableId, seatIndex);
    set((state) => ({ tables: { ...state.tables, [tableId]: table } }));
  },

  dealerPlay: async (tableId) => {
    const { gameApi } = await import('../backend/gameApi');
    const { table, winnings, seatResults, returnedLiquidity, dealerScore } = await gameApi.dealerPlayAndResolve(tableId);
    
    set((state) => {
      let user = state.currentUser;
      const amountWon = user ? (winnings[user.id] || 0) : 0;
      
      let res: 'win' | 'lose' | 'push' | 'blackjack' = 'push';
      const mySeat = table.seats.find((s: any) => s.userId === user?.id);
      if (mySeat && mySeat.hand) {
         if (mySeat.hand.status === 'won') res = 'win';
         else if (mySeat.hand.status === 'lost') res = 'lose';
         else if (mySeat.hand.status === 'blackjack') res = 'blackjack';
         else res = 'push';
      }

      const mySeatResults = user ? seatResults.filter(sr => sr.userId === user.id) : [];

      // Refund locked balance if table became officially closed during this round's resolution
      if (table.status === 'closed' && user) {
        const myLockedItem = table.userBalances?.[user.id] || null;
        if (myLockedItem && myLockedItem.balance > 0) {
           if (myLockedItem.currency === 'Bonus') {
             user = { ...user, bonusBalance: (user.bonusBalance || 0) + myLockedItem.balance };
           } else {
             user = { ...user, balance: user.balance + myLockedItem.balance };
           }
        }
        table.userBalances = {}; // Free all players
      }

      if (user && mySeatResults.length > 0) {
        let recCurrency: 'Gcoin' | 'Bonus' | undefined = undefined;
        // In case it's closed and cleared, we use state table
        const balRecord = state.tables[tableId]?.userBalances?.[user.id] || table.userBalances?.[user.id];
        if (balRecord) {
           recCurrency = balRecord.currency || 'Gcoin';
        }
        
        const record: typeof state.gameRecords[0] = {
          id: Math.random().toString(36).substr(2, 9),
          tableId,
          result: res,
          amountWon,
          timestamp: Date.now(),
          seatResults: mySeatResults,
          dealerScore,
          currency: recCurrency
        };
        return {
          currentUser: user,
          tables: { ...state.tables, [tableId]: table },
          gameRecords: [record, ...state.gameRecords].slice(0, 50),
          activeTableId: state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId
        };
      }

      return {
        currentUser: user,
        tables: { ...state.tables, [tableId]: table },
        activeTableId: state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId
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
    const { table } = await hostTableApi.closeTable(tableId, user.id);
    
    set((state) => {
      let updatedUser = { ...state.currentUser! };
      const updatedTable = { ...table };
      
      if (updatedTable.status === 'closed') {
        const myBalRecord = updatedTable.userBalances?.[updatedUser.id] || null;
        if (myBalRecord && myBalRecord.balance > 0) {
           if (myBalRecord.currency === 'Bonus') {
               updatedUser.bonusBalance = (updatedUser.bonusBalance || 0) + myBalRecord.balance;
           } else {
               updatedUser.balance += myBalRecord.balance;
           }
        }
        updatedTable.userBalances = {};
      }

      return {
        currentUser: updatedUser,
        tables: { ...state.tables, [tableId]: updatedTable },
        activeTableId: state.activeTableId === tableId && updatedTable.status === 'closed' ? null : state.activeTableId
      };
    });
  }
}));
