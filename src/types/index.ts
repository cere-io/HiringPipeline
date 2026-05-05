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

// === Pipeline Domain Types ===
// Same agent runtime serves recruiting AND sales. Per Fred (2026-04-17):
//   "It's the same agent. It's gonna be pretty customized for different
//    people. Like a checkbox to say, is this for recruiting or is this for
//    sales? Where at some point I'll get into..."
// Mode flag selects the trait schema + weights; pipeline shape is unchanged.

export type PipelineMode = 'recruiting' | 'sales' | 'sales:enterprise' | 'sales:smb';

// Recruiting trait weights (existing).
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

// Sales trait weights. Different traits matter for "is this account worth pursuing"
// vs "is this candidate worth hiring".
export interface SalesTraitWeights {
    icp_fit: number;             // does the account match our ideal customer profile
    intent_signals: number;      // recent fundraise, hiring, tech stack changes
    deal_size_potential: number; // ARR estimate
    champion_strength: number;   // do we have a likely internal advocate
    timing: number;              // budget cycle, contract expiry of competitor
    decision_velocity: number;   // historical close speed for similar accounts
    competitive_displacement: number; // vendor we'd replace
    relationship_warmth: number; // existing connections / referrals
    risk_signals: number;        // churn-y patterns, leadership turnover
}

export type AnyTraitWeights = TraitWeights | SalesTraitWeights;

export interface CandidateTraits {
    candidate_id: string;
    mode?: PipelineMode;         // NEW: defaults to 'recruiting' for backward compat
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

// Sales analog. Same shape (ratings + signals + audit fields), different traits.
export interface AccountTraits {
    account_id: string;
    mode: 'sales' | 'sales:enterprise' | 'sales:smb';
    company_name: string;
    icp_fit: { items: string[], rating: number };       // why they fit (industry, size, stack)
    intent_signals: { items: string[], rating: number }; // hiring posts, funding, tech changes
    deal_size_potential: number;                         // estimated ARR
    champion_signals: { items: string[], rating: number };
    timing_signals: { items: string[], rating: number };
    competitive_signals: { items: string[], rating: number };
    relationship_warmth: { items: string[], rating: number };
    risk_signals: { items: string[], rating: number };
    conclusive_score: number;
    human_feedback_score?: number;
    source_completeness: { has_crm: boolean, has_linkedin: boolean, has_intent_data: boolean };
    extracted_at: string;
}

export interface CandidateScore {
    id: string;
    mode?: PipelineMode;
    composite_score: number;
    weights_used: AnyTraitWeights;
    timestamp: string;
}

export interface NewApplicationPayload {
    candidateId: string;
    resumeText: string;        // for recruiting: resume; for sales: account brief
    role: string;              // for recruiting: job title; for sales: ICP segment
    mode?: PipelineMode;       // NEW: defaults to 'recruiting'
}

// Convenience: default weights per mode. Distillation will tune these per role/segment.
export const DEFAULT_RECRUITING_WEIGHTS: TraitWeights = {
    skills: 1, years_of_experience: 1, company_stages: 1, education_level: 1,
    schools: 1, hard_things_done: 1, hackathons: 1, open_source_contributions: 1,
    company_signals: 1,
};

export const DEFAULT_SALES_WEIGHTS: SalesTraitWeights = {
    icp_fit: 2, intent_signals: 2, deal_size_potential: 1.5, champion_strength: 1,
    timing: 1.5, decision_velocity: 1, competitive_displacement: 1,
    relationship_warmth: 1, risk_signals: -0.5, // risk subtracts
};

export function defaultWeightsFor(mode: PipelineMode): AnyTraitWeights {
    return mode === 'recruiting' ? DEFAULT_RECRUITING_WEIGHTS : DEFAULT_SALES_WEIGHTS;
}
