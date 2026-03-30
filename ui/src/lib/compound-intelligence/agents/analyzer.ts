import type { TraitSchema, AnalysisResult } from '../types';
import type { LLMProvider } from '../llm/interface';
import { extractJsonFromLLM } from '../llm/interface';
import type { CIStorage } from '../storage/interface';

function buildAnalysisPrompt(schema: TraitSchema, role: string): string {
  const scoreFields = schema.profile_axes && schema.profile_axes.length > 0
    ? schema.profile_axes.map(a => `  "${a.key}": <0-10>  // ${a.derivation_hint}`)
    : schema.fields.slice(0, 6).map(f => `  "${f.key}": <0-10>`);

  return `You are an elite evaluator analyzing a document (e.g., interview transcript, work sample, assessment) for a ${role} candidate/subject using the "${schema.name}" framework.

Return ONLY this exact JSON object. No markdown. No explanation.
{
  "scores": {
${scoreFields.join(',\n')}
  },
  "summary": "<2-3 sentence assessment>",
  "flags": ["<any concerns, or empty array>"]
}

Score honestly. 0 = none demonstrated, 5 = adequate, 10 = exceptional.`;
}

export class Analyzer {
  constructor(private llm: LLMProvider, private storage: CIStorage) {}

  async analyze(opts: {
    schema: TraitSchema;
    subjectId: string;
    text: string;
    role: string;
  }): Promise<AnalysisResult> {
    const { schema, subjectId, text, role } = opts;

    const systemPrompt = buildAnalysisPrompt(schema, role);
    const response = await this.llm.complete({
      system: systemPrompt,
      user: `Role: ${role}\n\nDocument:\n${text.slice(0, 8000)}`,
      temperature: 0.2,
    });

    const parsed = extractJsonFromLLM(response.content);

    const scores: Record<string, number> = {};
    if (parsed.scores && typeof parsed.scores === 'object') {
      for (const [k, v] of Object.entries(parsed.scores)) {
        scores[k] = typeof v === 'number' ? v : 0;
      }
    }

    const result: AnalysisResult = {
      subject_id: subjectId,
      schema_id: schema.id,
      scores,
      summary: parsed.summary || '',
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      analyzed_at: new Date().toISOString(),
    };

    await this.storage.saveAnalysis(result);
    return result;
  }
}
