-- HiringPipeline v3: GraphRAG Knowledge Graph Layer
-- Adds graph_nodes, graph_edges, graph_queries tables for the knowledge graph.
-- Run AFTER migration-v2.sql.

-- ============================================================
-- 1. Enable pgvector (if available — graceful fallback)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. Graph Nodes — entities in the knowledge graph
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,        -- 'candidate', 'skill', 'company', 'trait', 'role', 'outcome', 'session', 'feedback'
    label TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_id TEXT REFERENCES trait_schemas(id) ON DELETE SET NULL,
    embedding vector(768),          -- text-embedding vector for semantic search
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_schema ON graph_nodes(schema_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON graph_nodes USING gin (to_tsvector('english', label));

-- ============================================================
-- 3. Graph Edges — relationships between nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,     -- 'has_skill', 'worked_at', 'scored_on', 'interviewed_for', 'has_trait', 'similar_to', 'has_outcome', 'received_feedback'
    weight NUMERIC DEFAULT 1.0,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_id TEXT REFERENCES trait_schemas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_relationship ON graph_edges(relationship);
CREATE INDEX IF NOT EXISTS idx_graph_edges_schema ON graph_edges(schema_id);

-- ============================================================
-- 4. Graph Queries — saved/preset query templates
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_queries (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,         -- 'talent_intelligence', 'pattern_insights', 'compounding', 'cross_domain'
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    query_template TEXT,            -- SQL template with $1, $2 params
    parameters JSONB DEFAULT '[]'::jsonb,
    is_preset BOOLEAN DEFAULT FALSE,
    schema_id TEXT REFERENCES trait_schemas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_queries_category ON graph_queries(category);

-- ============================================================
-- 5. Indexing Jobs — track data ingestion
-- ============================================================
CREATE TABLE IF NOT EXISTS graph_index_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    job_type TEXT NOT NULL,         -- 'full_reindex', 'incremental', 'single_subject'
    schema_id TEXT REFERENCES trait_schemas(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
    subjects_processed INTEGER DEFAULT 0,
    nodes_created INTEGER DEFAULT 0,
    edges_created INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. Auto-update triggers
-- ============================================================
CREATE OR REPLACE TRIGGER trg_graph_nodes_updated
    BEFORE UPDATE ON graph_nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_graph_edges_updated
    BEFORE UPDATE ON graph_edges FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. Seed preset queries
-- ============================================================
INSERT INTO graph_queries (id, category, label, description, is_preset) VALUES
    ('tq-strongest-candidates', 'talent_intelligence', 'Strongest candidates', 'Who are the highest-scoring candidates overall?', TRUE),
    ('tq-startup-bigtech', 'talent_intelligence', 'Startup + Big Tech mix', 'Which candidates have both startup and big tech experience?', TRUE),
    ('tq-role-fit', 'talent_intelligence', 'Best role fit', 'Who are the best candidates for a specific role?', TRUE),
    ('pi-winner-traits', 'pattern_insights', 'Winning traits', 'What traits do our hired candidates share?', TRUE),
    ('pi-reject-patterns', 'pattern_insights', 'Rejection patterns', 'What is the most common background of rejected candidates?', TRUE),
    ('pi-high-scorers', 'pattern_insights', 'High scorer profile', 'What does the typical high-scoring candidate look like?', TRUE),
    ('ci-weight-shifts', 'compounding', 'Weight evolution', 'How have our trait weights shifted over time?', TRUE),
    ('ci-signal-strength', 'compounding', 'Strongest signals', 'Which signals are getting stronger with more data?', TRUE),
    ('ci-learning-rate', 'compounding', 'Learning velocity', 'How fast is the system learning from new outcomes?', TRUE),
    ('cd-os-interview', 'cross_domain', 'Open source vs interviews', 'Do candidates with open source contributions score higher in interviews?', TRUE),
    ('cd-education-outcome', 'cross_domain', 'Education vs outcomes', 'Does education level correlate with hiring outcomes?', TRUE),
    ('cd-company-performance', 'cross_domain', 'Company caliber vs performance', 'Do candidates from top companies perform better?', TRUE)
ON CONFLICT (id) DO NOTHING;
