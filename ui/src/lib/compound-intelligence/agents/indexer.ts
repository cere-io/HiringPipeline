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

const SKILL_CATEGORIES: Record<string, string[]> = {
  'Blockchain & Web3': ['solidity', 'ethereum', 'smart contract', 'defi', 'web3', 'blockchain', 'evm', 'hardhat', 'foundry', 'rust', 'cairo', 'move', 'cosmos', 'substrate', 'polkadot', 'chainlink', 'uniswap', 'token', 'nft', 'ipfs', 'zero knowledge', 'zk', 'layer 2', 'rollup', 'bridge', 'consensus', 'merkle', 'cryptography', 'wallet'],
  'Backend & Systems': ['python', 'java', 'go', 'golang', 'c++', 'c#', 'node', 'express', 'fastapi', 'django', 'flask', 'spring', 'microservice', 'grpc', 'graphql', 'rest', 'api', 'backend', 'server', 'distributed', 'concurrency', 'multithreading'],
  'Frontend & Mobile': ['react', 'angular', 'vue', 'typescript', 'javascript', 'html', 'css', 'next', 'svelte', 'flutter', 'swift', 'kotlin', 'ios', 'android', 'mobile', 'frontend', 'ui', 'ux'],
  'Data & AI/ML': ['machine learning', 'deep learning', 'nlp', 'llm', 'rag', 'ai', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'data science', 'data engineering', 'spark', 'kafka', 'etl', 'sql', 'nosql', 'mongodb', 'postgresql', 'redis', 'elasticsearch'],
  'DevOps & Cloud': ['aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'jenkins', 'github actions', 'devops', 'linux', 'nginx', 'monitoring', 'prometheus', 'grafana', 'cloud', 'serverless', 'lambda'],
  'Leadership & Soft': ['leadership', 'management', 'communication', 'agile', 'scrum', 'mentoring', 'team lead', 'product', 'strategy', 'stakeholder', 'cross-functional', 'problem solving', 'collaboration', 'entrepreneurship'],
};

function classifySkill(skill: string): string {
  const lower = skill.toLowerCase();
  for (const [category, keywords] of Object.entries(SKILL_CATEGORIES)) {
    for (const kw of keywords) {
      if (lower.includes(kw) || kw.includes(lower)) return category;
    }
  }
  return 'Other Technical';
}

function normalizeSignal(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export interface EvaluatorFeedback {
  author: string;
  score: number | null;
  verdict: 'positive' | 'negative' | 'neutral';
  reasoning: string;
  strengths: string[];
  risks: string[];
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
    evaluations?: EvaluatorFeedback[];
  }): Promise<{ nodesCreated: number; edgesCreated: number }> {
    const { schema, subjectId, traits, score, analysis, outcome, subjectName, evaluations } = opts;
    const ts = now();
    const pendingNodes: GraphNode[] = [];
    const pendingEdges: GraphEdge[] = [];

    const candidateNodeId = nodeId('candidate', subjectId);
    const candidateLabel = subjectName || traits.subject_name || subjectId;

    const notionStatus = (traits as any).subject_meta?.notionStatus as string | undefined;
    const hiringStatus = resolveHiringStatus(notionStatus, outcome?.outcome);

    const candidateSources: string[] = ['ai_extract'];
    if (evaluations && evaluations.length > 0) candidateSources.push('human_feedback');
    if (analysis) candidateSources.push('interview');

    // Build ratings summary as structured data on the candidate, not as separate nodes
    const ratings: Record<string, number> = {};
    for (const field of schema.fields) {
      const val = traits.traits[field.key];
      if (val && typeof val === 'object' && 'rating' in val) {
        ratings[field.key] = val.rating;
      } else if (field.type === 'number' && typeof val === 'number') {
        ratings[field.key] = val;
      }
    }

    const candidateProps: Record<string, any> = {
      subject_id: subjectId,
      composite_score: score?.composite_score ?? null,
      role: score?.role ?? outcome?.role ?? null,
      status: hiringStatus,
      profile_scores: traits.profile_scores || null,
      ratings,
      source: candidateSources.join(','),
      sources: candidateSources,
      skills_count: Array.isArray(traits.traits['skills']) ? traits.traits['skills'].length : 0,
      education: traits.traits['education_level'] || null,
      years_exp: traits.traits['years_of_experience'] || null,
    };

    if (outcome) {
      candidateProps.outcome_score = outcome.outcome;
      if (outcome.feedback) candidateProps.feedback_text = outcome.feedback;
    }

    if (analysis) {
      candidateProps.interview_scores = analysis.scores;
      candidateProps.interview_summary = analysis.summary?.slice(0, 300);
      candidateProps.interview_flags = analysis.flags;
    }

    if (evaluations && evaluations.length > 0) {
      candidateProps.evaluations = evaluations.map(ev => ({
        author: ev.author,
        score: ev.score,
        verdict: ev.verdict,
        reasoning: ev.reasoning.slice(0, 200),
        strengths: ev.strengths,
        risks: ev.risks,
      }));
    }

    pendingNodes.push({
      id: candidateNodeId, node_type: 'candidate', label: candidateLabel,
      properties: candidateProps,
      schema_id: schema.id, created_at: ts, updated_at: ts,
    });

    // ── Role node ──
    const role = score?.role || outcome?.role || '__default__';
    const roleNodeId = nodeId('role', role);
    pendingNodes.push({ id: roleNodeId, node_type: 'role', label: role, properties: {}, schema_id: schema.id, created_at: ts, updated_at: ts });
    pendingEdges.push(this._edge(candidateNodeId, roleNodeId, 'applied_for', 1.0, schema.id));

    // ── Skill category nodes (aggregated, not individual skills) ──
    const candidateSkillCategories = new Set<string>();
    const skillsList = Array.isArray(traits.traits['skills']) ? traits.traits['skills'] : [];
    for (const item of skillsList) {
      if (item && typeof item === 'string') candidateSkillCategories.add(classifySkill(item));
    }

    for (const category of candidateSkillCategories) {
      const catNodeId = nodeId('skill_category', category);
      const skillCount = skillsList.filter((s: string) => classifySkill(s) === category).length;
      pendingNodes.push({
        id: catNodeId, node_type: 'skill_category', label: category,
        properties: { source: 'ai_extract', skill_count: skillCount },
        schema_id: schema.id, created_at: ts, updated_at: ts,
      });
      pendingEdges.push(this._edge(candidateNodeId, catNodeId, 'has_skill', skillCount / 10, schema.id, { count: skillCount }));
    }

    // ── Signal nodes from human feedback ──
    // Each strength/risk from evaluator comments becomes a sharable signal node
    if (evaluations && evaluations.length > 0) {
      for (const ev of evaluations) {
        for (const strength of ev.strengths) {
          const normalized = normalizeSignal(strength);
          if (normalized.length < 3) continue;
          const sigNodeId = nodeId('signal', normalized);
          pendingNodes.push({
            id: sigNodeId, node_type: 'signal', label: strength.trim(),
            properties: { direction: 'positive', source: 'human_feedback' },
            schema_id: schema.id, created_at: ts, updated_at: ts,
          });
          pendingEdges.push(this._edge(candidateNodeId, sigNodeId, 'has_signal', 0.8, schema.id, { direction: 'positive', author: ev.author }));
        }
        for (const risk of ev.risks) {
          const normalized = normalizeSignal(risk);
          if (normalized.length < 3) continue;
          const sigNodeId = nodeId('signal', normalized);
          pendingNodes.push({
            id: sigNodeId, node_type: 'signal', label: risk.trim(),
            properties: { direction: 'negative', source: 'human_feedback' },
            schema_id: schema.id, created_at: ts, updated_at: ts,
          });
          pendingEdges.push(this._edge(candidateNodeId, sigNodeId, 'has_signal', 0.6, schema.id, { direction: 'negative', author: ev.author }));
        }
      }
    }

    // ── Signal nodes from outcome feedback text ──
    if (outcome?.feedback) {
      const sigNodeId = nodeId('signal', normalizeSignal(outcome.feedback.slice(0, 60)));
      pendingNodes.push({
        id: sigNodeId, node_type: 'signal', label: outcome.feedback.length > 50 ? outcome.feedback.slice(0, 48) + '...' : outcome.feedback,
        properties: { direction: outcome.outcome >= 7 ? 'positive' : 'negative', source: 'human_feedback', full_text: outcome.feedback },
        schema_id: schema.id, created_at: ts, updated_at: ts,
      });
      pendingEdges.push(this._edge(candidateNodeId, sigNodeId, 'has_signal', outcome.outcome / 10, schema.id, { direction: outcome.outcome >= 7 ? 'positive' : 'negative' }));
    }

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

      for (const traits of allTraits) {
        const outcome = allOutcomes[traits.subject_id] || null;
        const evaluations = (traits.subject_meta?.evaluations as EvaluatorFeedback[] | undefined) || [];

        await this.indexSubject({
          schema, subjectId: traits.subject_id, traits,
          score: scoreMap.get(traits.subject_id) || null,
          analysis: analysisMap.get(traits.subject_id) || null,
          outcome: outcome ? { outcome: outcome.outcome, feedback: outcome.feedback, role: outcome.role } : null,
          subjectName: traits.subject_name,
          evaluations,
        });
        job.subjects_processed++;
      }

      await this._computeSimilarityEdges(schema, allTraits, scoreMap);

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

  private async _computeSimilarityEdges(schema: TraitSchema, allTraits: ExtractedTraits[], scoreMap: Map<string, SubjectScore>): Promise<void> {
    if (allTraits.length < 2) return;

    const candidateVectors: { subjectId: string; nodeId: string; vector: number[]; categories: Set<string> }[] = [];

    for (const traits of allTraits) {
      const ratingKeys = schema.fields.filter(f => f.type === 'rating').map(f => f.key);
      const vector: number[] = [];
      for (const key of ratingKeys) {
        const val = traits.traits[key];
        vector.push(val && typeof val === 'object' && 'rating' in val ? val.rating / 10 : 0);
      }
      const yoe = traits.traits['years_of_experience'];
      vector.push(typeof yoe === 'number' ? yoe / 20 : 0);

      const skills = Array.isArray(traits.traits['skills']) ? traits.traits['skills'] : [];
      const categories = new Set<string>();
      for (const s of skills) {
        if (typeof s === 'string') categories.add(classifySkill(s));
      }

      candidateVectors.push({
        subjectId: traits.subject_id,
        nodeId: nodeId('candidate', traits.subject_id),
        vector,
        categories,
      });
    }

    const edges: GraphEdge[] = [];
    for (let i = 0; i < candidateVectors.length; i++) {
      for (let j = i + 1; j < candidateVectors.length; j++) {
        const a = candidateVectors[i];
        const b = candidateVectors[j];

        let dot = 0, magA = 0, magB = 0;
        for (let k = 0; k < a.vector.length; k++) {
          dot += a.vector[k] * b.vector[k];
          magA += a.vector[k] * a.vector[k];
          magB += b.vector[k] * b.vector[k];
        }
        const cosineSim = (magA > 0 && magB > 0) ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;

        const catUnion = new Set([...a.categories, ...b.categories]);
        const catIntersection = [...a.categories].filter(c => b.categories.has(c));
        const catSim = catUnion.size > 0 ? catIntersection.length / catUnion.size : 0;

        const similarity = cosineSim * 0.6 + catSim * 0.4;

        if (similarity >= 0.5) {
          edges.push(this._edge(a.nodeId, b.nodeId, 'similar_to', parseFloat(similarity.toFixed(3)), schema.id, {
            cosine: parseFloat(cosineSim.toFixed(3)),
            category_overlap: parseFloat(catSim.toFixed(3)),
            shared_categories: catIntersection.join(', '),
          }));
        }
      }
    }

    if (edges.length > 0) {
      await this.storage.upsertEdges(edges);
    }
  }

  private _edge(sourceId: string, targetId: string, rel: GraphRelationship, weight: number, schemaId: string, properties?: Record<string, any>): GraphEdge {
    return {
      id: edgeId(sourceId, targetId, rel),
      source_id: sourceId, target_id: targetId,
      relationship: rel, weight, properties: properties || {},
      schema_id: schemaId, created_at: now(), updated_at: now(),
    };
  }
}
