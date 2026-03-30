import type { TraitSchema, ExtractedTraits, SubjectScore, DistillationResult, AnalysisResult, DynamicWeights, TraitCluster, GraphQueryResult, GraphIndexJob, GraphStats } from './types';
import type { LLMProvider } from './llm/interface';
import type { CIStorage } from './storage/interface';
import { Extractor } from './agents/extractor';
import { Scorer } from './agents/scorer';
import { Distiller } from './agents/distiller';
import { Analyzer } from './agents/analyzer';
import { PatternDiscovery } from './agents/pattern-discovery';
import { GraphIndexer } from './agents/indexer';
import { GraphQueryEngine } from './agents/query-engine';
import { SchemaRegistry } from './schema/registry';

export interface CIConfig {
  llm: LLMProvider;
  storage: CIStorage;
}

export class CompoundIntelligence {
  public schemas: SchemaRegistry;
  public graphIndexer: GraphIndexer;
  public graphQuery: GraphQueryEngine;
  private extractor: Extractor;
  private scorer: Scorer;
  private distiller: Distiller;
  private analyzer: Analyzer;
  private patternDiscovery: PatternDiscovery;
  private storage: CIStorage;

  constructor(config: CIConfig) {
    this.storage = config.storage;
    this.schemas = new SchemaRegistry(config.storage);
    this.extractor = new Extractor(config.llm, config.storage);
    this.scorer = new Scorer(config.llm, config.storage);
    this.distiller = new Distiller(config.llm, config.storage);
    this.analyzer = new Analyzer(config.llm, config.storage);
    this.patternDiscovery = new PatternDiscovery(config.llm, config.storage);
    this.graphIndexer = new GraphIndexer(config.storage);
    this.graphQuery = new GraphQueryEngine(config.llm, config.storage);
  }

  async extract(opts: { schema: TraitSchema; subjectId: string; text: string; role: string }): Promise<ExtractedTraits> {
    return this.extractor.extract(opts);
  }

  async score(opts: { schema: TraitSchema; subjectId: string; role: string; traits?: ExtractedTraits }): Promise<SubjectScore> {
    return this.scorer.score(opts);
  }

  async distill(opts: {
    schema: TraitSchema;
    subjectId: string;
    role: string;
    outcome: number;
    feedback?: string;
    reasons?: string[];
    source?: string;
    isPerformanceReview?: boolean;
  }): Promise<DistillationResult> {
    return this.distiller.distill(opts);
  }

  async analyze(opts: { schema: TraitSchema; subjectId: string; text: string; role: string }): Promise<AnalysisResult> {
    return this.analyzer.analyze(opts);
  }

  async getWeights(schemaId: string, role: string): Promise<DynamicWeights> {
    return this.schemas.getWeightsForRole(schemaId, role);
  }

  async getAllWeights(schemaId: string): Promise<Record<string, DynamicWeights>> {
    return this.storage.listWeights(schemaId);
  }

  async discoverPatterns(schema: TraitSchema): Promise<TraitCluster[]> {
    const [traits, scores] = await Promise.all([
      this.storage.listTraits(schema.id),
      this.storage.listScores(schema.id),
    ]);
    return this.patternDiscovery.discover({ schema, traits, scores });
  }

  async getPatterns(schemaId: string): Promise<TraitCluster[]> {
    return this.storage.getPatterns(schemaId);
  }

  async getAnalytics(schemaId: string) {
    const [traits, scores, outcomes, analyses, signals, sourcingStats] = await Promise.all([
      this.storage.listTraits(schemaId),
      this.storage.listScores(schemaId),
      this.storage.listOutcomes(schemaId),
      this.storage.listAnalyses(schemaId),
      this.storage.getSignalCatalog(schemaId),
      this.storage.getSourcingStats(schemaId),
    ]);
    const weights = await this.storage.listWeights(schemaId);
    return { traits, scores, outcomes, analyses, signals, sourcingStats, weights };
  }

  // ── GraphRAG Methods ────────────────────────────────────────

  async indexSchema(schema: TraitSchema): Promise<GraphIndexJob> {
    return this.graphIndexer.fullReindex(schema);
  }

  async queryGraph(question: string, schemaId: string): Promise<GraphQueryResult> {
    return this.graphQuery.query({ question, schemaId });
  }

  async queryPreset(presetId: string, schemaId: string): Promise<GraphQueryResult> {
    return this.graphQuery.executePreset({ presetId, schemaId });
  }

  async getGraphData(schemaId: string) {
    return this.storage.getGraphForSchema(schemaId);
  }

  async getGraphStats(schemaId?: string): Promise<GraphStats> {
    return this.storage.getGraphStats(schemaId);
  }

  async getGraphQueries(category?: string) {
    return this.storage.listGraphQueries(category);
  }

  async getIndexJobs(schemaId?: string) {
    return this.storage.listIndexJobs(schemaId);
  }
}

export type { TraitSchema, TraitField, ProfileAxis, ExtractedTraits, SubjectScore, DistillationResult, AnalysisResult, DynamicWeights, DynamicTraits, TraitSignal, SignalCatalog, SourcingStats, ExperimentRun, AdapterConnection, TraitCluster, GraphNode, GraphEdge, GraphQueryResult, GraphQueryTemplate, GraphIndexJob, GraphStats, GraphNodeType, GraphRelationship } from './types';
export type { CreateSchemaInput, UpdateSchemaInput } from './schema/types';
export type { LLMProvider, LLMRequest, LLMResponse } from './llm/interface';
export type { CIStorage } from './storage/interface';
export { GeminiProvider } from './llm/gemini';
export { MemoryStorage } from './storage/memory';
export { PostgresStorage } from './storage/postgres';
export { SchemaRegistry, PRESET_SCHEMAS } from './schema/registry';
export { Extractor } from './agents/extractor';
export { Scorer } from './agents/scorer';
export { Distiller } from './agents/distiller';
export { Analyzer } from './agents/analyzer';
export { GraphIndexer } from './agents/indexer';
export { GraphQueryEngine } from './agents/query-engine';
