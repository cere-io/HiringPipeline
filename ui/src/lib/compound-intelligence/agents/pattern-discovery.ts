import type { TraitSchema, ExtractedTraits, SubjectScore, TraitCluster } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';

export class PatternDiscovery {
  constructor(private llm: LLMProvider, private storage: CIStorage) {}

  async discover(opts: {
    schema: TraitSchema;
    traits: ExtractedTraits[];
    scores: SubjectScore[];
  }): Promise<TraitCluster[]> {
    const { schema, traits, scores } = opts;
    if (traits.length < 2) return [];

    const scoreMap: Record<string, number> = {};
    const statusMap: Record<string, string> = {};
    for (const s of scores) {
      scoreMap[s.subject_id] = s.composite_score;
    }
    for (const t of traits) {
      const status = t.subject_meta?.notionStatus || '';
      const lower = status.toLowerCase();
      if (lower.includes('hired') || lower.includes('offer')) statusMap[t.subject_id] = 'winner';
      else if (lower.includes('reject') || lower.includes('archived') || lower.includes('declined') || lower.includes('company rejected')) statusMap[t.subject_id] = 'rejected';
      else statusMap[t.subject_id] = 'pending';
    }

    const candidateSummaries = traits.map(t => {
      const traitSummary: Record<string, any> = {};
      for (const [k, v] of Object.entries(t.traits)) {
        if (v && typeof v === 'object' && 'rating' in v) traitSummary[k] = v.rating;
        else if (Array.isArray(v)) traitSummary[k] = v.length > 3 ? `${v.slice(0, 3).join(', ')}... (${v.length})` : v.join(', ');
        else traitSummary[k] = v;
      }
      return {
        id: t.subject_id,
        name: t.subject_name || t.subject_id,
        score: scoreMap[t.subject_id] || 0,
        status: statusMap[t.subject_id] || 'pending',
        traits: traitSummary,
      };
    });

    const traitKeys = schema.fields.map(f => f.key);

    const systemPrompt = `You are a hiring intelligence analyst. Discover SPECIFIC, ACTIONABLE trait patterns with drill-down detail.

TASK: Analyze candidates and produce 8-15 patterns. Each pattern must be:
1. SPECIFIC — include exact numeric thresholds ("YoE >= 8", "rating >= 7", "skills count >= 10")
2. ACTIONABLE — answer "Should we hire/reject candidates with this pattern?"
3. UNIQUE — no two patterns should describe the same group. If patterns overlap, merge them.
4. MULTI-TRAIT — combine 2+ traits (single-trait patterns are useless)

FORBIDDEN labels: "Broad", "General", "Various", "Diverse", "Multiple", "Mixed Background"

Each pattern must also include "drill_down" — a deeper breakdown of the values within that pattern.
For example, if the pattern is "Senior Startup Builders (8+ YoE)", drill_down shows:
  - exact years distribution: "8-10 years: 2 candidates, 10-15 years: 1 candidate"
  - which startups: "Series A: 2, Seed: 1"

CLUSTERING: Only cluster patterns that share 2+ trait keys AND have overlapping candidates.
Include a "cluster_id" field — patterns in the same cluster share the same cluster_id.
Unrelated patterns should have unique cluster_ids (no forced clustering).

Trait keys: ${traitKeys.join(', ')}

Return ONLY a JSON array. No markdown.
[
  {
    "id": "<snake_case_id>",
    "label": "<2-3 Word Specific Label>",
    "description": "<Actionable insight with numbers>",
    "parent_trait": "<primary trait key>",
    "trait_keys": ["key1", "key2"],
    "trait_conditions": {"key1": ">=8", "key2": "includes:startup"},
    "matching_subjects": ["id1", "id2"],
    "cluster_id": "<shared_cluster_id or unique>",
    "drill_down": [
      {"label": "<sub-detail>", "value": "<count or range>", "subjects": ["id1"]}
    ]
  }
]`;

    const response = await this.llm.complete({
      system: systemPrompt,
      user: `Candidates:\n${JSON.stringify(candidateSummaries, null, 1)}`,
      temperature: 0.3,
    });

    const raw = extractJsonFromLLM(response.content);
    if (!Array.isArray(raw)) return [];

    const clusters: TraitCluster[] = raw.map((c: any) => {
      const matching = Array.isArray(c.matching_subjects) ? c.matching_subjects : [];
      const matchScores = matching.map((id: string) => scoreMap[id] || 0);
      const avgScore = matchScores.length > 0 ? parseFloat((matchScores.reduce((a: number, b: number) => a + b, 0) / matchScores.length).toFixed(1)) : 0;

      return {
        id: c.id || c.label?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `cluster_${Math.random().toString(36).slice(2, 6)}`,
        label: c.label || 'Unknown Pattern',
        description: c.description || '',
        parent_trait: c.parent_trait || traitKeys[0],
        trait_keys: Array.isArray(c.trait_keys) ? c.trait_keys : [],
        trait_conditions: c.trait_conditions || {},
        matching_subjects: matching,
        avg_score: avgScore,
        winner_count: matching.filter((id: string) => statusMap[id] === 'winner').length,
        reject_count: matching.filter((id: string) => statusMap[id] === 'rejected').length,
        pending_count: matching.filter((id: string) => statusMap[id] === 'pending').length,
        cluster_id: c.cluster_id || c.id,
        drill_down: Array.isArray(c.drill_down) ? c.drill_down : [],
      };
    }).filter((c: TraitCluster) => c.matching_subjects.length > 0);

    await this.storage.savePatterns(schema.id, clusters);
    return clusters;
  }
}
