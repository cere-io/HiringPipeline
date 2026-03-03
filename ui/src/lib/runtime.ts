import { handle as conciergeHandle } from './agents/concierge';
import { extract as traitExtract } from './agents/trait-extractor';
import { score as scoreExecute } from './agents/scorer';
import { distill as distillExecute } from './agents/distillation';
import { analyze as analyzeTranscript } from './agents/transcript-analyzer';
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

    // Vector operations omitted for brevity in this specific test
    vector = {
        createIndex: () => {}, add: () => {}, search: () => [], get: () => null, delete: () => {}, exists: () => false, count: () => 0
    };

    getAll() {
        return this.jsonData;
    }
}

// Global instance to persist between Next.js API route calls (in development)
const globalForCubbies = global as unknown as { mockCubbies: Record<string, MockCubby> };

export const mockCubbies = globalForCubbies.mockCubbies || {
    'hiring-traits': new MockCubby(),
    'hiring-scores': new MockCubby(),
    'hiring-interviews': new MockCubby(),
    'hiring-outcomes': new MockCubby(),
    'hiring-meta': new MockCubby(),
};

if (process.env.NODE_ENV !== 'production') globalForCubbies.mockCubbies = mockCubbies;

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
                const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
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
        cubby: (name: string) => mockCubbies[name] as any,
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

export { conciergeHandle, distillExecute, analyzeTranscript };
