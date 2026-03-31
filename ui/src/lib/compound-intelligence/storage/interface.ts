import type {
  TraitSchema,
  DynamicWeights,
  ExtractedTraits,
  SubjectScore,
  AnalysisResult,
  SignalCatalog,
  SourcingStats,
  ExperimentRun,
  AdapterConnection,
  GraphNode,
  GraphEdge,
  GraphQueryTemplate,
  GraphIndexJob,
  GraphStats,
} from '../types';
import type { CreateSchemaInput, UpdateSchemaInput } from '../schema/types';

/**
 * Abstract storage interface for the Compound Intelligence SDK.
 * Implementations: MemoryStorage (dev), PostgresStorage (prod).
 */
export interface CIStorage {
  // Schemas
  createSchema(input: CreateSchemaInput): Promise<TraitSchema>;
  getSchema(id: string): Promise<TraitSchema | null>;
  listSchemas(domain?: string): Promise<TraitSchema[]>;
  updateSchema(id: string, input: UpdateSchemaInput): Promise<TraitSchema>;
  deleteSchema(id: string): Promise<void>;

  // Weights
  getWeights(schemaId: string, role: string): Promise<DynamicWeights | null>;
  setWeights(schemaId: string, role: string, weights: DynamicWeights): Promise<void>;
  listWeights(schemaId: string): Promise<Record<string, DynamicWeights>>;

  // Extracted traits
  saveTraits(traits: ExtractedTraits): Promise<void>;
  getTraits(schemaId: string, subjectId: string): Promise<ExtractedTraits | null>;
  listTraits(schemaId: string): Promise<ExtractedTraits[]>;

  // Scores
  saveScore(score: SubjectScore): Promise<void>;
  getScore(schemaId: string, subjectId: string): Promise<SubjectScore | null>;
  listScores(schemaId: string): Promise<SubjectScore[]>;

  // Outcomes
  saveOutcome(schemaId: string, subjectId: string, outcome: number, role: string, feedback?: string, isPerformanceReview?: boolean): Promise<void>;
  getOutcome(schemaId: string, subjectId: string): Promise<{ outcome: number; feedback?: string; role: string; recorded_at: string } | null>;
  listOutcomes(schemaId: string): Promise<Record<string, any>>;

  // Analysis (interviews, documents)
  saveAnalysis(analysis: AnalysisResult): Promise<void>;
  getAnalysis(schemaId: string, subjectId: string): Promise<AnalysisResult | null>;
  listAnalyses(schemaId: string): Promise<AnalysisResult[]>;

  // Signals
  getSignalCatalog(schemaId: string): Promise<SignalCatalog>;
  saveSignalCatalog(schemaId: string, catalog: SignalCatalog): Promise<void>;

  // Sourcing stats
  getSourcingStats(schemaId: string): Promise<SourcingStats>;
  saveSourcingStats(schemaId: string, stats: SourcingStats): Promise<void>;

  // Experiments
  saveExperiment(run: ExperimentRun): Promise<void>;
  listExperiments(schemaId: string): Promise<ExperimentRun[]>;

  // Adapters
  saveAdapterConnection(conn: AdapterConnection): Promise<void>;
  getAdapterConnection(id: string): Promise<AdapterConnection | null>;
  listAdapterConnections(): Promise<AdapterConnection[]>;
  updateAdapterConnection(id: string, updates: Partial<AdapterConnection>): Promise<void>;

  // Patterns
  savePatterns(schemaId: string, clusters: import('../types').TraitCluster[]): Promise<void>;
  getPatterns(schemaId: string): Promise<import('../types').TraitCluster[]>;

  // Events
  logEvent(id: string, eventType: string, subjectId: string | null, payload: any, source?: string): Promise<void>;

  // ── Graph Storage ────────────────────────────────────────────
  upsertNode(node: GraphNode): Promise<void>;
  upsertNodes(nodes: GraphNode[]): Promise<void>;
  getNode(id: string): Promise<GraphNode | null>;
  listNodes(opts?: { type?: string; schemaId?: string; limit?: number }): Promise<GraphNode[]>;
  deleteNode(id: string): Promise<void>;

  upsertEdge(edge: GraphEdge): Promise<void>;
  upsertEdges(edges: GraphEdge[]): Promise<void>;
  listEdges(opts?: { sourceId?: string; targetId?: string; relationship?: string; schemaId?: string }): Promise<GraphEdge[]>;
  deleteEdge(id: string): Promise<void>;

  getGraphForSchema(schemaId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  clearGraph(schemaId: string): Promise<void>;
  getGraphStats(schemaId?: string): Promise<GraphStats>;

  listGraphQueries(category?: string): Promise<GraphQueryTemplate[]>;
  executeRawQuery(sql: string): Promise<any[]>;

  saveIndexJob(job: GraphIndexJob): Promise<void>;
  updateIndexJob(id: string, updates: Partial<GraphIndexJob>): Promise<void>;
  listIndexJobs(schemaId?: string): Promise<GraphIndexJob[]>;
}
