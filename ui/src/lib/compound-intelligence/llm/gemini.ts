import type { LLMProvider, LLMRequest, LLMResponse } from './interface';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete(opts: LLMRequest): Promise<LLMResponse> {
    const model = opts.model || this.defaultModel;
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature ?? 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      content: data.choices[0].message.content,
      model,
    };
  }
}
