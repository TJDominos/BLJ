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
      name: `${userName}'s Table`,
      houseId: userId,
      liquidity,
      initialLiquidity: liquidity,
      safeAccountAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      settings,
      seats: Array.from({ length: settings.maxSeats }).map(() => ({ userId: null, isReady: false, hand: null })),
      inviteLink: `https://ais-pre.run.app/t/${tableId}`,
      status: 'waiting',
      dealerHand: null,
      deck: [],
      discardCount: 0,
      discardedCards: [],
      currentTurnIndex: -1
    };
    tablesDb[tableId] = newTable;
    return JSON.parse(JSON.stringify(newTable));
  },

  async closeTable(tableId: string, userId: string): Promise<Table> {
    await delay();
    const table = tablesDb[tableId];
    if (table && table.houseId === userId) {
      table.status = 'closed';
      table.liquidity = 0;
    }
    return JSON.parse(JSON.stringify(table));
  }
};
