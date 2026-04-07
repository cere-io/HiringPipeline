-- HiringPipeline: Drop Legacy v1 Tables
-- Run AFTER deploying code that uses v2 ci_* tables exclusively.
--
-- WHAT REMAINS AFTER THIS MIGRATION (15 tables):
--   v2 Core:      trait_schemas, schema_weights, ci_traits, ci_scores, ci_analyses,
--                  ci_outcomes, ci_signals, ci_sourcing_stats
--   v2 Ops:       ci_experiments, ci_adapter_connections, pipeline_events
--   v3 Graph:     graph_nodes, graph_edges, graph_queries, graph_index_jobs
--
-- WHAT IS DROPPED (7 legacy v1 tables):
--   candidate_traits, candidate_scores, interview_analyses,
--   candidate_outcomes, candidate_statuses, role_weights, sourcing_stats

-- 1. Drop triggers on v1 tables
DROP TRIGGER IF EXISTS trg_candidate_traits_updated ON candidate_traits;
DROP TRIGGER IF EXISTS trg_candidate_scores_updated ON candidate_scores;
DROP TRIGGER IF EXISTS trg_interview_analyses_updated ON interview_analyses;
DROP TRIGGER IF EXISTS trg_candidate_outcomes_updated ON candidate_outcomes;
DROP TRIGGER IF EXISTS trg_candidate_statuses_updated ON candidate_statuses;
DROP TRIGGER IF EXISTS trg_role_weights_updated ON role_weights;
DROP TRIGGER IF EXISTS trg_sourcing_stats_updated ON sourcing_stats;

-- 2. Drop v1 tables (CASCADE removes dependent indexes)
DROP TABLE IF EXISTS candidate_traits CASCADE;
DROP TABLE IF EXISTS candidate_scores CASCADE;
DROP TABLE IF EXISTS interview_analyses CASCADE;
DROP TABLE IF EXISTS candidate_outcomes CASCADE;
DROP TABLE IF EXISTS candidate_statuses CASCADE;
DROP TABLE IF EXISTS role_weights CASCADE;
DROP TABLE IF EXISTS sourcing_stats CASCADE;
