-- HiringPipeline v2: Productized Agent Architecture
-- Adds tables for dynamic trait schemas, domain-agnostic storage, experiments, and adapters.
-- Run AFTER migration.sql (v1 tables remain for backward compatibility).

-- ============================================================
-- 1. Trait Schema Registry
-- ============================================================
CREATE TABLE IF NOT EXISTS trait_schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'hiring',
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    profile_axes JSONB,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trait_schemas_domain ON trait_schemas(domain);

-- Dynamic weights per schema + role (replaces fixed-column role_weights for v2)
CREATE TABLE IF NOT EXISTS schema_weights (
    schema_id TEXT REFERENCES trait_schemas(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    weights JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, role)
);

-- ============================================================
-- 2. Domain-agnostic data tables (ci_ prefix = Compound Intelligence)
-- ============================================================

CREATE TABLE IF NOT EXISTS ci_traits (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    traits JSONB NOT NULL DEFAULT '{}'::jsonb,
    profile_scores JSONB,
    subject_name TEXT,
    subject_meta JSONB,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_traits_schema ON ci_traits(schema_id);

CREATE TABLE IF NOT EXISTS ci_scores (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    role TEXT,
    composite_score NUMERIC DEFAULT 0,
    reasoning TEXT,
    weights_used JSONB DEFAULT '{}'::jsonb,
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_scores_composite ON ci_scores(composite_score DESC);

CREATE TABLE IF NOT EXISTS ci_outcomes (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    outcome NUMERIC DEFAULT 0,
    role TEXT,
    feedback TEXT,
    is_performance_review BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, subject_id)
);

CREATE TABLE IF NOT EXISTS ci_analyses (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    scores JSONB DEFAULT '{}'::jsonb,
    summary TEXT,
    flags JSONB DEFAULT '[]'::jsonb,
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, subject_id)
);

CREATE TABLE IF NOT EXISTS ci_signals (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    signal_id TEXT NOT NULL,
    signal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, signal_id)
);

CREATE TABLE IF NOT EXISTS ci_sourcing_stats (
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    total_subjects INTEGER DEFAULT 0,
    avg_ai_score NUMERIC DEFAULT 0,
    avg_human_score NUMERIC DEFAULT 0,
    avg_performance_score NUMERIC DEFAULT 0,
    performance_review_count INTEGER DEFAULT 0,
    hired_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (schema_id, source)
);

-- ============================================================
-- 3. Control Experiments
-- ============================================================

CREATE TABLE IF NOT EXISTS ci_experiments (
    id TEXT PRIMARY KEY,
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    adapter_source TEXT,
    ai_score NUMERIC,
    external_score NUMERIC,
    human_decision TEXT,        -- 'hired', 'rejected', 'pending'
    ai_recommendation TEXT,     -- 'strong_yes', 'yes', 'maybe', 'no'
    correlation_correct BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ci_experiments_schema ON ci_experiments(schema_id);
CREATE INDEX IF NOT EXISTS idx_ci_experiments_subject ON ci_experiments(subject_id);

-- ============================================================
-- 4. Adapter Connections
-- ============================================================

CREATE TABLE IF NOT EXISTS ci_adapter_connections (
    id TEXT PRIMARY KEY,
    adapter_type TEXT NOT NULL,     -- 'join', 'greenhouse', 'generic-webhook', etc.
    schema_id TEXT NOT NULL REFERENCES trait_schemas(id) ON DELETE CASCADE,
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    last_poll_at TIMESTAMPTZ,
    subjects_processed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. Auto-update triggers for v2 tables
-- ============================================================

CREATE OR REPLACE TRIGGER trg_trait_schemas_updated
    BEFORE UPDATE ON trait_schemas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_schema_weights_updated
    BEFORE UPDATE ON schema_weights FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_ci_traits_updated
    BEFORE UPDATE ON ci_traits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_ci_scores_updated
    BEFORE UPDATE ON ci_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_ci_outcomes_updated
    BEFORE UPDATE ON ci_outcomes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_ci_analyses_updated
    BEFORE UPDATE ON ci_analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_ci_signals_updated
    BEFORE UPDATE ON ci_signals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. Seed preset schemas
-- ============================================================

INSERT INTO trait_schemas (id, name, domain, fields, profile_axes, created_by) VALUES
(
    'hiring-hiring-v1',
    'Hiring',
    'hiring',
    '[
        {"key":"skills","label":"Technical Skills","type":"string[]","extraction_hint":"technical and soft skills","default_weight":0.1},
        {"key":"years_of_experience","label":"Years of Experience","type":"number","extraction_hint":"integer years of professional experience","default_weight":0.1},
        {"key":"company_stages","label":"Company Stages","type":"string[]","extraction_hint":"startup, series_a, series_b, growth, public, enterprise","default_weight":0.08},
        {"key":"education_level","label":"Education Level","type":"category","values":["PhD","Masters","Bachelors","None"],"extraction_hint":"highest degree","default_weight":0.07},
        {"key":"schools","label":"Schools","type":"rating","extraction_hint":"school names and prestige rating","default_weight":0.08},
        {"key":"hard_things_done","label":"Hard Things Built","type":"rating","extraction_hint":"impressive technical achievements","default_weight":0.215},
        {"key":"hackathons","label":"Hackathons","type":"rating","extraction_hint":"hackathon participation and awards","default_weight":0.075},
        {"key":"open_source_contributions","label":"Open Source","type":"rating","extraction_hint":"open source contributions","default_weight":0.1},
        {"key":"company_signals","label":"Company Signals","type":"rating","extraction_hint":"notable employers","default_weight":0.14}
    ]'::jsonb,
    '[
        {"key":"education","label":"Education","derivation_hint":"School prestige and degree level"},
        {"key":"company_caliber","label":"Company Caliber","derivation_hint":"Quality and prestige of employers"},
        {"key":"career_arc","label":"Career Arc","derivation_hint":"Progression trajectory"},
        {"key":"technical_depth","label":"Technical Depth","derivation_hint":"Breadth and depth of technical skills"},
        {"key":"proof_of_work","label":"Proof of Work","derivation_hint":"Tangible hard things built"},
        {"key":"public_signal","label":"Public Signal","derivation_hint":"Open source, talks, community presence"}
    ]'::jsonb,
    'system'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_weights (schema_id, role, weights) VALUES
    ('hiring-hiring-v1', '__default__', '{"skills":0.1,"years_of_experience":0.1,"company_stages":0.08,"education_level":0.07,"schools":0.08,"hard_things_done":0.215,"hackathons":0.075,"open_source_contributions":0.1,"company_signals":0.14}'::jsonb),
    ('hiring-hiring-v1', 'AI Engineer', '{"skills":0.1,"years_of_experience":0.1,"company_stages":0.08,"education_level":0.07,"schools":0.08,"hard_things_done":0.215,"hackathons":0.075,"open_source_contributions":0.1,"company_signals":0.14}'::jsonb)
ON CONFLICT (schema_id, role) DO NOTHING;
