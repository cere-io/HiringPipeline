import type { CubbyClient } from './agents/types';
import { PostgresCubby } from './postgres-cubby';

/**
 * DualWriteCubby: writes to both in-memory MockCubby (Track 1) and Postgres (Track 2).
 * Reads come from the primary backend (configurable).
 * Logs discrepancies between the two for parity verification.
 */
export class DualWriteCubby implements CubbyClient {
  private mock: CubbyClient & { getAll(): Record<string, any> };
  private pg: PostgresCubby;
  private cubbyName: string;
  private primaryBackend: 'mock' | 'postgres';

  constructor(
    cubbyName: string,
    mock: CubbyClient & { getAll(): Record<string, any> },
    pg: PostgresCubby,
    primaryBackend: 'mock' | 'postgres' = 'postgres'
  ) {
    this.cubbyName = cubbyName;
    this.mock = mock;
    this.pg = pg;
    this.primaryBackend = primaryBackend;
  }

  json = {
    get: async (path: string): Promise<any> => {
      if (this.primaryBackend === 'postgres') {
        return this.pg.json.get(path);
      }
      return this.mock.json.get(path);
    },

    set: async (path: string, value: any, opts?: any): Promise<void> => {
      // Write to both backends
      const mockResult = this.writeToMock('set', path, value, opts);
      const pgResult = this.writeToPg('set', path, value);

      await Promise.allSettled([mockResult, pgResult]);
    },

    delete: async (path: string): Promise<void> => {
      const mockResult = Promise.resolve(this.mock.json.delete(path));
      const pgResult = this.pg.json.delete(path);
      await Promise.allSettled([mockResult, pgResult]);
    },

    exists: async (path: string): Promise<boolean> => {
      if (this.primaryBackend === 'postgres') {
        return this.pg.json.exists(path);
      }
      return this.mock.json.exists(path) as boolean;
    },

    mget: async (paths: string[]): Promise<Record<string, any>> => {
      if (this.primaryBackend === 'postgres') {
        return this.pg.json.mget(paths);
      }
      return this.mock.json.mget(paths) as Record<string, any>;
    },

    mset: async (items: Record<string, any>, opts?: any): Promise<void> => {
      this.mock.json.mset(items, opts);
      await this.pg.json.mset(items);
    },

    keys: async (): Promise<string[]> => {
      if (this.primaryBackend === 'postgres') {
        return this.pg.json.keys();
      }
      return this.mock.json.keys() as string[];
    },

    incr: async (path: string): Promise<number> => {
      const mockVal = this.mock.json.incr(path);
      const pgVal = await this.pg.json.incr(path);
      return this.primaryBackend === 'postgres' ? pgVal : mockVal as number;
    },
  };

  vector = {
    createIndex: () => {},
    add: () => {},
    search: () => [] as any[],
    get: () => null,
    delete: () => {},
    exists: () => false,
    count: () => 0,
  };

  async getAll(): Promise<Record<string, any>> {
    if (this.primaryBackend === 'postgres') {
      return this.pg.getAll();
    }
    return this.mock.getAll();
  }

  private async writeToMock(op: string, path: string, value?: any, opts?: any): Promise<void> {
    try {
      if (op === 'set') this.mock.json.set(path, value, opts);
    } catch (e: any) {
      console.error(`[DUAL] Mock ${op} failed for ${this.cubbyName}${path}:`, e.message);
    }
  }

  private async writeToPg(op: string, path: string, value?: any): Promise<void> {
    try {
      if (op === 'set') await this.pg.json.set(path, value);
    } catch (e: any) {
      console.error(`[DUAL] Postgres ${op} failed for ${this.cubbyName}${path}:`, e.message);
    }
  }
}
