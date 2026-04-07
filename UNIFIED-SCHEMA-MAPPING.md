# HR Use Case — Mapping to Unified Schema

## Current State: 22 Supabase Tables → Unified: nodes + edges + embeddings

---

## How the 22 Tables Map

Every existing table becomes either **properties on a node**, an **edge**, or gets **merged into an existing node**. Here's the full mapping:

### Tables That Become Node Types

| Current Table | → Node Type | Properties on the Node |
|--------------|-------------|----------------------|
| `ci_traits` + `candidate_traits` | `candidate` | name, role, status, linkedin, skills[], years_of_experience, company_stages[], education_level, schools (items + rating), hard_things_done (items + rating), hackathons (items + rating), open_source (items + rating), company_signals (items + rating), source_completeness, dimensions |
| `ci_scores` + `candidate_scores` | *(merged into `candidate` node)* | composite_score, reasoning, weights_used, scored_at |
| `ci_analyses` + `interview_analyses` | *(merged into `candidate` node)* | technical_depth, communication_clarity, cultural_fit, problem_solving, startup_fit, summary, red_flags, analyzed_at |
| `ci_outcomes` + `candidate_outcomes` | *(merged into `candidate` node)* | outcome, feedback, is_performance_review, human_feedback_score |
| `candidate_statuses` | *(merged into `candidate` node)* | stage, rejected_at_stage, rejection_reasons |
| `trait_schemas` | `schema` | name, domain, fields[], profile_axes[], version, is_active |
| `role_weights` + `schema_weights` | `weight_config` | role, weights (per-trait weight values) |
| `sourcing_stats` + `ci_sourcing_stats` | `source_channel` | source_name, total_candidates, avg_ai_score, avg_human_score, avg_performance_score, hired_count |
| `ci_signals` | `signal` | signal_text, direction (positive/negative), strength, occurrence_count, avg_outcome |
| `ci_experiments` | `experiment` | adapter_source, ai_score, external_score, human_decision, ai_recommendation, correlation_correct |
| `ci_adapter_connections` | `adapter` | adapter_type, config, is_active, last_poll_at, subjects_processed |
| `pipeline_events` | `event` | event_type, payload, source, created_at |
| `graph_queries` | `query_template` | category, label, description, query_template, parameters, is_preset |
| `graph_index_jobs` | `index_job` | job_type, status, subjects_processed, nodes_created, edges_created, error_message |

**Key merge:** 5 current tables (`ci_traits`, `ci_scores`, `ci_analyses`, `ci_outcomes`, `candidate_statuses`) all collapse into a single **`candidate`** node with flat properties. This is the biggest simplification.

### Tables That Become Edge Types

| Current Table / Relationship | → Edge Type | From → To | Weight / Properties |
|-----------------------------|-------------|-----------|-------------------|
| `graph_edges` (similar_to) | `similar_to` | candidate → candidate | weight (0–1, cosine + jaccard) |
| `graph_edges` (has_skill) | `has_skill` | candidate → skill_category | — |
| `graph_edges` (has_signal) | `has_signal` | candidate → signal | — |
| `graph_edges` (applied_for) | `applied_for` | candidate → role | — |
| `graph_edges` (evaluated_by) | `evaluated_by` | candidate → evaluator | — |
| *(new)* | `uses_schema` | candidate → schema | schema_id link |
| *(new)* | `scored_with` | candidate → weight_config | role |
| *(new)* | `from_source` | candidate → source_channel | — |
| *(new)* | `tracked_by` | experiment → candidate | — |
| *(new)* | `triggered_by` | event → candidate | event_type |

### Embeddings (Virtual Table)

| Attached To | Dimension | What It's Used For |
|------------|-----------|-------------------|
| `candidate` nodes | 768 | Semantic similarity search, "find candidates like X" |
| `signal` nodes | 768 | Find similar human feedback patterns |

---

## The Unified Schema (SQLite / Turso)

### `nodes` table

```sql
CREATE TABLE nodes (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,  -- candidate, schema, signal, role, skill_category, ...
  label         TEXT NOT NULL,  -- display name
  properties    TEXT NOT NULL DEFAULT '{}',  -- JSON blob of all type-specific properties
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nodes_type ON nodes(type);
```

### `edges` table

```sql
CREATE TABLE edges (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES nodes(id),
  target_id     TEXT NOT NULL REFERENCES nodes(id),
  relationship  TEXT NOT NULL,  -- similar_to, has_skill, applied_for, ...
  weight        REAL DEFAULT 1.0,
  properties    TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, relationship)
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_rel ON edges(relationship);
```

### `embeddings` (virtual — via libsql vector extension)

```sql
-- Virtual column on nodes for vector similarity
-- libsql supports vector type natively
ALTER TABLE nodes ADD COLUMN embedding F32_BLOB(768);

CREATE INDEX idx_nodes_embedding ON nodes(libsql_vector_idx(embedding));
```

---

## What a Candidate Looks Like in the Unified Schema

### The `candidate` node (one row replaces 5 current tables)

```json
{
  "id": "candidate-notion-333d800083d6807fa592f94d8a9d",
  "type": "candidate",
  "label": "Oliver Weber",
  "properties": {
    "source": "notion",
    "role": "Blockchain Engineer",
    "status": "in_progress",
    "linkedin": "https://linkedin.com/in/oliverweber",

    "skills": ["Rust", "Go", "Swift", "TypeScript"],
    "years_of_experience": 6,
    "company_stages": ["startup", "growth"],
    "education_level": "Bachelors",
    "schools": {"items": ["TU Munich"], "rating": 7},
    "hard_things_done": {"items": ["Built distributed consensus engine"], "rating": 8},
    "hackathons": {"items": [], "rating": 0},
    "open_source": {"items": ["Contributor to tokio-rs"], "rating": 6},
    "company_signals": {"items": ["Series B fintech", "YC W22"], "rating": 7},

    "profile_dna": {
      "education": 5,
      "company_caliber": 7,
      "career_arc": 7,
      "technical_depth": 8,
      "proof_of_work": 8,
      "public_signal": 4
    },

    "composite_score": 7.2,
    "reasoning": "Strong systems background with Rust/Go...",

    "interview_scores": {
      "technical_depth": 8,
      "communication_clarity": 7,
      "cultural_fit": 7,
      "problem_solving": 8
    },
    "startup_fit": {
      "action_speed": 8, "autonomy": 9, "judgment": 7,
      "communication": 7, "coachability": 8, "drive_grit": 9
    },
    "red_flags": ["Limited frontend experience"],

    "human_feedback_score": 7,
    "outcome": null,
    "stage": "interview",

    "evaluations": [
      {
        "author": "Valerie",
        "score": 7,
        "verdict": "positive",
        "strengths": ["Deep Rust expertise", "Startup mentality"],
        "risks": ["No team lead experience"]
      }
    ]
  }
}
```

### Edges for this candidate

| Edge | From | To | Relationship | Weight |
|------|------|-----|-------------|--------|
| 1 | Oliver Weber | Backend & Systems | `has_skill` | 1.0 |
| 2 | Oliver Weber | Blockchain & Web3 | `has_skill` | 1.0 |
| 3 | Oliver Weber | Blockchain Engineer | `applied_for` | 1.0 |
| 4 | Oliver Weber | "Deep Rust expertise" (signal) | `has_signal` | 1.0 |
| 5 | Oliver Weber | "No team lead exp" (signal) | `has_signal` | 1.0 |
| 6 | Oliver Weber | Jane Doe | `similar_to` | 0.72 |
| 7 | Oliver Weber | Valerie | `evaluated_by` | 1.0 |

---

## Node Types Summary (for Sergey)

| Node Type | Count (approx) | What It Is | Key Properties |
|-----------|---------------|------------|----------------|
| `candidate` | ~100s | A person in the pipeline | All traits, scores, interview analysis, outcome, feedback — everything about this person |
| `role` | ~5–10 | A position | role_name |
| `skill_category` | ~10–15 | A skill group | label (e.g. "Backend & Systems") |
| `signal` | ~50–200 | A human insight | signal_text, direction, polarity |
| `evaluator` | ~3–5 | A human reviewer | name |
| `schema` | 1 | The extraction blueprint | fields, profile_axes |
| `weight_config` | ~5–10 | Learned weights per role | role, weights{} |
| `source_channel` | ~3–5 | A sourcing channel | avg_scores, hired_count |
| `adapter` | ~1–3 | A connected data source | adapter_type, config |
| `experiment` | ~100s | An AI vs human comparison | ai_score, human_decision |
| `event` | ~1000s | A pipeline action | event_type, payload |
| `query_template` | ~10 | A saved graph query | query_template, parameters |
| `index_job` | ~10s | An indexing run | status, nodes_created |

### Edge Types Summary

| Edge Type | Connects | What It Means |
|-----------|----------|--------------|
| `similar_to` | candidate ↔ candidate | Profile similarity (cosine + jaccard) |
| `has_skill` | candidate → skill_category | Person has this skill group |
| `has_signal` | candidate → signal | Human observed this strength/risk |
| `applied_for` | candidate → role | Applied for this position |
| `evaluated_by` | candidate → evaluator | Reviewed by this person |
| `uses_schema` | candidate → schema | Extracted with this schema |
| `scored_with` | candidate → weight_config | Scored using these weights |
| `from_source` | candidate → source_channel | Came from this hiring channel |

---

## Current State (Post-Cleanup)

Legacy v1 tables have been dropped. The codebase now exclusively uses v2 tables.

**15 active tables (Supabase):**
- v2 Core: `trait_schemas`, `schema_weights`, `ci_traits`, `ci_scores`, `ci_analyses`, `ci_outcomes`, `ci_signals`, `ci_sourcing_stats`
- v2 Ops: `ci_experiments`, `ci_adapter_connections`, `pipeline_events`
- v3 Graph: `graph_nodes`, `graph_edges`, `graph_queries`, `graph_index_jobs`

**7 dropped tables:** `candidate_traits`, `candidate_scores`, `interview_analyses`, `candidate_outcomes`, `candidate_statuses`, `role_weights`, `sourcing_stats`
