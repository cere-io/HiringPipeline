import type { TraitSchema, DynamicWeights, DistillationResult, TraitSignal, SourcingStats } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';
import { SchemaRegistry } from '../schema/registry';

function normalize(weights: DynamicWeights, keys: string[]): DynamicWeights {
  const sum = keys.reduce((acc, k) => acc + (weights[k] ?? 0), 0);
  if (sum === 0) return weights;
  const result: DynamicWeights = {};
  for (const k of keys) {
    result[k] = parseFloat(((weights[k] ?? 0) / sum).toFixed(6));
  }
  return result;
}

function validateWeights(raw: any, keys: string[]): DynamicWeights {
  const result: DynamicWeights = {};
  for (const k of keys) {
    const n = Number(raw[k]);
    if (!Number.isFinite(n)) throw new Error(`Non-numeric weight for "${k}": ${JSON.stringify(raw[k])}`);
    result[k] = n;
  }
  return result;
}

function findBestTraitKey(reason: string, traitKeys: string[]): string {
  const lower = reason.toLowerCase();
  for (const key of traitKeys) {
    const readable = key.replace(/_/g, ' ');
    if (lower.includes(readable) || lower.includes(key)) return key;
  }
  return traitKeys[0];
}

export class Distiller {
  private registry: SchemaRegistry;

  constructor(private llm: LLMProvider, private storage: CIStorage) {
    this.registry = new SchemaRegistry(storage);
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
    const { schema, subjectId, role, outcome, feedback, reasons, source, isPerformanceReview } = opts;
    const traitKeys = schema.fields.map(f => f.key);

    await this.storage.saveOutcome(schema.id, subjectId, outcome, role, feedback, isPerformanceReview);

    const extracted = await this.storage.getTraits(schema.id, subjectId);
    if (!extracted) {
      throw new Error(`Traits not found for ${subjectId} in schema ${schema.id}`);
    }

    // Update sourcing stats
    if (source) {
      const stats = await this.storage.getSourcingStats(schema.id);
      const entry = stats[source] ?? {
        total_subjects: 0, avg_ai_score: 0, avg_human_score: 0,
        avg_performance_score: 0, performance_review_count: 0, hired_count: 0,
      };
      const score = await this.storage.getScore(schema.id, subjectId);
      const aiScore = score?.composite_score ?? 0;

      if (!isPerformanceReview) {
        const n = entry.total_subjects;
        entry.avg_ai_score = parseFloat(((entry.avg_ai_score * n + aiScore) / (n + 1)).toFixed(2));
        entry.avg_human_score = parseFloat(((entry.avg_human_score * n + outcome) / (n + 1)).toFixed(2));
        if (outcome >= 7) entry.hired_count += 1;
        entry.total_subjects = n + 1;
      } else {
        const p = entry.performance_review_count;
        entry.avg_performance_score = parseFloat(((entry.avg_performance_score * p + outcome) / (p + 1)).toFixed(2));
        entry.performance_review_count = p + 1;
      }

      stats[source] = entry;
      await this.storage.saveSourcingStats(schema.id, stats);
    }

    // Build trait signal summary for the LLM
    const traitSummary = traitKeys.map(k => {
      const val = extracted.traits[k];
      if (val && typeof val === 'object' && 'rating' in val) return `- ${k}: ${val.rating}/10`;
      if (typeof val === 'number') return `- ${k}: ${val}`;
      if (Array.isArray(val)) return `- ${k}: ${val.length} items`;
      if (typeof val === 'boolean') return `- ${k}: ${val}`;
      return `- ${k}: ${JSON.stringify(val)}`;
    }).join('\n');

    const currentWeights = await this.registry.getWeightsForRole(schema.id, role);
    const defaultWeights = this.registry.buildDefaultWeights(schema);

    const systemPrompt = `You are the learning algorithm of a compound-intelligence system.
Given a subject's trait signals and the current weights, return UPDATED weights that reflect what this outcome teaches.

RULES:
- Return ONLY a raw JSON object. No markdown. No explanation.
- All ${traitKeys.length} values MUST be plain decimal numbers (e.g. 0.12). No expressions, no strings.
- All ${traitKeys.length} values MUST sum to exactly 1.0.
- Maximum allowed change per weight: 0.05.
- outcome >= 7 = great → boost weights for the subject's strongest traits.
- outcome <= 4 = poor → reduce weights for the subject's strongest traits, rebalance toward baseline.
- outcome 5-6 = average → minor rebalance toward baseline.

Keys: ${JSON.stringify(traitKeys)}
Baseline weights: ${JSON.stringify(defaultWeights)}`;

    const userPrompt = `Outcome score: ${outcome}/10${feedback ? `\nHuman reasoning: "${feedback}"` : ''}
Current weights: ${JSON.stringify(currentWeights)}
Subject trait values:
${traitSummary}`;

    const response = await this.llm.complete({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0,
    });

    const parsed = extractJsonFromLLM(response.content);
    const validated = validateWeights(parsed, traitKeys);
    const newWeights = normalize(validated, traitKeys);

    await this.storage.setWeights(schema.id, role, newWeights);

    // Index trait-level reasons as signals
    if (reasons && reasons.length > 0) {
      const catalog = await this.storage.getSignalCatalog(schema.id);
      const direction = outcome >= 7 ? 'positive' : outcome <= 4 ? 'negative' : 'positive';
      const now = new Date().toISOString();

      for (const reason of reasons) {
        const sigId = reason.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
        const bestKey = findBestTraitKey(reason, traitKeys);

        if (catalog[sigId]) {
          catalog[sigId].occurrence_count += 1;
          catalog[sigId].strength = Math.min(1, catalog[sigId].strength + 0.1);
          if (!catalog[sigId].subject_ids.includes(subjectId)) {
            catalog[sigId].subject_ids.push(subjectId);
          }
          catalog[sigId].outcome_entries.push({ subject_id: subjectId, outcome, timestamp: now });
          catalog[sigId].avg_outcome = catalog[sigId].outcome_entries.reduce((s, e) => s + e.outcome, 0) / catalog[sigId].outcome_entries.length;
          catalog[sigId].last_seen = now;
        } else {
          catalog[sigId] = {
            id: sigId,
            signal: reason,
            trait_key: bestKey,
            direction,
            strength: 0.5,
            occurrence_count: 1,
            subject_ids: [subjectId],
            avg_outcome: outcome,
            outcome_entries: [{ subject_id: subjectId, outcome, timestamp: now }],
            first_seen: now,
            last_seen: now,
          };
        }
      }

      await this.storage.saveSignalCatalog(schema.id, catalog);
    }

    return {
      schema_id: schema.id,
      role,
      previous_weights: currentWeights,
      new_weights: newWeights,
      signals_indexed: reasons?.length ?? 0,
    };
  }
}
