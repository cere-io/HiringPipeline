import type { TraitSchema, ExtractedTraits, DynamicTraits } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';

function buildExtractionPrompt(schema: TraitSchema, role: string): string {
  const fieldLines = schema.fields.map(f => {
    switch (f.type) {
      case 'rating':
        return `  "${f.key}": { "items": ["relevant items for ${f.extraction_hint}"], "rating": <0-10> }`;
      case 'string[]':
        return `  "${f.key}": ["list of ${f.extraction_hint}"]`;
      case 'number':
        return `  "${f.key}": <${f.extraction_hint}>`;
      case 'category':
        return `  "${f.key}": ${(f.values || []).map(v => `"${v}"`).join(' | ')}`;
      case 'boolean':
        return `  "${f.key}": true | false`;
      default:
        return `  "${f.key}": <${f.extraction_hint}>`;
    }
  });

  let prompt = `You are extracting structured signals from a document for the role: "${role}" using the "${schema.name}" evaluation framework.

Return ONLY this JSON object. No markdown. No explanation.
{
${fieldLines.join(',\n')}
}

Rating scale: 0 = none/unknown, 5 = average, 10 = exceptional.`;

  if (schema.profile_axes && schema.profile_axes.length > 0) {
    const axisLines = schema.profile_axes.map(a => `    "${a.key}": <0-10>  // ${a.derivation_hint}`);
    prompt += `

Also include a "profile_scores" object:
  "profile_scores": {
${axisLines.join(',\n')}
  }`;
  }

  return prompt;
}

function normalizeTraits(raw: any, schema: TraitSchema): DynamicTraits {
  const traits: DynamicTraits = {};

  for (const field of schema.fields) {
    const val = raw[field.key];
    switch (field.type) {
      case 'string[]':
        traits[field.key] = Array.isArray(val) ? val : [];
        break;
      case 'number':
        traits[field.key] = typeof val === 'number' ? val : 0;
        break;
      case 'boolean':
        traits[field.key] = val === true;
        break;
      case 'rating':
        if (val && typeof val === 'object' && 'rating' in val) {
          traits[field.key] = { items: Array.isArray(val.items) ? val.items : [], rating: Number(val.rating) || 0 };
        } else {
          traits[field.key] = { items: [], rating: typeof val === 'number' ? val : 0 };
        }
        break;
      case 'category':
        traits[field.key] = typeof val === 'string' ? val : (field.values?.[field.values.length - 1] || 'unknown');
        break;
      default:
        traits[field.key] = val ?? null;
    }
  }

  return traits;
}

export class Extractor {
  constructor(private llm: LLMProvider, private storage: CIStorage) {}

  async extract(opts: {
    schema: TraitSchema;
    subjectId: string;
    text: string;
    role: string;
  }): Promise<ExtractedTraits> {
    const { schema, subjectId, text, role } = opts;

    const systemPrompt = buildExtractionPrompt(schema, role);
    const response = await this.llm.complete({
      system: systemPrompt,
      user: `Document:\n${text.slice(0, 6000)}`,
      temperature: 0.2,
    });

    const parsed = extractJsonFromLLM(response.content);
    const traits = normalizeTraits(parsed, schema);

    let profileScores: Record<string, number> | undefined;
    if (parsed.profile_scores && schema.profile_axes) {
      profileScores = {};
      for (const axis of schema.profile_axes) {
        profileScores[axis.key] = Number(parsed.profile_scores[axis.key]) || 0;
      }
    }

    const result: ExtractedTraits = {
      subject_id: subjectId,
      schema_id: schema.id,
      traits,
      profile_scores: profileScores,
      extracted_at: new Date().toISOString(),
    };

    await this.storage.saveTraits(result);
    return result;
  }
}
