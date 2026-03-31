import type {
  TraitSchema,
  ExtractedTraits,
  SubjectScore,
  AnalysisResult,
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphRelationship,
  GraphIndexJob,
} from '../types';
import type { CIStorage } from '../storage/interface';

function nodeId(type: string, key: string): string {
  return `${type}:${key.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`;
}

function edgeId(sourceId: string, targetId: string, rel: string): string {
  return `${sourceId}__${rel}__${targetId}`;
}

function now(): string {
  return new Date().toISOString();
}

function resolveHiringStatus(notionStatus?: string, outcomeScore?: number): 'hired' | 'rejected' | 'pending' {
  if (notionStatus) {
    const lower = notionStatus.toLowerCase();
    if (lower.includes('hired') || lower.includes('offer')) return 'hired';
    if (lower.includes('reject') || lower.includes('archived') || lower.includes('declined') || lower.includes('withdrawn')) return 'rejected';
    return 'pending';
  }
  if (outcomeScore != null) {
    if (outcomeScore >= 7) return 'hired';
    if (outcomeScore <= 3) return 'rejected';
  }
  return 'pending';
}

export class GraphIndexer {
  constructor(private storage: CIStorage) {}

  async indexSubject(opts: {
    schema: TraitSchema;
    subjectId: string;
    traits: ExtractedTraits;
    score?: SubjectScore | null;
    analysis?: AnalysisResult | null;
    outcome?: { outcome: number; feedback?: string; role: string } | null;
    subjectName?: string;
  }): Promise<{ nodesCreated: number; edgesCreated: number }> {
    const { schema, subjectId, traits, score, analysis, outcome, subjectName } = opts;
    const ts = now();
    const pendingNodes: GraphNode[] = [];
    const pendingEdges: GraphEdge[] = [];

    const candidateNodeId = nodeId('candidate', subjectId);
    const candidateLabel = subjectName || traits.subject_name || subjectId;

    const notionStatus = (traits as any).subject_meta?.notionStatus as string | undefined;
    const hiringStatus = resolveHiringStatus(notionStatus, outcome?.outcome);

    pendingNodes.push({
      id: candidateNodeId, node_type: 'candidate', label: candidateLabel,
      properties: {
        subject_id: subjectId,
        composite_score: score?.composite_score ?? null,
        role: score?.role ?? outcome?.role ?? null,
        status: hiringStatus,
        profile_scores: traits.profile_scores || null,
      },
      schema_id: schema.id, created_at: ts, updated_at: ts,
    });

    const role = score?.role || outcome?.role || '__default__';
    const roleNodeId = nodeId('role', role);
    pendingNodes.push({ id: roleNodeId, node_type: 'role', label: role, properties: {}, schema_id: schema.id, created_at: ts, updated_at: ts });
    pendingEdges.push(this._edge(candidateNodeId, roleNodeId, 'applied_for', 1.0, schema.id));

    for (const field of schema.fields) {
      const val = traits.traits[field.key];
      if (!val) continue;

      if (field.type === 'string[]' && Array.isArray(val)) {
        const targetType: GraphNodeType = field.key === 'skills' ? 'skill' : field.key.includes('company') ? 'company' : 'trait';
        const rel: GraphRelationship = field.key === 'skills' ? 'has_skill' : field.key.includes('company') ? 'worked_at' : 'has_trait';
        for (const item of val) {
          if (!item || typeof item !== 'string') continue;
          const itemNodeId = nodeId(targetType, item);
          pendingNodes.push({ id: itemNodeId, node_type: targetType, label: item, properties: { trait_key: field.key }, schema_id: schema.id, created_at: ts, updated_at: ts });
          pendingEdges.push(this._edge(candidateNodeId, itemNodeId, rel, 1.0, schema.id));
        }
      } else if (field.type === 'rating' && typeof val === 'object' && 'rating' in val) {
        const traitNodeId = nodeId('trait', `${field.key}_${Math.round(val.rating)}`);
        pendingNodes.push({ id: traitNodeId, node_type: 'trait', label: `${field.label}: ${val.rating}/10`, properties: { trait_key: field.key, rating: val.rating, items: val.items || [] }, schema_id: schema.id, created_at: ts, updated_at: ts });
        pendingEdges.push(this._edge(candidateNodeId, traitNodeId, 'scored_on', val.rating / 10, schema.id));

        if (Array.isArray(val.items)) {
          for (const item of val.items) {
            if (!item || typeof item !== 'string') continue;
            const detailType: GraphNodeType = field.key.includes('company') ? 'company' : field.key.includes('school') ? 'company' : 'trait';
            const detailRel: GraphRelationship = field.key.includes('company') ? 'worked_at' : field.key.includes('school') ? 'has_education' : 'has_trait';
            const detailId = nodeId(detailType, item);
            pendingNodes.push({ id: detailId, node_type: detailType, label: item, properties: { source_trait: field.key }, schema_id: schema.id, created_at: ts, updated_at: ts });
            pendingEdges.push(this._edge(candidateNodeId, detailId, detailRel, 1.0, schema.id));
          }
        }
      } else if (field.type === 'number' && typeof val === 'number') {
        const bucket = val <= 2 ? '0-2' : val <= 5 ? '3-5' : val <= 8 ? '6-8' : '9+';
        const traitNodeId = nodeId('trait', `${field.key}_${bucket}`);
        pendingNodes.push({ id: traitNodeId, node_type: 'trait', label: `${field.label}: ${bucket} years`, properties: { trait_key: field.key, value: val, bucket }, schema_id: schema.id, created_at: ts, updated_at: ts });
        pendingEdges.push(this._edge(candidateNodeId, traitNodeId, 'has_trait', val / 10, schema.id));
      } else if (field.type === 'category' && typeof val === 'string') {
        const traitNodeId = nodeId('trait', `${field.key}_${val}`);
        pendingNodes.push({ id: traitNodeId, node_type: 'trait', label: `${field.label}: ${val}`, properties: { trait_key: field.key, value: val }, schema_id: schema.id, created_at: ts, updated_at: ts });
        pendingEdges.push(this._edge(candidateNodeId, traitNodeId, 'has_trait', 1.0, schema.id));
      }
    }

    if (outcome) {
      const outcomeLabel = hiringStatus === 'hired' ? 'Hired' : hiringStatus === 'rejected' ? 'Rejected' : 'Pending';
      const outcomeNodeId = nodeId('outcome', outcomeLabel);
      pendingNodes.push({ id: outcomeNodeId, node_type: 'outcome', label: outcomeLabel, properties: { score: outcome.outcome }, schema_id: schema.id, created_at: ts, updated_at: ts });
      pendingEdges.push(this._edge(candidateNodeId, outcomeNodeId, 'has_outcome', outcome.outcome / 10, schema.id));

      if (outcome.feedback) {
        const feedbackNodeId = nodeId('feedback', `${subjectId}_feedback`);
        pendingNodes.push({ id: feedbackNodeId, node_type: 'feedback', label: `Feedback: ${outcome.feedback.slice(0, 60)}...`, properties: { full_text: outcome.feedback, outcome_score: outcome.outcome }, schema_id: schema.id, created_at: ts, updated_at: ts });
        pendingEdges.push(this._edge(candidateNodeId, feedbackNodeId, 'received_feedback', 1.0, schema.id));
      }
    }

    if (analysis) {
      const sessionNodeId = nodeId('session', `${subjectId}_interview`);
      pendingNodes.push({ id: sessionNodeId, node_type: 'session', label: `Interview: ${candidateLabel}`, properties: { scores: analysis.scores, summary: analysis.summary?.slice(0, 200), flags: analysis.flags }, schema_id: schema.id, created_at: ts, updated_at: ts });
      pendingEdges.push(this._edge(candidateNodeId, sessionNodeId, 'interviewed_for', 1.0, schema.id));
    }

    // Batch write all at once
    await this.storage.upsertNodes(pendingNodes);
    await this.storage.upsertEdges(pendingEdges);

    return { nodesCreated: pendingNodes.length, edgesCreated: pendingEdges.length };
  }

  async fullReindex(schema: TraitSchema): Promise<GraphIndexJob> {
    const jobId = `idx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: GraphIndexJob = {
      id: jobId, job_type: 'full_reindex', schema_id: schema.id, status: 'running',
      subjects_processed: 0, nodes_created: 0, edges_created: 0,
      started_at: now(), created_at: now(),
    };
    await this.storage.saveIndexJob(job);

    try {
      await this.storage.clearGraph(schema.id);

      const [allTraits, allScores, allOutcomes, allAnalyses] = await Promise.all([
        this.storage.listTraits(schema.id),
        this.storage.listScores(schema.id),
        this.storage.listOutcomes(schema.id),
        this.storage.listAnalyses(schema.id),
      ]);

      const scoreMap = new Map(allScores.map(s => [s.subject_id, s]));
      const analysisMap = new Map(allAnalyses.map(a => [a.subject_id, a]));

      let totalNodes = 0;
      let totalEdges = 0;

      for (const traits of allTraits) {
        const outcome = allOutcomes[traits.subject_id] || null;
        const { nodesCreated, edgesCreated } = await this.indexSubject({
          schema, subjectId: traits.subject_id, traits,
          score: scoreMap.get(traits.subject_id) || null,
          analysis: analysisMap.get(traits.subject_id) || null,
          outcome: outcome ? { outcome: outcome.outcome, feedback: outcome.feedback, role: outcome.role } : null,
          subjectName: traits.subject_name,
        });
        totalNodes += nodesCreated;
        totalEdges += edgesCreated;
        job.subjects_processed++;
      }

      // Query actual unique counts from DB instead of upsert operation counts
      const realStats = await this.storage.getGraphStats(schema.id);
      job.nodes_created = realStats.total_nodes;
      job.edges_created = realStats.total_edges;
      job.status = 'completed';
      job.completed_at = now();
      await this.storage.updateIndexJob(jobId, job);
      return job;
    } catch (err: any) {
      job.status = 'failed';
      job.error_message = err.message;
      job.completed_at = now();
      await this.storage.updateIndexJob(jobId, job);
      return job;
    }
  }

  private _edge(sourceId: string, targetId: string, rel: GraphRelationship, weight: number, schemaId: string): GraphEdge {
    return {
      id: edgeId(sourceId, targetId, rel),
      source_id: sourceId, target_id: targetId,
      relationship: rel, weight, properties: {},
      schema_id: schemaId, created_at: now(), updated_at: now(),
    };
  }
}
