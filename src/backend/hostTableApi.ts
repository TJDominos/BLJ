import { Table, TableSettings } from '../store/gameStore';
import { tablesDb, delay } from './db';

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

  async createTable(userId: string, userName: string, settings: TableSettings, liquidity: number): Promise<Table> {
    await delay();
    const tableId = `table_${Math.random().toString(36).substr(2, 9)}`;
    const newTable: Table = {
      id: tableId,
      name: settings.name,
      description: settings.description,
      houseId: userId,
      createdAt: Date.now(),
      visits: 0,
      liquidity,
      initialLiquidity: liquidity,
      safeAccountAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      settings,
      seats: Array.from({ length: settings.maxSeats }).map(() => ({ userId: null, isReady: false, hand: null })),
      userBalances: {},
      inviteLink: `https://ais-pre.run.app/t/${tableId}`,
      status: 'waiting',
      dealerHand: null,
      deck: [],
      discardCount: 0,
      discardedCards: [],
      currentTurnIndex: -1,
      roundsPlayed: 0
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
