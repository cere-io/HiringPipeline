import type { CIStorage } from './interface';
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

export class MemoryStorage implements CIStorage {
  private schemas = new Map<string, TraitSchema>();
  private weights = new Map<string, DynamicWeights>();
  private traits = new Map<string, ExtractedTraits>();
  private scores = new Map<string, SubjectScore>();
  private outcomes = new Map<string, any>();
  private analyses = new Map<string, AnalysisResult>();
  private signalCatalogs = new Map<string, SignalCatalog>();
  private sourcingStatsMap = new Map<string, SourcingStats>();
  private experiments: ExperimentRun[] = [];
  private adapterConnections = new Map<string, AdapterConnection>();
  private patterns = new Map<string, any[]>();
  private events: any[] = [];
  private graphNodes = new Map<string, GraphNode>();
  private graphEdges = new Map<string, GraphEdge>();
  private graphQueries: GraphQueryTemplate[] = [
    { id: 'tq-strongest-candidates', category: 'talent_intelligence', label: 'Strongest candidates', description: 'Who are the highest-scoring candidates overall?', is_preset: true },
    { id: 'tq-startup-bigtech', category: 'talent_intelligence', label: 'Startup + Big Tech mix', description: 'Which candidates have both startup and big tech experience?', is_preset: true },
    { id: 'tq-role-fit', category: 'talent_intelligence', label: 'Best role fit', description: 'Who are the best candidates for a specific role?', is_preset: true },
    { id: 'pi-winner-traits', category: 'pattern_insights', label: 'Winning traits', description: 'What traits do our hired candidates share?', is_preset: true },
    { id: 'pi-reject-patterns', category: 'pattern_insights', label: 'Rejection patterns', description: 'What is the most common background of rejected candidates?', is_preset: true },
    { id: 'pi-high-scorers', category: 'pattern_insights', label: 'High scorer profile', description: 'What does the typical high-scoring candidate look like?', is_preset: true },
    { id: 'ci-weight-shifts', category: 'compounding', label: 'Weight evolution', description: 'How have our trait weights shifted over time?', is_preset: true },
    { id: 'ci-signal-strength', category: 'compounding', label: 'Strongest signals', description: 'Which signals are getting stronger with more data?', is_preset: true },
    { id: 'ci-learning-rate', category: 'compounding', label: 'Learning velocity', description: 'How fast is the system learning from new outcomes?', is_preset: true },
    { id: 'cd-os-interview', category: 'cross_domain', label: 'Open source vs interviews', description: 'Do candidates with open source contributions score higher in interviews?', is_preset: true },
    { id: 'cd-education-outcome', category: 'cross_domain', label: 'Education vs outcomes', description: 'Does education level correlate with hiring outcomes?', is_preset: true },
    { id: 'cd-company-performance', category: 'cross_domain', label: 'Company caliber vs performance', description: 'Do candidates from top companies perform better?', is_preset: true },
  ];
  private indexJobs = new Map<string, GraphIndexJob>();

  private k(schemaId: string, subjectId: string) { return `${schemaId}::${subjectId}`; }
  private wk(schemaId: string, role: string) { return `${schemaId}::${role}`; }

  async createSchema(input: CreateSchemaInput): Promise<TraitSchema> {
    const id = `${input.domain}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v1`;
    const now = new Date().toISOString();
    const schema: TraitSchema = {
      id,
      name: input.name,
      domain: input.domain,
      fields: input.fields,
      profile_axes: input.profile_axes,
      version: 1,
      is_active: true,
      created_by: input.created_by || 'system',
      created_at: now,
      updated_at: now,
    };
    this.schemas.set(id, schema);
    return schema;
  }

  async getSchema(id: string): Promise<TraitSchema | null> {
    return this.schemas.get(id) || null;
  }

  async listSchemas(domain?: string): Promise<TraitSchema[]> {
    const all = [...this.schemas.values()];
    return domain ? all.filter(s => s.domain === domain) : all;
  }

  async updateSchema(id: string, input: UpdateSchemaInput): Promise<TraitSchema> {
    const existing = this.schemas.get(id);
    if (!existing) throw new Error(`Schema ${id} not found`);
    const updated = { ...existing, ...input, version: existing.version + 1, updated_at: new Date().toISOString() };
    this.schemas.set(id, updated);
    return updated;
  }

  async deleteSchema(id: string): Promise<void> {
    this.schemas.delete(id);
  }

  async getWeights(schemaId: string, role: string): Promise<DynamicWeights | null> {
    return this.weights.get(this.wk(schemaId, role)) || null;
  }

  async setWeights(schemaId: string, role: string, w: DynamicWeights): Promise<void> {
    this.weights.set(this.wk(schemaId, role), w);
  }

  async listWeights(schemaId: string): Promise<Record<string, DynamicWeights>> {
    const result: Record<string, DynamicWeights> = {};
    for (const [key, val] of this.weights) {
      if (key.startsWith(`${schemaId}::`)) {
        result[key.split('::')[1]] = val;
      }
    }
    return result;
  }

  async saveTraits(t: ExtractedTraits): Promise<void> {
    this.traits.set(this.k(t.schema_id, t.subject_id), t);
  }

  async getTraits(schemaId: string, subjectId: string): Promise<ExtractedTraits | null> {
    return this.traits.get(this.k(schemaId, subjectId)) || null;
  }

  async listTraits(schemaId: string): Promise<ExtractedTraits[]> {
    return [...this.traits.values()].filter(t => t.schema_id === schemaId);
  }

  async saveScore(s: SubjectScore): Promise<void> {
    this.scores.set(this.k(s.schema_id, s.subject_id), s);
  }

  async getScore(schemaId: string, subjectId: string): Promise<SubjectScore | null> {
    return this.scores.get(this.k(schemaId, subjectId)) || null;
  }

  async listScores(schemaId: string): Promise<SubjectScore[]> {
    return [...this.scores.values()].filter(s => s.schema_id === schemaId);
  }

  async saveOutcome(schemaId: string, subjectId: string, outcome: number, role: string, feedback?: string): Promise<void> {
    this.outcomes.set(this.k(schemaId, subjectId), { outcome, feedback, role, recorded_at: new Date().toISOString() });
  }

  async getOutcome(schemaId: string, subjectId: string) {
    return this.outcomes.get(this.k(schemaId, subjectId)) || null;
  }

  async listOutcomes(schemaId: string): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const [key, val] of this.outcomes) {
      if (key.startsWith(`${schemaId}::`)) result[key.split('::')[1]] = val;
    }
    return result;
  }

  async saveAnalysis(a: AnalysisResult): Promise<void> {
    this.analyses.set(this.k(a.schema_id, a.subject_id), a);
  }

  async getAnalysis(schemaId: string, subjectId: string): Promise<AnalysisResult | null> {
    return this.analyses.get(this.k(schemaId, subjectId)) || null;
  }

  async listAnalyses(schemaId: string): Promise<AnalysisResult[]> {
    return [...this.analyses.values()].filter(a => a.schema_id === schemaId);
  }

  async getSignalCatalog(schemaId: string): Promise<SignalCatalog> {
    return this.signalCatalogs.get(schemaId) || {};
  }

  async saveSignalCatalog(schemaId: string, catalog: SignalCatalog): Promise<void> {
    this.signalCatalogs.set(schemaId, catalog);
  }

  async getSourcingStats(schemaId: string): Promise<SourcingStats> {
    return this.sourcingStatsMap.get(schemaId) || {};
  }

  async saveSourcingStats(schemaId: string, stats: SourcingStats): Promise<void> {
    this.sourcingStatsMap.set(schemaId, stats);
  }

  async saveExperiment(run: ExperimentRun): Promise<void> {
    this.experiments.push(run);
  }

  async listExperiments(schemaId: string): Promise<ExperimentRun[]> {
    return this.experiments.filter(e => e.schema_id === schemaId);
  }

  async saveAdapterConnection(conn: AdapterConnection): Promise<void> {
    this.adapterConnections.set(conn.id, conn);
  }

  async getAdapterConnection(id: string): Promise<AdapterConnection | null> {
    return this.adapterConnections.get(id) || null;
  }

  async listAdapterConnections(): Promise<AdapterConnection[]> {
    return [...this.adapterConnections.values()];
  }

  async updateAdapterConnection(id: string, updates: Partial<AdapterConnection>): Promise<void> {
    const existing = this.adapterConnections.get(id);
    if (existing) this.adapterConnections.set(id, { ...existing, ...updates });
  }

  async savePatterns(schemaId: string, clusters: any[]): Promise<void> {
    this.patterns.set(schemaId, clusters);
  }

  async getPatterns(schemaId: string): Promise<any[]> {
    return this.patterns.get(schemaId) || [];
  }

  async logEvent(id: string, eventType: string, subjectId: string | null, payload: any, source?: string): Promise<void> {
    this.events.push({ id, eventType, subjectId, payload, source, created_at: new Date().toISOString() });
  }

  // --- Graph Nodes ---
  async upsertNode(node: GraphNode): Promise<void> {
    this.graphNodes.set(node.id, node);
  }

  async upsertNodes(nodes: GraphNode[]): Promise<void> {
    for (const n of nodes) this.graphNodes.set(n.id, n);
  }

  async getNode(id: string): Promise<GraphNode | null> {
    return this.graphNodes.get(id) || null;
  }

  async listNodes(opts?: { type?: string; schemaId?: string; limit?: number }): Promise<GraphNode[]> {
    let nodes = [...this.graphNodes.values()];
    if (opts?.type) nodes = nodes.filter(n => n.node_type === opts.type);
    if (opts?.schemaId) nodes = nodes.filter(n => n.schema_id === opts.schemaId);
    if (opts?.limit) nodes = nodes.slice(0, opts.limit);
    return nodes;
  }

  async deleteNode(id: string): Promise<void> {
    this.graphNodes.delete(id);
    for (const [eid, edge] of this.graphEdges) {
      if (edge.source_id === id || edge.target_id === id) this.graphEdges.delete(eid);
    }
  }

  // --- Graph Edges ---
  async upsertEdge(edge: GraphEdge): Promise<void> {
    this.graphEdges.set(edge.id, edge);
  }

  async listEdges(opts?: { sourceId?: string; targetId?: string; relationship?: string; schemaId?: string }): Promise<GraphEdge[]> {
    let edges = [...this.graphEdges.values()];
    if (opts?.sourceId) edges = edges.filter(e => e.source_id === opts.sourceId);
    if (opts?.targetId) edges = edges.filter(e => e.target_id === opts.targetId);
    if (opts?.relationship) edges = edges.filter(e => e.relationship === opts.relationship);
    if (opts?.schemaId) edges = edges.filter(e => e.schema_id === opts.schemaId);
    return edges;
  }

  async upsertEdges(edges: GraphEdge[]): Promise<void> {
    for (const e of edges) this.graphEdges.set(e.id, e);
  }

  async deleteEdge(id: string): Promise<void> {
    this.graphEdges.delete(id);
  }

  async getGraphForSchema(schemaId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return {
      nodes: await this.listNodes({ schemaId }),
      edges: await this.listEdges({ schemaId }),
    };
  }

  async getGraphStats(schemaId?: string): Promise<GraphStats> {
    const nodes = schemaId ? [...this.graphNodes.values()].filter(n => n.schema_id === schemaId) : [...this.graphNodes.values()];
    const edges = schemaId ? [...this.graphEdges.values()].filter(e => e.schema_id === schemaId) : [...this.graphEdges.values()];
    const nodesByType: Record<string, number> = {};
    for (const n of nodes) nodesByType[n.node_type] = (nodesByType[n.node_type] || 0) + 1;
    const edgesByRel: Record<string, number> = {};
    for (const e of edges) edgesByRel[e.relationship] = (edgesByRel[e.relationship] || 0) + 1;
    return { total_nodes: nodes.length, total_edges: edges.length, nodes_by_type: nodesByType, edges_by_relationship: edgesByRel };
  }

  // --- Graph Queries ---
  async listGraphQueries(category?: string): Promise<GraphQueryTemplate[]> {
    if (category) return this.graphQueries.filter(q => q.category === category);
    return this.graphQueries;
  }

  async executeRawQuery(_sql: string): Promise<any[]> {
    return [];
  }

  // --- Index Jobs ---
  async saveIndexJob(job: GraphIndexJob): Promise<void> {
    this.indexJobs.set(job.id, job);
  }

  async updateIndexJob(id: string, updates: Partial<GraphIndexJob>): Promise<void> {
    const existing = this.indexJobs.get(id);
    if (existing) this.indexJobs.set(id, { ...existing, ...updates });
  }

  async listIndexJobs(schemaId?: string): Promise<GraphIndexJob[]> {
    let jobs = [...this.indexJobs.values()];
    if (schemaId) jobs = jobs.filter(j => j.schema_id === schemaId);
    return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
