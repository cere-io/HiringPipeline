export interface LLMProvider {
  complete(opts: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
}

export function extractJsonFromLLM(raw: string): any {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const arrStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');

  // If array comes first (or no object), parse as array
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrEnd > arrStart) return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
  }

  // Otherwise parse as object
  if (objStart !== -1) {
    const objEnd = cleaned.lastIndexOf('}');
    if (objEnd > objStart) return JSON.parse(cleaned.slice(objStart, objEnd + 1));
  }

  throw new Error('No JSON found in LLM output');
}
