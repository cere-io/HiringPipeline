import { Event, Context, CandidateTraits } from './types';
import { getModelConfig, getProviderDisplayName } from './model-provider';

export async function handle(event: Event, context: Context) {
    return extract(event.payload, context);
}

/** Strip markdown fences and extract the first complete {...} block. */
function extractJson(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in LLM output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

/** Map raw LLM output to exactly the CandidateTraits schema. */
function projectSchema(raw: any, candidateId: string): CandidateTraits {
    const ratingObj = (v: any) =>
        v && typeof v === 'object' && 'rating' in v
            ? { items: Array.isArray(v.items) ? v.items : [], rating: Number(v.rating) || 0 }
            : { items: [], rating: typeof v === 'number' ? v : 0 };

    return {
        candidate_id: candidateId,
        skills: Array.isArray(raw.skills) ? raw.skills : [],
        years_of_experience: typeof raw.years_of_experience === 'number' ? raw.years_of_experience : 0,
        company_stages: Array.isArray(raw.company_stages) ? raw.company_stages : [],
        education_level: typeof raw.education_level === 'string' ? raw.education_level : 'Unknown',
        schools: ratingObj(raw.schools),
        hard_things_done: ratingObj(raw.hard_things_done),
        hackathons: ratingObj(raw.hackathons),
        open_source_contributions: ratingObj(raw.open_source_contributions),
        company_signals: ratingObj(raw.company_signals),
        conclusive_score: 0,
        source_completeness: { has_resume: true, has_linkedin: false },
        extracted_at: new Date().toISOString()
    };
}

export async function extract(payload: any, context: Context) {
    const { candidateId, resumeText, role } = payload;

    if (!resumeText || !candidateId) {
        return { success: false, error: 'Missing resumeText or candidateId' };
    }

    context.log('Extracting traits for candidate:', candidateId, 'for role:', role);
    
    const modelConfig = getModelConfig();
    context.log(`Calling ${getProviderDisplayName()} for resume trait extraction...`);

    const systemPrompt = `You are a senior technical recruiter extracting structured signals from a resume for the role: "${role || 'Software Engineer'}".

Return ONLY this exact JSON object. No markdown. No explanation. No extra fields.
{
  "skills": ["list of technical/soft skills"],
  "years_of_experience": <integer>,
  "company_stages": ["startup" | "series_a" | "series_b" | "growth" | "public" | "enterprise"],
  "education_level": "Bachelors" | "Masters" | "PhD" | "None",
  "schools": { "items": ["school names"], "rating": <0-10> },
  "hard_things_done": { "items": ["impressive achievements"], "rating": <0-10> },
  "hackathons": { "items": ["hackathon names"], "rating": <0-10> },
  "open_source_contributions": { "items": ["OSS projects"], "rating": <0-10> },
  "company_signals": { "items": ["notable employers"], "rating": <0-10> }
}

Rating scale: 0 = none/unknown, 5 = average, 10 = exceptional.`;

    const response = await context.fetch(modelConfig.endpoint, {
        method: 'POST',
        headers: modelConfig.headers,
        body: JSON.stringify({
            model: modelConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Resume:\n${resumeText.slice(0, 4000)}` }
            ],
            temperature: 0.2
        })
    });

    if (!response.ok) {
        throw new Error(`${modelConfig.provider} API error ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const rawContent = response.data.choices[0].message.content;
    context.log('LLM Raw Output:', rawContent.slice(0, 400) + (rawContent.length > 400 ? '...' : ''));

    const parsed = extractJson(rawContent);
    const traits = projectSchema(parsed, candidateId);

    context.log('Extracted traits:', JSON.stringify({
        skills: traits.skills.slice(0, 3),
        yoe: traits.years_of_experience,
        schools: traits.schools.rating,
        hard_things: traits.hard_things_done.rating,
        company_signals: traits.company_signals.rating
    }));

    const traitsCubby = context.cubby('hiring-traits');
    traitsCubby.json.set(`/${candidateId}`, traits);
    context.log('Saved to hiring-traits cubby:', candidateId);

    return { success: true, traits };
}
