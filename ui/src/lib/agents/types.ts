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
        get(path: string): any | Promise<any>;
        set(path: string, value: any, opts?: any): void | Promise<void>;
        delete(path: string): void | Promise<void>;
        exists(path: string): boolean | Promise<boolean>;
        mget(paths: string[]): Record<string, any> | Promise<Record<string, any>>;
        mset(items: Record<string, any>, opts?: any): void | Promise<void>;
        keys(pattern?: string): string[] | Promise<string[]>;
        incr(path: string, delta?: number): number | Promise<number>;
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

export interface ProfileDNA {
    education: number;
    company_caliber: number;
    career_arc: number;
    technical_depth: number;
    proof_of_work: number;
    public_signal: number;
}

export interface StartupFit {
    action_speed: number;
    autonomy: number;
    judgment: number;
    communication: number;
    coachability: number;
    drive_grit: number;
}

export const PROFILE_DNA_LABELS: Record<keyof ProfileDNA, string> = {
    education: 'Education',
    company_caliber: 'Company Caliber',
    career_arc: 'Career Arc',
    technical_depth: 'Technical Depth',
    proof_of_work: 'Proof of Work',
    public_signal: 'Public Signal',
};

export const STARTUP_FIT_LABELS: Record<keyof StartupFit, string> = {
    action_speed: 'Action & Speed',
    autonomy: 'Autonomy',
    judgment: 'Judgment',
    communication: 'Communication',
    coachability: 'Coachability',
    drive_grit: 'Drive & Grit',
};

export interface CandidateTraits {
    candidate_id: string;
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
    dimensions?: Record<string, string | boolean>;
    profile_dna?: ProfileDNA;
}

export interface CandidateScore {
    id: string;
    composite_score: number;
    reasoning?: string;
    weights_used: TraitWeights;
    timestamp: string;
}

export interface NewApplicationPayload {
    candidateId: string;
    resumeText: string;
    role: string;
    source?: string; // ATS source: 'join' | 'wellfound' | 'direct' | etc.
}

/** Aggregate sourcing intelligence — stored in hiring-meta/sourcing_stats */
export interface SourcingStats {
    [source: string]: {
        total_candidates: number;
        avg_ai_score: number;
        avg_human_score: number;
        avg_performance_score: number;
        performance_review_count: number; // only candidates with 1-month reviews
        hired_count: number;
    };
}

/** A qualitative signal discovered from human feedback or interview analysis */
export interface TraitSignal {
    id: string;
    signal: string;
    category: keyof TraitWeights;
    direction: 'positive' | 'negative';
    strength: number;
    occurrence_count: number;
    candidate_ids: string[];
    avg_outcome: number;
    outcome_entries: Array<{ candidate_id: string; outcome: number; timestamp: string }>;
    first_seen: string;
    last_seen: string;
}

/** The full catalog stored at hiring-signals */
export interface SignalCatalog {
    [signalId: string]: TraitSignal;
}

export type PipelineStage = 'applied' | 'ai_scored' | 'human_review' | 'interview' | 'hired' | 'performance_review' | 'rejected';

export interface CandidateStatus {
    candidate_id: string;
    role: string;
    stage: PipelineStage;
    rejected_at_stage?: PipelineStage;
    rejection_reasons?: string[];
    created_at: string;
    updated_at: string;
}

export type DimensionGroup = 'education' | 'experience' | 'technical' | 'projects' | 'career';

export interface DimensionMeta {
    key: string;
    label: string;
    group: DimensionGroup;
    type: 'boolean' | 'category';
    values?: string[];
}

export interface CompoundPattern {
    id: string;
    traits: Record<string, string | boolean>;
    description: string;
    winner_count: number;
    total_count: number;
    winner_rate: number;
    avg_outcome: number;
}

// === Join.com API v2 Types (derived from live API responses) ===

export interface JoinAttachment {
    type: 'CV' | 'COVER_LETTER' | string;
    url: string;
}

export interface JoinSource {
    product: string;
    isPremium: boolean;
}

export interface JoinScreeningQuestion {
    question: string;
    type: 'DATE' | 'INTEGER' | 'TEXT' | string;
    answer: string | null;
    file: string | null;
    isSkipped: boolean;
}

export interface JoinPipelineStageInfo {
    id: number;
    name: string;
    index: number;
}

export interface JoinApplication {
    id: number;
    createdAt: string;
    lastUpdatedAt: string;
    attachments: JoinAttachment[];
    source: JoinSource;
    job: {
        id: number;
        title: string;
        externalId: string | null;
    };
    candidate: {
        id: number;
        firstName: string;
        lastName: string;
        email: string;
        phoneNumber: string | null;
        country: { name: string; iso3166: string } | null;
        tags: string[] | null;
        professionalLinks: { type: string; url: string }[] | null;
    };
    screeningQuestions: JoinScreeningQuestion[];
    qualified: string;
    consent: {
        id: number;
        consentStatus: string;
    };
    integrationExternalId: string | null;
    state: string;
    currentStage: JoinPipelineStageInfo;
}

export const DIMENSION_REGISTRY: DimensionMeta[] = [
    { key: 'education_level', label: 'Education Level', group: 'education', type: 'category', values: ['PhD', 'Masters', 'Bachelors', 'None'] },
    { key: 'school_tier', label: 'School Tier', group: 'education', type: 'category', values: ['tier_1', 'tier_2', 'tier_3', 'unknown'] },
    { key: 'school_geography', label: 'School Geography', group: 'education', type: 'category', values: ['us', 'europe', 'asia', 'other', 'unknown'] },
    { key: 'field_of_study', label: 'Field of Study', group: 'education', type: 'category', values: ['cs', 'engineering', 'science', 'business', 'other'] },
    { key: 'yoe_bucket', label: 'Years of Experience', group: 'experience', type: 'category', values: ['0-2', '3-5', '6-10', '10+'] },
    { key: 'has_startup', label: 'Startup Experience', group: 'experience', type: 'boolean' },
    { key: 'has_growth_stage', label: 'Growth Stage Exp', group: 'experience', type: 'boolean' },
    { key: 'has_bigtech', label: 'Big Tech Experience', group: 'experience', type: 'boolean' },
    { key: 'career_trajectory', label: 'Career Trajectory', group: 'career', type: 'category', values: ['startup_first', 'bigtech_first', 'mixed', 'enterprise_only'] },
    { key: 'primary_tech_domain', label: 'Tech Domain', group: 'technical', type: 'category', values: ['systems', 'web', 'data_ml', 'mobile', 'infra', 'fullstack'] },
    { key: 'has_open_source', label: 'Open Source', group: 'projects', type: 'boolean' },
    { key: 'has_hackathons', label: 'Hackathons', group: 'projects', type: 'boolean' },
    { key: 'has_hard_things', label: 'Hard Things Done', group: 'projects', type: 'boolean' },
    { key: 'hard_things_bucket', label: 'Hard Things Rating', group: 'projects', type: 'category', values: ['high', 'mid', 'low'] },
    { key: 'schools_bucket', label: 'Schools Rating', group: 'education', type: 'category', values: ['high', 'mid', 'low'] },
];
