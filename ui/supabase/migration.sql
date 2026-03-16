-- HiringPipeline Phase 2: Postgres tables mirroring Cubby shape
-- Run this in Supabase SQL Editor

-- 1. candidate_traits (mirrors hiring-traits cubby)
CREATE TABLE IF NOT EXISTS candidate_traits (
    candidate_id TEXT PRIMARY KEY,
    skills JSONB DEFAULT '[]'::jsonb,
    years_of_experience NUMERIC DEFAULT 0,
    company_stages JSONB DEFAULT '[]'::jsonb,
    education_level TEXT DEFAULT 'None',
    schools JSONB DEFAULT '{"items": [], "rating": 0}'::jsonb,
    hard_things_done JSONB DEFAULT '{"items": [], "rating": 0}'::jsonb,
    hackathons JSONB DEFAULT '{"items": [], "rating": 0}'::jsonb,
    open_source_contributions JSONB DEFAULT '{"items": [], "rating": 0}'::jsonb,
    company_signals JSONB DEFAULT '{"items": [], "rating": 0}'::jsonb,
    conclusive_score NUMERIC DEFAULT 0,
    human_feedback_score NUMERIC,
    source_completeness JSONB DEFAULT '{"has_resume": false, "has_linkedin": false}'::jsonb,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. candidate_scores (mirrors hiring-scores cubby)
CREATE TABLE IF NOT EXISTS candidate_scores (
    candidate_id TEXT PRIMARY KEY,
    composite_score NUMERIC DEFAULT 0,
    weights_used JSONB DEFAULT '{}'::jsonb,
    reasoning TEXT,
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. interview_analyses (mirrors hiring-interviews cubby)
CREATE TABLE IF NOT EXISTS interview_analyses (
    candidate_id TEXT PRIMARY KEY,
    technical_depth NUMERIC DEFAULT 0,
    communication_clarity NUMERIC DEFAULT 0,
    cultural_fit NUMERIC DEFAULT 0,
    problem_solving NUMERIC DEFAULT 0,
    summary TEXT,
    red_flags JSONB DEFAULT '[]'::jsonb,
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. candidate_outcomes (mirrors hiring-outcomes cubby)
CREATE TABLE IF NOT EXISTS candidate_outcomes (
    candidate_id TEXT PRIMARY KEY,
    outcome NUMERIC DEFAULT 0,
    role TEXT,
    source TEXT,
    is_performance_review BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. role_weights (mirrors hiring-meta/trait_weights/{role})
CREATE TABLE IF NOT EXISTS role_weights (
    role TEXT PRIMARY KEY,
    skills NUMERIC DEFAULT 0.1,
    years_of_experience NUMERIC DEFAULT 0.1,
    company_stages NUMERIC DEFAULT 0.08,
    education_level NUMERIC DEFAULT 0.07,
    schools NUMERIC DEFAULT 0.08,
    hard_things_done NUMERIC DEFAULT 0.215,
    hackathons NUMERIC DEFAULT 0.075,
    open_source_contributions NUMERIC DEFAULT 0.1,
    company_signals NUMERIC DEFAULT 0.14,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. sourcing_stats (mirrors hiring-meta/sourcing_stats)
CREATE TABLE IF NOT EXISTS sourcing_stats (
    source TEXT PRIMARY KEY,
    total_candidates INTEGER DEFAULT 0,
    avg_ai_score NUMERIC DEFAULT 0,
    avg_human_score NUMERIC DEFAULT 0,
    avg_performance_score NUMERIC DEFAULT 0,
    performance_review_count INTEGER DEFAULT 0,
    hired_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. pipeline_events (audit trail - not in Cubbies but useful for debugging)
CREATE TABLE IF NOT EXISTS pipeline_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    candidate_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_candidate_traits_score ON candidate_traits(conclusive_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_scores_composite ON candidate_scores(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_outcomes_role ON candidate_outcomes(role);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_type ON pipeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_candidate ON pipeline_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_created ON pipeline_events(created_at DESC);

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_candidate_traits_updated
    BEFORE UPDATE ON candidate_traits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_candidate_scores_updated
    BEFORE UPDATE ON candidate_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_interview_analyses_updated
    BEFORE UPDATE ON interview_analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_candidate_outcomes_updated
    BEFORE UPDATE ON candidate_outcomes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_role_weights_updated
    BEFORE UPDATE ON role_weights FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_sourcing_stats_updated
    BEFORE UPDATE ON sourcing_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default role weights (matching the existing defaults in the codebase)
INSERT INTO role_weights (role, skills, years_of_experience, company_stages, education_level, schools, hard_things_done, hackathons, open_source_contributions, company_signals)
VALUES
    ('AI Engineer', 0.1, 0.1, 0.08, 0.07, 0.08, 0.215, 0.075, 0.1, 0.14),
    ('AI Innovator', 0.1, 0.1, 0.08, 0.07, 0.08, 0.215, 0.075, 0.1, 0.14),
    ('Principal Fullstack Engineer', 0.12, 0.12, 0.08, 0.06, 0.07, 0.2, 0.06, 0.1, 0.15),
    ('Blockchain Engineer', 0.12, 0.1, 0.08, 0.06, 0.07, 0.2, 0.07, 0.12, 0.14),
    ('Founder''s Associate', 0.08, 0.08, 0.12, 0.07, 0.09, 0.22, 0.06, 0.06, 0.16)
ON CONFLICT (role) DO NOTHING;
