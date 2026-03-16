import { handle as conciergeHandle } from './agents/concierge';
import { extract as traitExtract } from './agents/trait-extractor';
import { score as scoreExecute } from './agents/scorer';
import { distill as distillExecute } from './agents/distillation';
import { analyze as analyzeTranscript } from './agents/transcript-analyzer';
import { PostgresCubby, logPipelineEvent } from './postgres-cubby';
import { DualWriteCubby } from './dual-write-cubby';
import type { Context, Event } from './agents/types';

// Simple in-memory mock storage that persists across API calls in the same Node process
class MockCubby {
    private jsonData: Record<string, any> = {};

    json = {
        get: (path: string) => this.jsonData[path],
        set: (path: string, value: any) => { this.jsonData[path] = value; },
        delete: (path: string) => { delete this.jsonData[path]; },
        exists: (path: string) => !!this.jsonData[path],
        mget: (paths: string[]) => paths.reduce((acc, p) => ({ ...acc, [p]: this.jsonData[p] }), {}),
        mset: (items: Record<string, any>) => { Object.assign(this.jsonData, items); },
        keys: () => Object.keys(this.jsonData),
        incr: (path: string) => { this.jsonData[path] = (this.jsonData[path] || 0) + 1; return this.jsonData[path]; }
    };

    vector = {
        createIndex: () => {}, add: () => {}, search: () => [], get: () => null, delete: () => {}, exists: () => false, count: () => 0
    };

    getAll() {
        return this.jsonData;
    }
}

// Storage mode: 'mock' | 'postgres' | 'dual'
// - mock: in-memory only (Phase 1, default if no SUPABASE_SERVICE_ROLE_KEY)
// - postgres: Supabase Postgres only (Phase 2, production)
// - dual: writes to both, reads from Postgres (Phase 2, verification)
const STORAGE_MODE = (process.env.STORAGE_MODE || 'dual') as 'mock' | 'postgres' | 'dual';
const hasSupabase = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const effectiveMode = hasSupabase ? STORAGE_MODE : 'mock';

if (!hasSupabase && STORAGE_MODE !== 'mock') {
    console.warn(`[RUNTIME] STORAGE_MODE=${STORAGE_MODE} but no SUPABASE_SERVICE_ROLE_KEY set. Falling back to mock.`);
}

console.log(`[RUNTIME] Storage mode: ${effectiveMode}`);

const CUBBY_NAMES = ['hiring-traits', 'hiring-scores', 'hiring-interviews', 'hiring-outcomes', 'hiring-meta'] as const;

// Build cubby instances based on storage mode
type CubbyMap = Record<string, MockCubby | PostgresCubby | DualWriteCubby>;

function buildCubbies(): CubbyMap {
    const cubbies: CubbyMap = {};

    for (const name of CUBBY_NAMES) {
        if (effectiveMode === 'mock') {
            cubbies[name] = new MockCubby();
        } else if (effectiveMode === 'postgres') {
            cubbies[name] = new PostgresCubby(name);
        } else {
            // dual mode
            cubbies[name] = new DualWriteCubby(name, new MockCubby(), new PostgresCubby(name), 'postgres');
        }
    }

    return cubbies;
}

// Global instance to persist between Next.js API route calls (in development)
const globalForCubbies = global as unknown as { cubbies: CubbyMap };

export const cubbies = globalForCubbies.cubbies || buildCubbies();

if (process.env.NODE_ENV !== 'production') globalForCubbies.cubbies = cubbies;

// Backward compatibility: export as mockCubbies for existing API routes
export const mockCubbies = cubbies as Record<string, any>;

export function createContext() {
    const logs: string[] = [];

    const context: Context = {
        log: (...args: any[]) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            console.log('   [LOG]', msg);
            logs.push(msg);
        },
        emit: (eventType: string, payload: object) => console.log('   [EMIT]', eventType, payload),
        fetch: async (url: string, options?: any) => {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 60000);
                const res = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timeout);
                let data = null;
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    data = await res.json();
                } else {
                    data = await res.text();
                }
                return { ok: res.ok, status: res.status, data };
            } catch (err: any) {
                return { ok: false, error: err.message };
            }
        },
        cubby: (name: string) => cubbies[name] as any,
        agents: {
            traitExtractor: {
                extract: async (payload: any) => {
                    const res = await traitExtract(payload, context);
                    return { value: res };
                }
            },
            scorer: {
                score: async (payload: any) => {
                    const res = await scoreExecute(payload, context);
                    return { value: res };
                }
            },
            distillation: {
                distill: async (payload: any) => {
                    const res = await distillExecute(payload, context);
                    return { value: res };
                }
            },
            transcriptAnalyzer: {
                analyze: async (payload: any) => {
                    const res = await analyzeTranscript(payload, context);
                    return { value: res };
                }
            }
        }
    };

    return { context, logs };
}

export { conciergeHandle, distillExecute, analyzeTranscript, logPipelineEvent };
