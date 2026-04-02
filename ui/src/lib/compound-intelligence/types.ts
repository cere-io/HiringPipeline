/** Domain-agnostic types for the Compound Intelligence SDK. */

export interface TraitField {
  key: string;
  label: string;
  type: 'string[]' | 'number' | 'rating' | 'category' | 'boolean';
  extraction_hint: string;
  values?: string[];
  default_weight: number;
}

export interface TraitSchema {
  id: string;
  name: string;
  domain: string;
  fields: TraitField[];
  profile_axes?: ProfileAxis[];
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileAxis {
  key: string;
  label: string;
  derivation_hint: string;
}

export type DynamicWeights = Record<string, number>;
export type DynamicTraits = Record<string, any>;

export interface ExtractedTraits {
  subject_id: string;
  schema_id: string;
  traits: DynamicTraits;
  profile_scores?: Record<string, number>;
  subject_name?: string;
  subject_meta?: Record<string, any>;
  extracted_at: string;
}

export interface SubjectScore {
  subject_id: string;
  schema_id: string;
  role: string;
  composite_score: number;
  reasoning: string;
  weights_used: DynamicWeights;
  scored_at: string;
}

export interface DistillationResult {
  schema_id: string;
  role: string;
  previous_weights: DynamicWeights;
  new_weights: DynamicWeights;
  signals_indexed: number;
}

export interface AnalysisResult {
  subject_id: string;
  schema_id: string;
  scores: Record<string, number>;
  summary: string;
  flags: string[];
  analyzed_at: string;
}

export interface TraitSignal {
  id: string;
  signal: string;
  trait_key: string;
  direction: 'positive' | 'negative';
  strength: number;
  occurrence_count: number;
  subject_ids: string[];
  avg_outcome: number;
  outcome_entries: Array<{ subject_id: string; outcome: number; timestamp: string }>;
  first_seen: string;
  last_seen: string;
}

export interface SignalCatalog {
  [signalId: string]: TraitSignal;
}

export interface SourcingStats {
  [source: string]: {
    total_subjects: number;
    avg_ai_score: number;
    avg_human_score: number;
    avg_performance_score: number;
    performance_review_count: number;
    hired_count: number;
  };
}

export interface ExperimentRun {
  id: string;
  schema_id: string;
  subject_id: string;
  adapter_source: string;
  ai_score: number;
  external_score: number | null;
  human_decision: 'hired' | 'rejected' | 'pending';
  ai_recommendation: 'strong_yes' | 'yes' | 'maybe' | 'no';
  correlation_correct: boolean | null;
  created_at: string;
}

export interface DrillDownItem {
  label: string;
  value: string;
  subjects: string[];
}

export interface TraitCluster {
  id: string;
  label: string;
  description: string;
  parent_trait: string;
  trait_keys: string[];
  trait_conditions: Record<string, string>;
  matching_subjects: string[];
  avg_score: number;
  winner_count: number;
  reject_count: number;
  pending_count: number;
  cluster_id?: string;
  drill_down?: DrillDownItem[];
}

export interface AdapterConnection {
  id: string;
  adapter_type: string;
  schema_id: string;
  config: Record<string, any>;
  is_active: boolean;
  last_poll_at: string | null;
  subjects_processed: number;
  created_at: string;
}

// ── GraphRAG Types ──────────────────────────────────────────────

export type GraphNodeType = 'candidate' | 'skill' | 'company' | 'trait' | 'role' | 'outcome' | 'session' | 'feedback' | 'evaluator' | 'skill_category' | 'signal';

export interface GraphNode {
  id: string;
  node_type: GraphNodeType;
  label: string;
  properties: Record<string, any>;
  schema_id?: string;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export type GraphRelationship =
  | 'has_skill' | 'worked_at' | 'scored_on' | 'interviewed_for'
  | 'has_trait' | 'similar_to' | 'has_outcome' | 'received_feedback'
  | 'applied_for' | 'has_education' | 'belongs_to_cluster'
  | 'evaluated_by' | 'has_signal';

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: GraphRelationship;
  weight: number;
  properties: Record<string, any>;
  schema_id?: string;
  created_at: string;
  updated_at: string;
}

export interface GraphQueryTemplate {
  id: string;
  category: string;
  label: string;
  description: string;
  query_template?: string;
  parameters?: any[];
  is_preset: boolean;
  schema_id?: string;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  answer?: string;
  sql_generated?: string;
  metadata?: Record<string, any>;
}

export interface GraphIndexJob {
  id: string;
  job_type: 'full_reindex' | 'incremental' | 'single_subject';
  schema_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  subjects_processed: number;
  nodes_created: number;
  edges_created: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_relationship: Record<string, number>;
  last_indexed_at?: string;
}
