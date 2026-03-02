export interface Event {
    id: string;
    event_type: string;
    app_id: string;
    account_id: string;
    timestamp: string;
    payload: any;
    signature: string;
    context_path: {
        agent_service: string;
        workspace: string;
        stream?: string;
    };
}

export interface Context {
    log(...args: any[]): void;
    emit(eventType: string, payload: object, targetId?: string): void;
    fetch(url: string, options?: any): any;
    agents: Record<string, any>;
    cubby(name: string): CubbyClient;
}

export interface CubbyClient {
    json: {
        get(path: string): any;
        set(path: string, value: any, opts?: any): void;
        delete(path: string): void;
        exists(path: string): boolean;
        mget(paths: string[]): Record<string, any>;
        mset(items: Record<string, any>, opts?: any): void;
        keys(pattern?: string): string[];
        incr(path: string, delta?: number): number;
    };
    vector: {
        createIndex(): void;
        add(id: string, embedding: number[], metadata?: Record<string, any>): void;
        search(embedding: number[], opts?: any): VectorMatch[];
        get(id: string): any;
        delete(id: string): void;
        exists(id: string): boolean;
        count(): number;
    };
}

export interface VectorMatch {
    id: string;
    score: number;
    metadata?: Record<string, any>;
}

// === Hiring Pipeline Domain Types ===

export interface TraitWeights {
    technical_depth: number;
    communication: number;
    problem_solving: number;
    system_design: number;
}

export interface CandidateTraits {
    id: string;
    technical_depth: number; // 0-10
    communication: number;   // 0-10
    problem_solving: number; // 0-10
    system_design: number;   // 0-10
    skills: string[];
    raw_evidence: Record<string, string>;
}

export interface CandidateScore {
    id: string;
    composite_score: number;
    weights_used: TraitWeights;
    timestamp: string;
}

export interface NewApplicationPayload {
    candidateId: string;
    resumeText: string;
    role: string;
}
