import type { TraitSchema, DynamicWeights, SubjectScore, ExtractedTraits } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';
import { SchemaRegistry } from '../schema/registry';

function buildSignals(traits: Record<string, any>, schema: TraitSchema): Record<string, any> {
  const signals: Record<string, any> = {};
  for (const field of schema.fields) {
    const val = traits[field.key];
    switch (field.type) {
      case 'string[]':
        signals[`${field.key}_count`] = Array.isArray(val) ? val.length : 0;
        break;
      case 'rating':
        signals[`${field.key}_rating`] = val?.rating ?? 0;
        break;
      case 'number':
        signals[field.key] = val ?? 0;
        break;
      case 'category':
        signals[field.key] = val ?? 'unknown';
        break;
      case 'boolean':
        signals[field.key] = val === true;
        break;
    }
  }
  return signals;
}

export class Scorer {
  private registry: SchemaRegistry;

  constructor(private llm: LLMProvider, private storage: CIStorage) {
    this.registry = new SchemaRegistry(storage);
  }

  async score(opts: {
    schema: TraitSchema;
    subjectId: string;
    role: string;
    traits?: ExtractedTraits;
  }): Promise<SubjectScore> {
    const { schema, subjectId, role } = opts;

    const extracted = opts.traits || await this.storage.getTraits(schema.id, subjectId);
    if (!extracted) throw new Error(`Traits not found for ${subjectId} in schema ${schema.id}`);

    const weights = await this.registry.getWeightsForRole(schema.id, role);
    const signals = buildSignals(extracted.traits, schema);

    const prompt = `You are a scoring engine for the "${schema.name}" evaluation framework.

Role: ${role}
Subject signals: ${JSON.stringify(signals)}
Weights (importance of each signal, sum to 1.0): ${JSON.stringify(weights)}

Score this subject 0.0-10.0 by applying the weights to each signal. Return ONLY this JSON:
{"composite_score": <number 0.0-10.0>, "reasoning": "<one concise sentence>"}`;

    const response = await this.llm.complete({
      system: 'You are a precise scoring engine. Output only valid JSON, nothing else. Score on a 0-10 scale.',
      user: prompt,
      temperature: 0,
    });

    const parsed = extractJsonFromLLM(response.content);
    if (typeof parsed.composite_score !== 'number') {
      throw new Error('composite_score missing or non-numeric in LLM output');
    }

    const rawScore = parsed.composite_score > 10 ? parsed.composite_score / 10 : parsed.composite_score;
    const result: SubjectScore = {
      subject_id: subjectId,
      schema_id: schema.id,
      role,
      composite_score: Math.round(Math.max(0, Math.min(10, rawScore)) * 10) / 10,
      reasoning: parsed.reasoning || '',
      weights_used: weights,
      scored_at: new Date().toISOString(),
    };

    await this.storage.saveScore(result);
    return result;
  }
}
