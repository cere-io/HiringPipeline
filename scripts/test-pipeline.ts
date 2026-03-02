import { handle as conciergeHandle } from '../src/agents/concierge';
import { extract as traitExtract } from '../src/agents/trait-extractor';
import { score as scoreExecute } from '../src/agents/scorer';
import { distill as distillExecute } from '../src/agents/distillation';
import type { Context, Event } from '../src/types';

// Mock Cubby Storage
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
}

// Mock Context
const mockCubbies: Record<string, MockCubby> = {
    'hiring-traits': new MockCubby(),
    'hiring-scores': new MockCubby(),
    'hiring-interviews': new MockCubby(),
    'hiring-outcomes': new MockCubby(),
    'hiring-meta': new MockCubby(),
};

const mockContext: Context = {
    log: (...args: any[]) => console.log('   [LOG]', ...args),
    emit: (eventType: string, payload: object) => console.log('   [EMIT]', eventType, payload),
    fetch: () => ({ ok: true, data: {} }),
    cubby: (name: string) => mockCubbies[name] as any,
    agents: {
        traitExtractor: {
            extract: async (payload: any) => {
                const res = await traitExtract(payload, mockContext);
                return { value: res };
            }
        },
        scorer: {
            score: async (payload: any) => {
                const res = await scoreExecute(payload, mockContext);
                return { value: res };
            }
        },
        distillation: {
            distill: async (payload: any) => {
                const res = await distillExecute(payload, mockContext);
                return { value: res };
            }
        }
    }
};

async function runTest() {
    console.log('\n======================================================');
    console.log('🤖 STARTING HIRING PIPELINE & COMPOUND INTELLIGENCE PoC');
    console.log('======================================================\n');

    // ---------------------------------------------------------
    // SCENARIO 1: First Candidate Application
    // ---------------------------------------------------------
    console.log('--- EVENT 1: New Application (Candidate A) ---');
    const newAppEventA: Event = {
        id: 'evt-1', event_type: 'NEW_APPLICATION', app_id: 'app-1', account_id: 'acc-1',
        timestamp: new Date().toISOString(), signature: 'sig', context_path: { agent_service: 'hiring', workspace: 'ws-1' },
        payload: {
            candidateId: 'cand-A',
            role: 'Senior Backend Engineer',
            resumeText: 'I built highly scalable microservices architecture in Rust and Python. Led a team of 5.'
        }
    };

    const resultA = await conciergeHandle(newAppEventA, mockContext);
    console.log('\n--- Pipeline Result (Candidate A) ---');
    console.log(JSON.stringify(resultA, null, 2));


    // ---------------------------------------------------------
    // SCENARIO 2: 3 Months Later - Distillation/Feedback
    // ---------------------------------------------------------
    console.log('\n======================================================');
    console.log('--- EVENT 2: Outcome Recorded (3 Months Later) ---');
    console.log('Candidate A was hired and turned out to be an amazing performer.');
    console.log('Distillation agent adjusts role weights towards Candidate A\'s traits.');
    
    await mockContext.agents.distillation.distill({
        candidateId: 'cand-A',
        role: 'Senior Backend Engineer',
        outcome: 'Hired_Performing_Well'
    });


    // ---------------------------------------------------------
    // SCENARIO 3: Second Candidate Application (Benefits from learning)
    // ---------------------------------------------------------
    console.log('\n======================================================');
    console.log('--- EVENT 3: New Application (Candidate B) ---');
    const newAppEventB: Event = {
        id: 'evt-2', event_type: 'NEW_APPLICATION', app_id: 'app-1', account_id: 'acc-1',
        timestamp: new Date().toISOString(), signature: 'sig', context_path: { agent_service: 'hiring', workspace: 'ws-1' },
        payload: {
            candidateId: 'cand-B',
            role: 'Senior Backend Engineer',
            // Notice candidate B has similar keywords to trigger similar traits to A
            resumeText: 'I love scalable architecture and Python. Led project deliverables.'
        }
    };

    const resultB = await conciergeHandle(newAppEventB, mockContext);
    console.log('\n--- Pipeline Result (Candidate B) ---');
    console.log(JSON.stringify(resultB, null, 2));

    console.log('\n======================================================');
    console.log('Notice how Candidate B is scored against the NEW weights that were');
    console.log('updated by the Distillation agent after Candidate A succeeded.');
    console.log('This is Compound Intelligence.');
    console.log('======================================================\n');
}

runTest().catch(console.error);
