import { Table, User } from '../store/gameStore';
import { systemConfig } from '../config/systemConfig';

export const DEFAULT_GAME_COINS = 5000;
export const DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS = 5 * 60 * 1000; // 5 minutes default max idle hosting time

export function createSystemTable(tableNumber: number): Table {
  const id = `table_${tableNumber}`;
  const name = `Table #${tableNumber}`;
  return {
    id,
    name,
    description: '',
    houseId: 'system',
    createdAt: Date.now(),
    visits: 0,
    roundsPlayed: 0,
    liquidity: 100000,
    initialLiquidity: 100000,
    safeAccountAddress: '',
    settings: {
      name,
      description: '',
      mode: 'regular',
      minBet: 10,
      maxBet: 500,
      minBuyIn: 1000,
      secretBets: false,
      actionTimeLimit: systemConfig.actionTimeLimit.normal,
      isPublic: true,
      maxSeats: 7,
      winningRule: 'standard',
      order: 'seat'
    },
    seats: Array.from({ length: 7 }, () => ({
      userId: null,
      isReady: false,
      hand: null
    })),
    userBalances: {},
    inviteLink: `/t/${id}`,
    status: 'waiting',
    dealerHand: null,
    deck: [],
    discardCount: 0,
    discardedCards: [],
    currentTurnIndex: -1
  };
}

// Authoritative Server-Side Game Room Store
export const tablesDb: Record<string, Table> = {
  table_1: createSystemTable(1)
};

// Authoritative Server-Side House Token & User Statistics Tracker
export interface HouseTokenStats {
  totalTokensIssuedByHouse: number;
  totalTokensPaidOutToPlayers: number;
  totalRefillsCount: number;
}

const INITIAL_BASE_USERS: Array<{ id: string; name: string; balance: number }> = [
  { id: 'player_system_demo', name: 'Player', balance: 5000 },
  { id: 'usr_sarah_v', name: 'Sarah Connor', balance: 8400 },
  { id: 'usr_michael_b', name: 'Michael B.', balance: 12500 },
  { id: 'usr_elena_r', name: 'Elena Rostova', balance: 6200 },
  { id: 'usr_kenji_t', name: 'Kenji Takahashi', balance: 9100 },
  { id: 'usr_david_k', name: 'David Kim', balance: 4800 },
  { id: 'usr_amira_s', name: 'Amira Said', balance: 15400 },
  { id: 'usr_lucas_m', name: 'Lucas Silva', balance: 7300 },
  { id: 'usr_chloe_d', name: 'Chloe Dubois', balance: 11000 },
  { id: 'usr_oliver_w', name: 'Oliver Wright', balance: 5500 },
  { id: 'usr_zhao_l', name: 'Zhao Lei', balance: 18200 },
  { id: 'usr_hanna_m', name: 'Hanna Mueller', balance: 6700 },
  { id: 'usr_marcus_a', name: 'Marcus Aurelius', balance: 22000 },
];

// Authoritative Server-Side User & Game Coin Wallet Store
export const usersDb: Record<string, User> = {};

// Initialize base registered users
for (const u of INITIAL_BASE_USERS) {
  usersDb[u.id] = {
    id: u.id,
    name: u.name,
    balance: u.balance,
    bonusBalance: 0,
    role: 'player',
    isCreator: false,
  };
}

export const houseStats: HouseTokenStats = {
  totalTokensIssuedByHouse: INITIAL_BASE_USERS.length * DEFAULT_GAME_COINS, // 13 * 5,000 = 65,000
  totalTokensPaidOutToPlayers: 38400, // baseline winnings paid out to players across historical hands
  totalRefillsCount: 6,
};

/**
 * Backend-only user creation and lookup.
 * New users are granted DEFAULT_GAME_COINS (5,000) strictly by the backend.
 */
export function getOrCreateUser(
  userId: string,
  name: string = 'Player',
  isCreatorOrPublisher: boolean = false,
  avatar?: string
): User {
  if (!usersDb[userId]) {
    usersDb[userId] = {
      id: userId,
      name: name || 'Player',
      avatar,
      balance: DEFAULT_GAME_COINS,
      bonusBalance: 0,
      role: isCreatorOrPublisher ? 'creator' : 'player',
      isCreator: isCreatorOrPublisher
    };
    houseStats.totalTokensIssuedByHouse += DEFAULT_GAME_COINS;
  } else {
    if (name && name !== 'Player') {
      usersDb[userId].name = name;
    }
    if (avatar) {
      usersDb[userId].avatar = avatar;
    }
    if (isCreatorOrPublisher) {
      usersDb[userId].role = 'creator';
      usersDb[userId].isCreator = true;
    }
    // Sync updated name & avatar to any seats currently occupied by this user
    for (const table of Object.values(tablesDb)) {
      for (const seat of table.seats) {
        if (seat.userId === userId) {
          seat.name = usersDb[userId].name;
          if (usersDb[userId].avatar) {
            seat.avatar = usersDb[userId].avatar;
          }
        }
      }
    }
  }
  return JSON.parse(JSON.stringify(usersDb[userId]));
}

/**
 * Syncs a user's wallet balance with their regular table balance on the backend.
 */
export function syncRegularUserBalance(userId: string, newBalance: number): User {
  getOrCreateUser(userId);
  const clamped = Math.max(0, Math.round(newBalance * 100) / 100);
  usersDb[userId].balance = clamped;

  // Keep any active regular table balance in sync with the user's Game Coins wallet
  // (Tournament tables use an equal locked Tournament Allowance and are isolated)
  for (const table of Object.values(tablesDb)) {
    if (table.settings.mode !== 'tournament' && table.userBalances[userId]) {
      table.userBalances[userId].balance = clamped;
    }
  }
  return JSON.parse(JSON.stringify(usersDb[userId]));
}

/**
 * Backend-authoritative 5,000 Game Coins refill.
 * Rejects the request if the player still has enough coins or has an active hand in progress,
 * and never modifies a player's locked Tournament Allowance once seated in a tournament.
 */
export function claimServerRefill(userId: string, tableId?: string): { user: User; table?: Table } {
  getOrCreateUser(userId);
  const targetTable = tableId ? tablesDb[tableId] : undefined;

  // Check if user has an active bet/hand on any table
  for (const t of Object.values(tablesDb)) {
    const hasActiveBet = t.seats.some(
      (s) => s.userId === userId && s.hand && s.hand.bet > 0 && t.status === 'playing'
    );
    if (hasActiveBet) {
      throw new Error('Cannot claim Game Coins refill while a hand is currently in play.');
    }
  }

  const isTargetTournament = targetTable?.settings.mode === 'tournament';
  if (isTargetTournament && targetTable?.seats.some((s) => s.userId === userId)) {
    throw new Error('Cannot refill locked Tournament Allowance once seated in a tournament.');
  }

  const minThreshold = targetTable
    ? (isTargetTournament
        ? (targetTable.settings.tournament?.ticketPrice || 100)
        : targetTable.settings.minBet)
    : 10;

  const currentTableBal =
    targetTable && !isTargetTournament ? targetTable.userBalances[userId]?.balance : undefined;
  const effectiveBalance = currentTableBal !== undefined ? currentTableBal : usersDb[userId].balance;

  if (effectiveBalance >= minThreshold) {
    throw new Error(`Refill denied by server: You still have ${effectiveBalance} Game Coins.`);
  }

  usersDb[userId].balance = DEFAULT_GAME_COINS;
  houseStats.totalRefillsCount += 1;
  houseStats.totalTokensIssuedByHouse += DEFAULT_GAME_COINS;

  for (const t of Object.values(tablesDb)) {
    if (t.settings.mode !== 'tournament' && t.userBalances[userId]) {
      t.userBalances[userId].balance = DEFAULT_GAME_COINS;
      t.userBalances[userId].initialBuyIn += DEFAULT_GAME_COINS;
    }
  }

  if (targetTable && !isTargetTournament && !targetTable.userBalances[userId]) {
    targetTable.userBalances[userId] = {
      balance: DEFAULT_GAME_COINS,
      initialBuyIn: DEFAULT_GAME_COINS,
      currency: 'Gcoin'
    };
  }

  return {
    user: JSON.parse(JSON.stringify(usersDb[userId])),
    table: targetTable ? JSON.parse(JSON.stringify(targetTable)) : undefined
  };
}

/**
 * Room lifecycle reconciliation (following @randseed/server-sdk persistentTable room lifecycle):
 * 1. System tables auto-scale: always keep >= 1 open system table; open new table when all are full; close extra empty waiting system tables.
 * 2. Custom tables remain live when players leave so players can sit, leave, and return as long as the table is live.
 *    If there are remaining human players seated, emptySince/expiresAt are cleared.
 *    If there are no human players seated, track emptySince + maxHostingTimeMs; once maxHostingTimeMs expires with 0 players, close the custom table and refund any waiting tournament entries.
 */
export function reconcileSystemTables(): Record<string, Table> {
  const now = Date.now();

  // Reconcile custom table room lifecycle (max hosting time when no players are seated)
  for (const table of Object.values(tablesDb)) {
    if (table.houseId === 'system' || table.status === 'closed') continue;

    const hasSeatedHumanPlayer = table.seats.some(
      (s) => s.userId !== null && !s.userId.startsWith('bot_')
    );
    const maxHostingTimeMs =
      table.maxHostingTimeMs || DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS;

    table.maxHostingTimeMs = maxHostingTimeMs;

    if (hasSeatedHumanPlayer || table.status === 'playing') {
      table.emptySince = null;
      table.expiresAt = null;
    } else {
      if (!table.emptySince) {
        table.emptySince = now;
      }
      table.expiresAt = table.emptySince + maxHostingTimeMs;

      if (now >= table.expiresAt) {
        // Max hosting time with 0 players has ended -> close the room and refund any waiting tournament entries
        if (table.settings.mode === 'tournament' && (table.roundsPlayed || 0) === 0 && table.userBalances) {
          for (const [uId, bal] of Object.entries(table.userBalances)) {
            const refund = bal.initialBuyIn || table.settings.tournament?.ticketPrice || 0;
            if (refund > 0 && usersDb[uId]) {
              usersDb[uId].balance += refund;
            }
          }
          table.userBalances = {};
        }
        table.seats = table.seats.map((s) => ({ ...s, userId: null, hand: null, isReady: false }));
        table.status = 'closed';
      }
    }
  }

  const getSystemTables = () =>
    Object.values(tablesDb)
      .filter((t) => t.houseId === 'system' && t.status !== 'closed')
      .sort((a, b) => a.createdAt - b.createdAt);

  let sysTables = getSystemTables();

  // 1. Ensure at least 1 system table exists
  if (sysTables.length === 0) {
    tablesDb['table_1'] = createSystemTable(1);
    sysTables = getSystemTables();
  }

  // Ensure every system table has a valid seats array matching maxSeats (7)
  for (const t of sysTables) {
    const maxSeats = t.settings?.maxSeats || 7;
    if (!Array.isArray(t.seats) || t.seats.length === 0) {
      t.seats = Array.from({ length: maxSeats }, () => ({
        userId: null,
        isReady: false,
        hand: null,
      }));
    }
  }

  // 2. Close extra empty system tables (keep at least 1 system table)
  if (sysTables.length > 1) {
    const emptyWaitingTables = sysTables.filter(
      (t) => t.status === 'waiting' && t.seats.every((s) => !s?.userId)
    );

    const tablesToKeepCount = sysTables.length - emptyWaitingTables.length;
    const removableTables =
      tablesToKeepCount >= 1 ? emptyWaitingTables : emptyWaitingTables.slice(1);

    for (const emptyTable of removableTables) {
      delete tablesDb[emptyTable.id];
    }
    sysTables = getSystemTables();
  }

  // 3. If every active system table is full (0 empty seats), automatically open a new system table
  const hasAvailableSeat = sysTables.some(
    (t) => t.seats.length > 0 && t.seats.some((s) => !s?.userId)
  );

  if (!hasAvailableSeat) {
    let nextNum = 1;
    while (tablesDb[`table_${nextNum}`]) {
      nextNum++;
    }
    tablesDb[`table_${nextNum}`] = createSystemTable(nextNum);
  }

  return tablesDb;
}

export const userBalances: Record<string, number> = {};

export const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

