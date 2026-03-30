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
import { supabase } from '../../supabase';

export class PostgresStorage implements CIStorage {

  // --- Schemas ---
  async createSchema(input: CreateSchemaInput): Promise<TraitSchema> {
    const id = `${input.domain}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v1`;
    const row = {
      id,
      name: input.name,
      domain: input.domain,
      fields: input.fields,
      profile_axes: input.profile_axes || null,
      version: 1,
      is_active: true,
      created_by: input.created_by || 'system',
    };
    const { data, error } = await supabase.from('trait_schemas').insert(row).select().single();
    if (error) throw new Error(`Failed to create schema: ${error.message}`);
    return data as TraitSchema;
  }

  async getSchema(id: string): Promise<TraitSchema | null> {
    const { data, error } = await supabase.from('trait_schemas').select('*').eq('id', id).single();
    if (error) return null;
    return data as TraitSchema;
  }

  async listSchemas(domain?: string): Promise<TraitSchema[]> {
    let q = supabase.from('trait_schemas').select('*').eq('is_active', true);
    if (domain) q = q.eq('domain', domain);
    const { data } = await q.order('created_at', { ascending: false });
    return (data || []) as TraitSchema[];
  }

  async updateSchema(id: string, input: UpdateSchemaInput): Promise<TraitSchema> {
    const existing = await this.getSchema(id);
    if (!existing) throw new Error(`Schema ${id} not found`);
    const updates: any = { ...input, version: existing.version + 1, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('trait_schemas').update(updates).eq('id', id).select().single();
    if (error) throw new Error(`Failed to update schema: ${error.message}`);
    return data as TraitSchema;
  }

  async deleteSchema(id: string): Promise<void> {
    await supabase.from('trait_schemas').update({ is_active: false }).eq('id', id);
  }

  // --- Weights ---
  async getWeights(schemaId: string, role: string): Promise<DynamicWeights | null> {
    const { data } = await supabase.from('schema_weights').select('weights').eq('schema_id', schemaId).eq('role', role).single();
    return data?.weights || null;
  }

  async setWeights(schemaId: string, role: string, weights: DynamicWeights): Promise<void> {
    await supabase.from('schema_weights').upsert({ schema_id: schemaId, role, weights }, { onConflict: 'schema_id,role' });
  }

  async listWeights(schemaId: string): Promise<Record<string, DynamicWeights>> {
    const { data } = await supabase.from('schema_weights').select('role, weights').eq('schema_id', schemaId);
    const result: Record<string, DynamicWeights> = {};
    for (const row of data || []) result[row.role] = row.weights;
    return result;
  }

  // --- Traits ---
  async saveTraits(t: ExtractedTraits): Promise<void> {
    const { error } = await supabase.from('ci_traits').upsert({
      subject_id: t.subject_id,
      schema_id: t.schema_id,
      traits: t.traits,
      profile_scores: t.profile_scores || null,
      subject_name: t.subject_name || null,
      subject_meta: t.subject_meta || null,
      extracted_at: t.extracted_at,
    }, { onConflict: 'schema_id,subject_id' });
    if (error) console.error('[PostgresStorage] saveTraits failed:', error.message);
  }

  async getTraits(schemaId: string, subjectId: string): Promise<ExtractedTraits | null> {
    const { data } = await supabase.from('ci_traits').select('*').eq('schema_id', schemaId).eq('subject_id', subjectId).single();
    if (!data) return null;
    return { subject_id: data.subject_id, schema_id: data.schema_id, traits: data.traits, profile_scores: data.profile_scores, subject_name: data.subject_name, subject_meta: data.subject_meta, extracted_at: data.extracted_at };
  }

  async listTraits(schemaId: string): Promise<ExtractedTraits[]> {
    const { data } = await supabase.from('ci_traits').select('*').eq('schema_id', schemaId);
    return (data || []).map((d: any) => ({ subject_id: d.subject_id, schema_id: d.schema_id, traits: d.traits, profile_scores: d.profile_scores, subject_name: d.subject_name, subject_meta: d.subject_meta, extracted_at: d.extracted_at }));
  }

  // --- Scores ---
  async saveScore(s: SubjectScore): Promise<void> {
    await supabase.from('ci_scores').upsert({
      subject_id: s.subject_id, schema_id: s.schema_id, role: s.role,
      composite_score: s.composite_score, reasoning: s.reasoning,
      weights_used: s.weights_used, scored_at: s.scored_at,
    }, { onConflict: 'schema_id,subject_id' });
  }

  async getScore(schemaId: string, subjectId: string): Promise<SubjectScore | null> {
    const { data } = await supabase.from('ci_scores').select('*').eq('schema_id', schemaId).eq('subject_id', subjectId).single();
    if (!data) return null;
    return { subject_id: data.subject_id, schema_id: data.schema_id, role: data.role, composite_score: data.composite_score, reasoning: data.reasoning, weights_used: data.weights_used, scored_at: data.scored_at };
  }

  async listScores(schemaId: string): Promise<SubjectScore[]> {
    const { data } = await supabase.from('ci_scores').select('*').eq('schema_id', schemaId).order('composite_score', { ascending: false });
    return (data || []).map((d: any) => ({ subject_id: d.subject_id, schema_id: d.schema_id, role: d.role, composite_score: d.composite_score, reasoning: d.reasoning, weights_used: d.weights_used, scored_at: d.scored_at }));
  }

  // --- Outcomes ---
  async saveOutcome(schemaId: string, subjectId: string, outcome: number, role: string, feedback?: string, isPerformanceReview?: boolean): Promise<void> {
    await supabase.from('ci_outcomes').upsert({
      schema_id: schemaId, subject_id: subjectId, outcome, role,
      feedback: feedback || null, is_performance_review: isPerformanceReview || false,
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'schema_id,subject_id' });
  }

  async getOutcome(schemaId: string, subjectId: string) {
    const { data } = await supabase.from('ci_outcomes').select('*').eq('schema_id', schemaId).eq('subject_id', subjectId).single();
    return data ? { outcome: data.outcome, feedback: data.feedback, role: data.role, recorded_at: data.recorded_at } : null;
  }

  async listOutcomes(schemaId: string): Promise<Record<string, any>> {
    const { data } = await supabase.from('ci_outcomes').select('*').eq('schema_id', schemaId);
    const result: Record<string, any> = {};
    for (const row of data || []) result[row.subject_id] = row;
    return result;
  }

  // --- Analysis ---
  async saveAnalysis(a: AnalysisResult): Promise<void> {
    await supabase.from('ci_analyses').upsert({
      subject_id: a.subject_id, schema_id: a.schema_id,
      scores: a.scores, summary: a.summary, flags: a.flags,
      analyzed_at: a.analyzed_at,
    }, { onConflict: 'schema_id,subject_id' });
  }

  async getAnalysis(schemaId: string, subjectId: string): Promise<AnalysisResult | null> {
    const { data } = await supabase.from('ci_analyses').select('*').eq('schema_id', schemaId).eq('subject_id', subjectId).single();
    if (!data) return null;
    return { subject_id: data.subject_id, schema_id: data.schema_id, scores: data.scores, summary: data.summary, flags: data.flags, analyzed_at: data.analyzed_at };
  }

  async listAnalyses(schemaId: string): Promise<AnalysisResult[]> {
    const { data } = await supabase.from('ci_analyses').select('*').eq('schema_id', schemaId);
    return (data || []).map((d: any) => ({ subject_id: d.subject_id, schema_id: d.schema_id, scores: d.scores, summary: d.summary, flags: d.flags, analyzed_at: d.analyzed_at }));
  }

  // --- Signals ---
  async getSignalCatalog(schemaId: string): Promise<SignalCatalog> {
    const { data } = await supabase.from('ci_signals').select('*').eq('schema_id', schemaId);
    const catalog: SignalCatalog = {};
    for (const row of data || []) catalog[row.signal_id] = row.signal_data;
    return catalog;
  }

  async saveSignalCatalog(schemaId: string, catalog: SignalCatalog): Promise<void> {
    for (const [signalId, sig] of Object.entries(catalog)) {
      await supabase.from('ci_signals').upsert({ schema_id: schemaId, signal_id: signalId, signal_data: sig }, { onConflict: 'schema_id,signal_id' });
    }
  }

  // --- Sourcing Stats ---
  async getSourcingStats(schemaId: string): Promise<SourcingStats> {
    const { data } = await supabase.from('ci_sourcing_stats').select('*').eq('schema_id', schemaId);
    const stats: SourcingStats = {};
    for (const row of data || []) {
      const { schema_id, source, ...rest } = row;
      stats[source] = rest;
    }
    return stats;
  }

  async saveSourcingStats(schemaId: string, stats: SourcingStats): Promise<void> {
    for (const [source, s] of Object.entries(stats)) {
      await supabase.from('ci_sourcing_stats').upsert({ schema_id: schemaId, source, ...s }, { onConflict: 'schema_id,source' });
    }
  }

  // --- Experiments ---
  async saveExperiment(run: ExperimentRun): Promise<void> {
    await supabase.from('ci_experiments').insert(run);
  }

  async listExperiments(schemaId: string): Promise<ExperimentRun[]> {
    const { data } = await supabase.from('ci_experiments').select('*').eq('schema_id', schemaId).order('created_at', { ascending: false });
    return (data || []) as ExperimentRun[];
  }

  // --- Adapters ---
  async saveAdapterConnection(conn: AdapterConnection): Promise<void> {
    await supabase.from('ci_adapter_connections').upsert(conn, { onConflict: 'id' });
  }

  async getAdapterConnection(id: string): Promise<AdapterConnection | null> {
    const { data } = await supabase.from('ci_adapter_connections').select('*').eq('id', id).single();
    return data as AdapterConnection | null;
  }

  async listAdapterConnections(): Promise<AdapterConnection[]> {
    const { data } = await supabase.from('ci_adapter_connections').select('*').order('created_at', { ascending: false });
    return (data || []) as AdapterConnection[];
  }

  async updateAdapterConnection(id: string, updates: Partial<AdapterConnection>): Promise<void> {
    await supabase.from('ci_adapter_connections').update(updates).eq('id', id);
  }

  // --- Patterns ---
  async savePatterns(schemaId: string, clusters: any[]): Promise<void> {
    await supabase.from('ci_signals').upsert({ schema_id: schemaId, signal_id: '__patterns__', signal_data: clusters }, { onConflict: 'schema_id,signal_id' });
  }

  async getPatterns(schemaId: string): Promise<any[]> {
    const { data } = await supabase.from('ci_signals').select('signal_data').eq('schema_id', schemaId).eq('signal_id', '__patterns__').single();
    return data?.signal_data || [];
  }

  // --- Events ---
  async logEvent(id: string, eventType: string, subjectId: string | null, payload: any, source?: string): Promise<void> {
    await supabase.from('pipeline_events').insert({ id, event_type: eventType, candidate_id: subjectId, payload, source });
  }

  // --- Graph Nodes ---
  async upsertNode(node: GraphNode): Promise<void> {
    const row: any = {
      id: node.id,
      node_type: node.node_type,
      label: node.label,
      properties: node.properties,
      schema_id: node.schema_id || null,
    };
    await supabase.from('graph_nodes').upsert(row, { onConflict: 'id' });
  }

  async upsertNodes(nodes: GraphNode[]): Promise<void> {
    if (nodes.length === 0) return;
    const rows = nodes.map(n => ({
      id: n.id,
      node_type: n.node_type,
      label: n.label,
      properties: n.properties,
      schema_id: n.schema_id || null,
    }));
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('graph_nodes').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
    }
  }

  async getNode(id: string): Promise<GraphNode | null> {
    const { data } = await supabase.from('graph_nodes').select('*').eq('id', id).single();
    return data as GraphNode | null;
  }

  async listNodes(opts?: { type?: string; schemaId?: string; limit?: number }): Promise<GraphNode[]> {
    let q = supabase.from('graph_nodes').select('*');
    if (opts?.type) q = q.eq('node_type', opts.type);
    if (opts?.schemaId) q = q.eq('schema_id', opts.schemaId);
    q = q.order('created_at', { ascending: false });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data } = await q;
    return (data || []) as GraphNode[];
  }

  async deleteNode(id: string): Promise<void> {
    await supabase.from('graph_nodes').delete().eq('id', id);
  }

  // --- Graph Edges ---
  async upsertEdge(edge: GraphEdge): Promise<void> {
    const row: any = {
      id: edge.id,
      source_id: edge.source_id,
      target_id: edge.target_id,
      relationship: edge.relationship,
      weight: edge.weight,
      properties: edge.properties,
      schema_id: edge.schema_id || null,
    };
    await supabase.from('graph_edges').upsert(row, { onConflict: 'id' });
  }

  async upsertEdges(edges: GraphEdge[]): Promise<void> {
    if (edges.length === 0) return;
    const rows = edges.map(e => ({
      id: e.id,
      source_id: e.source_id,
      target_id: e.target_id,
      relationship: e.relationship,
      weight: e.weight,
      properties: e.properties,
      schema_id: e.schema_id || null,
    }));
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('graph_edges').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
    }
  }

  async listEdges(opts?: { sourceId?: string; targetId?: string; relationship?: string; schemaId?: string }): Promise<GraphEdge[]> {
    let q = supabase.from('graph_edges').select('*');
    if (opts?.sourceId) q = q.eq('source_id', opts.sourceId);
    if (opts?.targetId) q = q.eq('target_id', opts.targetId);
    if (opts?.relationship) q = q.eq('relationship', opts.relationship);
    if (opts?.schemaId) q = q.eq('schema_id', opts.schemaId);
    const { data } = await q;
    return (data || []) as GraphEdge[];
  }

  async deleteEdge(id: string): Promise<void> {
    await supabase.from('graph_edges').delete().eq('id', id);
  }

  async getGraphForSchema(schemaId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const [nodes, edges] = await Promise.all([
      this.listNodes({ schemaId }),
      this.listEdges({ schemaId }),
    ]);
    return { nodes, edges };
  }

  async getGraphStats(schemaId?: string): Promise<GraphStats> {
    let nodeQ = supabase.from('graph_nodes').select('node_type', { count: 'exact' });
    let edgeQ = supabase.from('graph_edges').select('relationship', { count: 'exact' });
    if (schemaId) {
      nodeQ = nodeQ.eq('schema_id', schemaId);
      edgeQ = edgeQ.eq('schema_id', schemaId);
    }
    const [nodesRes, edgesRes] = await Promise.all([nodeQ, edgeQ]);
    const nodesByType: Record<string, number> = {};
    for (const r of nodesRes.data || []) {
      const t = (r as any).node_type;
      nodesByType[t] = (nodesByType[t] || 0) + 1;
    }
    const edgesByRel: Record<string, number> = {};
    for (const r of edgesRes.data || []) {
      const rel = (r as any).relationship;
      edgesByRel[rel] = (edgesByRel[rel] || 0) + 1;
    }
    return {
      total_nodes: nodesRes.count || 0,
      total_edges: edgesRes.count || 0,
      nodes_by_type: nodesByType,
      edges_by_relationship: edgesByRel,
    };
  }

  // --- Graph Queries ---
  async listGraphQueries(category?: string): Promise<GraphQueryTemplate[]> {
    let q = supabase.from('graph_queries').select('*');
    if (category) q = q.eq('category', category);
    q = q.order('created_at', { ascending: true });
    const { data } = await q;
    return (data || []) as GraphQueryTemplate[];
  }

  async executeRawQuery(sql: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('execute_raw_sql', { query_text: sql });
    if (error) {
      // Fallback: try via the rest API if the RPC doesn't exist
      console.warn('executeRawQuery RPC not available, returning empty:', error.message);
      return [];
    }
    return data || [];
  }

  // --- Index Jobs ---
  async saveIndexJob(job: GraphIndexJob): Promise<void> {
    await supabase.from('graph_index_jobs').upsert({
      id: job.id,
      job_type: job.job_type,
      schema_id: job.schema_id || null,
      status: job.status,
      subjects_processed: job.subjects_processed,
      nodes_created: job.nodes_created,
      edges_created: job.edges_created,
      error_message: job.error_message || null,
      started_at: job.started_at || null,
      completed_at: job.completed_at || null,
    }, { onConflict: 'id' });
  }

  async updateIndexJob(id: string, updates: Partial<GraphIndexJob>): Promise<void> {
    await supabase.from('graph_index_jobs').update(updates).eq('id', id);
  }

  async listIndexJobs(schemaId?: string): Promise<GraphIndexJob[]> {
    let q = supabase.from('graph_index_jobs').select('*');
    if (schemaId) q = q.eq('schema_id', schemaId);
    q = q.order('created_at', { ascending: false }).limit(50);
    const { data } = await q;
    return (data || []) as GraphIndexJob[];
  }
}
