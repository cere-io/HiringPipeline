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
    skills: number;
    years_of_experience: number;
    company_stages: number;
    education_level: number;
    schools: number;
    hard_things_done: number;
    hackathons: number;
    open_source_contributions: number;
    company_signals: number;
}

export interface CandidateTraits {
    candidate_id: string; // From Data Model
    skills: string[];
    years_of_experience: number;
    company_stages: string[];
    education_level: string;
    schools: { items: string[], rating: number };
    hard_things_done: { items: string[], rating: number };
    hackathons: { items: string[], rating: number };
    open_source_contributions: { items: string[], rating: number };
    company_signals: { items: string[], rating: number };
    conclusive_score: number;
    human_feedback_score?: number;
    source_completeness: { has_resume: boolean, has_linkedin: boolean };
    extracted_at: string;
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
