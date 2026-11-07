import { Table, TableSettings } from '../store/gameStore';
import { tablesDb, usersDb, delay, DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS } from './db';

export const hostTableApi = {
  async getTable(tableId: string): Promise<Table> {
    await delay(200);
    if (!tablesDb[tableId]) throw new Error("Table not found");
    return JSON.parse(JSON.stringify(tablesDb[tableId]));
  },

  async getAllTables(): Promise<Record<string, Table>> {
    await delay(300);
    return JSON.parse(JSON.stringify(tablesDb));
  },

  async createTable(userId: string, _userName: string, settings: TableSettings, liquidity: number): Promise<Table> {
    await delay();
    const trimmedName = typeof settings.name === 'string' ? settings.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Table Name is required.');
    }
    const rawCode = typeof settings.tableCode === 'string' ? settings.tableCode.trim() : '';
    if (rawCode.length > 0 && !/^\d{4}$/.test(rawCode)) {
      throw new Error('Code must be exactly 4 digits (0-9).');
    }
    const hasCode = /^\d{4}$/.test(rawCode);
    const normalizedSettings: TableSettings = {
      ...settings,
      name: trimmedName,
      description: '',
      tableCode: hasCode ? rawCode : undefined,
      hasTableCode: hasCode,
      isPublic: hasCode ? false : Boolean(settings.isPublic ?? true),
    };

    const now = Date.now();
    const maxHostingTimeMs = DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS;

    const tableId = `table_${Math.random().toString(36).substr(2, 9)}`;
    const newTable: Table = {
      id: tableId,
      name: trimmedName,
      description: '',
      houseId: userId,
      createdAt: now,
      visits: 0,
      liquidity,
      initialLiquidity: liquidity,
      safeAccountAddress: '',
      settings: normalizedSettings,
      seats: Array.from({ length: normalizedSettings.maxSeats }).map(() => ({ userId: null, isReady: false, hand: null })),
      userBalances: {},
      inviteLink: `/t/${tableId}`,
      status: 'waiting',
      dealerHand: null,
      deck: [],
      discardCount: 0,
      discardedCards: [],
      currentTurnIndex: -1,
      roundsPlayed: 0,
      emptySince: now,
      maxHostingTimeMs,
      expiresAt: now + maxHostingTimeMs
    };
    tablesDb[tableId] = newTable;
    return JSON.parse(JSON.stringify(newTable));
  },

  async closeTable(tableId: string, userId: string): Promise<{table: Table, returnedLiquidity: number}> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
      if (table.status === 'playing') {
          table.status = 'closing'; // close after the round
          return { table: JSON.parse(JSON.stringify(table)), returnedLiquidity: 0 };
      } else {
        // Refund any waiting tournament tickets if the tournament hasn't started yet
        if (table.settings.mode === 'tournament' && (table.roundsPlayed || 0) === 0 && table.userBalances) {
          for (const [uId, bal] of Object.entries(table.userBalances)) {
            const refund = bal.initialBuyIn || table.settings.tournament?.ticketPrice || 0;
            if (refund > 0 && usersDb[uId]) {
              usersDb[uId].balance += refund;
            }
          }
          table.userBalances = {};
        }
        table.seats = table.seats.map(s => ({ ...s, userId: null, hand: null, isReady: false }));
        table.status = 'closed';
        return { table: JSON.parse(JSON.stringify(table)), returnedLiquidity: table.liquidity };
      }
    }
    return { table: JSON.parse(JSON.stringify(table || {})) as Table, returnedLiquidity: 0 };
  },
  
  async pauseTable(tableId: string, userId: string): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
      table.status = 'paused';
    }
    return JSON.parse(JSON.stringify(table));
  },

  async recordVisit(tableId: string): Promise<void> {
    if (tablesDb[tableId]) {
      tablesDb[tableId].visits = (tablesDb[tableId].visits || 0) + 1;
    }
  },

  async resumeTable(tableId: string, userId: string): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
      table.status = 'waiting';
    }
    return JSON.parse(JSON.stringify(table));
  },
  
  async withdrawLiquidity(tableId: string, userId: string, amount: number): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
        if (amount > table.liquidity) return JSON.parse(JSON.stringify(table));
        table.liquidity -= amount;
        if (table.liquidity <= 0) table.status = 'paused';
    }
    return JSON.parse(JSON.stringify(table));
  },

  async updateTableSettings(tableId: string, userId: string, settings: Partial<TableSettings>): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
        table.settings = { ...table.settings, ...settings };
        if (settings.name) table.name = settings.name;
        if (settings.description !== undefined) table.description = settings.description;
    }
    return JSON.parse(JSON.stringify(table));
  },

  async depositLiquidity(tableId: string, userId: string, amount: number): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
      table.liquidity += amount;
      
      const req = table.settings.maxBet * table.settings.maxSeats;
      if (table.liquidity >= req && table.status === 'closed') {
        table.status = 'waiting';
      }
    }
    return JSON.parse(JSON.stringify(table));
  }
};
