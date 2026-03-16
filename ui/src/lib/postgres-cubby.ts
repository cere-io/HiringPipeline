import { supabase } from './supabase';
import type { CubbyClient } from './agents/types';

/**
 * Maps Cubby names to Postgres table names and handles the path-to-row translation.
 *
 * Cubby paths:
 *   hiring-traits: /{candidateId}
 *   hiring-scores: /{candidateId}
 *   hiring-interviews: /{candidateId}
 *   hiring-outcomes: /{candidateId}
 *   hiring-meta: /trait_weights/{role} or /sourcing_stats
 */

const CUBBY_TABLE_MAP: Record<string, string> = {
  'hiring-traits': 'candidate_traits',
  'hiring-scores': 'candidate_scores',
  'hiring-interviews': 'interview_analyses',
  'hiring-outcomes': 'candidate_outcomes',
  'hiring-meta': '__meta__', // Special: splits into role_weights + sourcing_stats
};

// Fields that are stored as JSONB in Postgres but as plain values in Cubby
const JSONB_FIELDS: Record<string, string[]> = {
  candidate_traits: ['skills', 'company_stages', 'schools', 'hard_things_done', 'hackathons', 'open_source_contributions', 'company_signals', 'source_completeness'],
  candidate_scores: ['weights_used'],
  interview_analyses: ['red_flags'],
};

function parsePath(cubbyName: string, path: string): { table: string; key: string; subpath?: string } {
  const parts = path.replace(/^\//, '').split('/');

  if (cubbyName === 'hiring-meta') {
    if (parts[0] === 'trait_weights' && parts[1]) {
      return { table: 'role_weights', key: parts[1] };
    }
    if (parts[0] === 'sourcing_stats') {
      return { table: 'sourcing_stats', key: '__all__' };
    }
    // Fallback for direct meta keys
    return { table: 'role_weights', key: parts[0], subpath: parts.slice(1).join('/') };
  }

  return { table: CUBBY_TABLE_MAP[cubbyName], key: parts[0] };
}

function getPrimaryKeyColumn(table: string): string {
  if (table === 'role_weights') return 'role';
  if (table === 'sourcing_stats') return 'source';
  return 'candidate_id';
}

/** Convert a Cubby JSON value to a Postgres row for upsert */
function valueToRow(table: string, key: string, value: any): Record<string, any> {
  const pk = getPrimaryKeyColumn(table);
  const row: Record<string, any> = { [pk]: key };

  if (typeof value !== 'object' || value === null) {
    return row;
  }

  // Map value fields to columns
  for (const [k, v] of Object.entries(value)) {
    if (k === 'candidate_id' || k === 'id') continue; // PK handled above
    // Rename 'timestamp' to the correct column based on table
    if (k === 'timestamp') {
      if (table === 'candidate_scores') row['scored_at'] = v;
      else if (table === 'candidate_outcomes') row['recorded_at'] = v;
      else if (table === 'interview_analyses') row['analyzed_at'] = v;
      else if (table === 'candidate_traits') row['extracted_at'] = v;
      continue;
    }
    row[k] = v;
  }

  return row;
}

/** Convert a Postgres row back to the Cubby JSON shape */
function rowToValue(table: string, row: Record<string, any>): any {
  if (!row) return undefined;

  const result: Record<string, any> = {};
  const pk = getPrimaryKeyColumn(table);

  for (const [k, v] of Object.entries(row)) {
    if (k === 'created_at' || k === 'updated_at') continue;
    if (k === pk) {
      if (table === 'candidate_traits') result['candidate_id'] = v;
      else if (table === 'candidate_scores') result['id'] = v;
      continue;
    }
    // Reverse timestamp mapping
    if (k === 'scored_at' || k === 'recorded_at' || k === 'analyzed_at' || k === 'extracted_at') {
      result['timestamp'] = v;
      continue;
    }
    result[k] = v;
  }

  return result;
}

export class PostgresCubby implements CubbyClient {
  private cubbyName: string;

  constructor(cubbyName: string) {
    this.cubbyName = cubbyName;
  }

  json = {
    get: async (path: string): Promise<any> => {
      const { table, key } = parsePath(this.cubbyName, path);
      const pk = getPrimaryKeyColumn(table);

      if (table === 'sourcing_stats' && key === '__all__') {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
          console.error(`[PG] get error ${this.cubbyName}${path}:`, error.message);
          return undefined;
        }
        // Convert array of rows to the Cubby shape: { [source]: stats }
        const result: Record<string, any> = {};
        for (const row of data || []) {
          const source = row.source;
          result[source] = rowToValue(table, row);
          delete result[source].source; // source is the key, not a value field
        }
        return result;
      }

      const { data, error } = await supabase.from(table).select('*').eq(pk, key).single();
      if (error) {
        if (error.code === 'PGRST116') return undefined; // No rows
        console.error(`[PG] get error ${this.cubbyName}${path}:`, error.message);
        return undefined;
      }
      return rowToValue(table, data);
    },

    set: async (path: string, value: any): Promise<void> => {
      const { table, key } = parsePath(this.cubbyName, path);
      const pk = getPrimaryKeyColumn(table);

      if (table === 'sourcing_stats' && key === '__all__') {
        // Value is { [source]: stats } - upsert each source
        for (const [source, stats] of Object.entries(value as Record<string, any>)) {
          const row = { source, ...stats };
          const { error } = await supabase.from(table).upsert(row, { onConflict: 'source' });
          if (error) console.error(`[PG] set error sourcing_stats/${source}:`, error.message);
        }
        return;
      }

      const row = valueToRow(table, key, value);
      const { error } = await supabase.from(table).upsert(row, { onConflict: pk });
      if (error) {
        console.error(`[PG] set error ${this.cubbyName}${path}:`, error.message);
      }
    },

    delete: async (path: string): Promise<void> => {
      const { table, key } = parsePath(this.cubbyName, path);
      const pk = getPrimaryKeyColumn(table);
      const { error } = await supabase.from(table).delete().eq(pk, key);
      if (error) console.error(`[PG] delete error ${this.cubbyName}${path}:`, error.message);
    },

    exists: async (path: string): Promise<boolean> => {
      const val = await this.json.get(path);
      return val !== undefined;
    },

    mget: async (paths: string[]): Promise<Record<string, any>> => {
      const result: Record<string, any> = {};
      for (const p of paths) {
        result[p] = await this.json.get(p);
      }
      return result;
    },

    mset: async (items: Record<string, any>): Promise<void> => {
      for (const [path, value] of Object.entries(items)) {
        await this.json.set(path, value);
      }
    },

    keys: async (): Promise<string[]> => {
      const table = CUBBY_TABLE_MAP[this.cubbyName];
      if (!table || table === '__meta__') {
        // For meta, return keys from both tables
        const [weights, stats] = await Promise.all([
          supabase.from('role_weights').select('role'),
          supabase.from('sourcing_stats').select('source'),
        ]);
        const keys: string[] = [];
        for (const row of weights.data || []) keys.push(`/trait_weights/${row.role}`);
        if ((stats.data || []).length > 0) keys.push('/sourcing_stats');
        return keys;
      }

      const pk = getPrimaryKeyColumn(table);
      const { data, error } = await supabase.from(table).select(pk);
      if (error) return [];
      return (data || []).map((row: any) => `/${row[pk]}`);
    },

    incr: async (path: string): Promise<number> => {
      // Not commonly used in hiring pipeline, simple get+set
      const current = (await this.json.get(path)) || 0;
      const next = current + 1;
      await this.json.set(path, next);
      return next;
    },
  };

  // Vector operations - not used in hiring pipeline, stub for interface compliance
  vector = {
    createIndex: () => {},
    add: () => {},
    search: () => [] as any[],
    get: () => null,
    delete: () => {},
    exists: () => false,
    count: () => 0,
  };

  /** Dump all data from this cubby's backing table(s) */
  async getAll(): Promise<Record<string, any>> {
    const table = CUBBY_TABLE_MAP[this.cubbyName];

    if (table === '__meta__') {
      const [weights, stats] = await Promise.all([
        supabase.from('role_weights').select('*'),
        supabase.from('sourcing_stats').select('*'),
      ]);
      const result: Record<string, any> = {};
      for (const row of weights.data || []) {
        result[`/trait_weights/${row.role}`] = rowToValue('role_weights', row);
      }
      // Build sourcing stats object
      const sourcingObj: Record<string, any> = {};
      for (const row of stats.data || []) {
        const source = row.source;
        sourcingObj[source] = rowToValue('sourcing_stats', row);
      }
      if (Object.keys(sourcingObj).length > 0) {
        result['/sourcing_stats'] = sourcingObj;
      }
      return result;
    }

    const pk = getPrimaryKeyColumn(table);
    const { data, error } = await supabase.from(table).select('*');
    if (error) return {};

    const result: Record<string, any> = {};
    for (const row of data || []) {
      result[`/${row[pk]}`] = rowToValue(table, row);
    }
    return result;
  }
}

/** Log an event to the pipeline_events audit trail */
export async function logPipelineEvent(
  id: string,
  eventType: string,
  candidateId: string | null,
  payload: any,
  source?: string
) {
  const { error } = await supabase.from('pipeline_events').insert({
    id,
    event_type: eventType,
    candidate_id: candidateId,
    payload,
    source,
  });
  if (error) console.error('[PG] event log error:', error.message);
}
