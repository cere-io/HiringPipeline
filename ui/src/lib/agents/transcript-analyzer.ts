import { Event, Context } from './types';
import { getModelConfig, getProviderDisplayName } from './model-provider';

export async function handle(event: Event, context: Context) {
    return analyze(event.payload, context);
}

function extractJson(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in LLM output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

export async function analyze(payload: any, context: Context) {
    const { candidateId, role, transcriptText } = payload;

    if (!candidateId || !transcriptText) {
        return { success: false, error: 'Missing candidateId or transcriptText' };
    }

    context.log('Starting Transcript Analysis for candidate:', candidateId);
    
    const modelConfig = getModelConfig();
    context.log(`Calling ${getProviderDisplayName()} for semantic interview analysis...`);

    const systemPrompt = `You are an elite talent evaluator. Analyze this interview transcript for a ${role} candidate.

Return ONLY this exact JSON object. No markdown. No explanation.
{
  "technical_depth": <0-10>,
  "communication_clarity": <0-10>,
  "cultural_fit": <0-10>,
  "problem_solving": <0-10>,
  "summary": "<2-3 sentence assessment of the candidate's performance>",
  "red_flags": ["<any concerns, or empty array>"]
}

Score honestly. 0 = none demonstrated, 5 = adequate, 10 = exceptional.`;

    const response = await context.fetch(modelConfig.endpoint, {
        method: 'POST',
        headers: modelConfig.headers,
        body: JSON.stringify({
            model: modelConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Role: ${role}\n\nInterview Transcript:\n${transcriptText.slice(0, 6000)}` }
            ],
            temperature: 0.2
        })
    });

    if (!response.ok) {
        throw new Error(`${modelConfig.provider} API error ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const rawContent = response.data.choices[0].message.content;
    context.log('LLM Interview Analysis (raw):', rawContent.slice(0, 400) + (rawContent.length > 400 ? '...' : ''));

    const analysisResult = extractJson(rawContent);

    // Validate all 4 numeric dimensions are present
    for (const key of ['technical_depth', 'communication_clarity', 'cultural_fit', 'problem_solving']) {
        if (typeof analysisResult[key] !== 'number') {
            throw new Error(`Missing or non-numeric field "${key}" in Gemini interview analysis`);
        }
    }

    context.log('Interview Analysis:', JSON.stringify(analysisResult));

    const interviewsCubby = context.cubby('hiring-interviews');
    interviewsCubby.json.set(`/${candidateId}`, {
        candidate_id: candidateId,
        role,
        interview_date: new Date().toISOString(),
        analysis: analysisResult,
        raw_transcript_length: transcriptText.length
    });
    context.log(`Saved to hiring-interviews/${candidateId}`);

    return { success: true, candidateId, analysis: analysisResult };
}
