import { Event, Context, CandidateTraits, AccountTraits, PipelineMode } from '../types';

export async function handle(event: Event, context: Context) {
    const mode: PipelineMode = event.payload?.mode ?? 'recruiting';
    if (mode === 'recruiting') return extract(event.payload, context);
    return extractSales(event.payload, context);
}

function geminiEndpoint(): string {
    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
}

function geminiHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
    };
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
    const { candidateId, resumeText, role, mode } = payload;

    if (mode && mode !== 'recruiting') return extractSales(payload, context);
    if (!resumeText || !candidateId) {
        return { success: false, error: 'Missing resumeText or candidateId' };
    }

    context.log('Extracting traits for candidate:', candidateId, 'for role:', role);
    context.log('Calling Gemini 2.0 Flash for resume trait extraction...');

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

    const response = await context.fetch(geminiEndpoint(), {
        method: 'POST',
        headers: geminiHeaders(),
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Resume:\n${resumeText.slice(0, 4000)}` }
            ],
            temperature: 0.2
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(response.data)}`);
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

function projectAccountSchema(raw: any, accountId: string, mode: PipelineMode): AccountTraits {
    const ratingObj = (v: any) =>
        v && typeof v === 'object' && 'rating' in v
            ? { items: Array.isArray(v.items) ? v.items : [], rating: Number(v.rating) || 0 }
            : { items: [], rating: typeof v === 'number' ? v : 0 };
    const salesMode = (mode === 'sales' || mode === 'sales:enterprise' || mode === 'sales:smb') ? mode : 'sales';
    return {
        account_id: accountId,
        mode: salesMode,
        company_name: typeof raw.company_name === 'string' ? raw.company_name : 'Unknown',
        icp_fit: ratingObj(raw.icp_fit),
        intent_signals: ratingObj(raw.intent_signals),
        deal_size_potential: typeof raw.deal_size_potential === 'number' ? raw.deal_size_potential : 0,
        champion_signals: ratingObj(raw.champion_signals),
        timing_signals: ratingObj(raw.timing_signals),
        competitive_signals: ratingObj(raw.competitive_signals),
        relationship_warmth: ratingObj(raw.relationship_warmth),
        risk_signals: ratingObj(raw.risk_signals),
        conclusive_score: 0,
        source_completeness: {
            has_crm: Boolean(raw.source_completeness?.has_crm),
            has_linkedin: Boolean(raw.source_completeness?.has_linkedin),
            has_intent_data: Boolean(raw.source_completeness?.has_intent_data),
        },
        extracted_at: new Date().toISOString(),
    };
}

export async function extractSales(payload: any, context: Context) {
    const { candidateId, resumeText, role, mode } = payload;
    const accountId = candidateId;
    const brief = resumeText;
    if (!brief || !accountId) return { success: false, error: 'Missing brief (resumeText) or accountId (candidateId)' };

    const segment = role || 'generic';
    context.log('Extracting account traits:', accountId, 'segment:', segment, 'mode:', mode);

    const systemPrompt = `You are a senior enterprise AE evaluating an account for the ICP segment: "${segment}".

Return ONLY this exact JSON. No markdown, no extra fields.
{
  "company_name": "<company name>",
  "icp_fit": { "items": ["why they fit (industry, size, stack)"], "rating": <0-10> },
  "intent_signals": { "items": ["recent hiring / funding / tech changes"], "rating": <0-10> },
  "deal_size_potential": <estimated annual contract value in USD>,
  "champion_signals": { "items": ["likely internal advocate indicators"], "rating": <0-10> },
  "timing_signals": { "items": ["budget cycle / contract expiry"], "rating": <0-10> },
  "competitive_signals": { "items": ["vendors we would displace"], "rating": <0-10> },
  "relationship_warmth": { "items": ["existing connections / referrals"], "rating": <0-10> },
  "risk_signals": { "items": ["churn-y patterns, leadership turnover"], "rating": <0-10> },
  "source_completeness": { "has_crm": <true|false>, "has_linkedin": <true|false>, "has_intent_data": <true|false> }
}
Rating scale: 0 = none/unknown, 5 = average, 10 = exceptional.`;

    const response = await context.fetch(geminiEndpoint(), {
        method: 'POST',
        headers: geminiHeaders(),
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Account brief:\n${brief.slice(0, 4000)}` },
            ],
            temperature: 0.2,
        }),
    });
    if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(response.data)}`);

    const raw = response.data.choices[0].message.content;
    context.log('LLM Sales Raw Output:', raw.slice(0, 400));
    const parsed = extractJson(raw);
    const traits = projectAccountSchema(parsed, accountId, (mode as PipelineMode) ?? 'sales');

    context.log('Extracted account traits:', JSON.stringify({
        company: traits.company_name, icp: traits.icp_fit.rating, intent: traits.intent_signals.rating,
        arr: traits.deal_size_potential, risk: traits.risk_signals.rating,
    }));

    const traitsCubby = context.cubby('hiring-traits');
    traitsCubby.json.set(`/${accountId}`, traits);
    return { success: true, traits };
}
