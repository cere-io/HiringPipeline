import { Event, Context, TraitWeights, CandidateTraits, SourcingStats } from './types';

export async function handle(event: Event, context: Context) {
    return distill(event.payload, context);
}

const WEIGHT_KEYS: (keyof TraitWeights)[] = [
    'skills', 'years_of_experience', 'company_stages', 'education_level', 'schools',
    'hard_things_done', 'hackathons', 'open_source_contributions', 'company_signals'
];

const DEFAULT_WEIGHTS: TraitWeights = {
    skills: 0.07, years_of_experience: 0.085, company_stages: 0.1, education_level: 0.085,
    schools: 0.115, hard_things_done: 0.215, hackathons: 0.1,
    open_source_contributions: 0.1, company_signals: 0.14
};

function geminiEndpoint(): string {
    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
}

function geminiHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
    };
}

/** Normalize so all 9 weights sum to exactly 1.0. */
function normalize(w: TraitWeights): TraitWeights {
    const sum = WEIGHT_KEYS.reduce((acc, k) => acc + (w[k] ?? 0), 0);
    if (sum === 0) return { ...DEFAULT_WEIGHTS };
    const result = { ...w } as TraitWeights;
    for (const k of WEIGHT_KEYS) {
        result[k] = parseFloat(((w[k] ?? 0) / sum).toFixed(6));
    }
    return result;
}

function extractJson(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

/** All 9 values must be finite numbers — Gemini should never produce math expressions. */
function validateWeights(raw: any): TraitWeights {
    const result: Partial<TraitWeights> = {};
    for (const k of WEIGHT_KEYS) {
        const n = Number(raw[k]);
        if (!Number.isFinite(n)) throw new Error(`Non-numeric weight for "${k}": ${JSON.stringify(raw[k])}`);
        result[k] = n;
    }
    return result as TraitWeights;
}

/** Update aggregate sourcing stats in hiring-meta/sourcing_stats. */
function updateSourcingStats(
    metaCubby: any,
    source: string,
    aiScore: number,
    humanScore: number,
    performanceScore: number | null
): void {
    const key = '/sourcing_stats';
    const stats: SourcingStats = metaCubby.json.get(key) ?? {};
    const entry = stats[source] ?? { total_candidates: 0, avg_ai_score: 0, avg_human_score: 0, avg_performance_score: 0, hired_count: 0 };

    const n = entry.total_candidates;
    entry.avg_ai_score        = parseFloat(((entry.avg_ai_score * n + aiScore) / (n + 1)).toFixed(2));
    entry.avg_human_score     = parseFloat(((entry.avg_human_score * n + humanScore) / (n + 1)).toFixed(2));
    if (performanceScore !== null) {
        entry.avg_performance_score = parseFloat(((entry.avg_performance_score * n + performanceScore) / (n + 1)).toFixed(2));
    }
    if (humanScore >= 7) entry.hired_count += 1;
    entry.total_candidates = n + 1;
    stats[source] = entry;
    metaCubby.json.set(key, stats);
}

export async function distill(payload: any, context: Context) {
    const { candidateId, role, outcome } = payload;

    if (!candidateId || !role || outcome === undefined) {
        return { success: false, error: 'Missing candidateId, role, or outcome' };
    }

    context.log('Distilling outcome for candidate:', candidateId, 'Outcome:', outcome);

    const traitsCubby   = context.cubby('hiring-traits');
    const metaCubby     = context.cubby('hiring-meta');
    const outcomesCubby = context.cubby('hiring-outcomes');

    outcomesCubby.json.set(`/${candidateId}`, { outcome, timestamp: new Date().toISOString() });

    const traits: CandidateTraits = traitsCubby.json.get(`/${candidateId}`);
    if (!traits) {
        return { success: false, error: 'Traits not found for candidate — run pipeline first' };
    }

    // Persist human feedback score back to the trait record (data-model requirement)
    traitsCubby.json.set(`/${candidateId}`, { ...traits, human_feedback_score: outcome });

    // Update aggregate sourcing intelligence
    const source = (payload.source as string) || 'unknown';
    const aiScore = traits.conclusive_score ?? 0;
    const isPerformanceReview = payload.isPerformanceReview === true;
    updateSourcingStats(metaCubby, source, aiScore, isPerformanceReview ? (traits.human_feedback_score ?? outcome) : outcome, isPerformanceReview ? outcome : null);
    context.log(`Sourcing stats updated for source: ${source}`);

    const currentWeights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`) ?? DEFAULT_WEIGHTS;

    context.log('Calling Gemini 2.5 Flash for compound intelligence weight update...');

    const systemPrompt = `You are the learning algorithm of a compound-intelligence hiring system.
Your job: given a candidate's trait signals and the current role weights, return UPDATED weights that reflect what this hire outcome teaches us.

RULES:
- Return ONLY a raw JSON object. No markdown. No explanation. No comments.
- All 9 values MUST be plain decimal numbers (e.g. 0.12). No expressions, no strings.
- All 9 values MUST sum to exactly 1.0.
- Maximum allowed change per weight: 0.05.
- outcome >= 7 = great hire → boost weights for the candidate's strongest traits.
- outcome <= 4 = poor hire → reduce weights for the candidate's strongest traits, rebalance toward baseline.
- outcome 5-6 = average → minor rebalance toward baseline.

Baseline weights for reference:
${JSON.stringify(DEFAULT_WEIGHTS)}`;

    const userPrompt = `Outcome score: ${outcome}/10
Current weights: ${JSON.stringify(currentWeights)}
Candidate trait ratings:
- hard_things_done: ${traits.hard_things_done.rating}/10
- company_signals: ${traits.company_signals.rating}/10
- schools: ${traits.schools.rating}/10
- hackathons: ${traits.hackathons.rating}/10
- open_source_contributions: ${traits.open_source_contributions.rating}/10
- years_of_experience: ${traits.years_of_experience} years
- skills count: ${traits.skills.length}
- education: ${traits.education_level}
- company_stages: ${traits.company_stages.join(', ')}`;

    const response = await context.fetch(geminiEndpoint(), {
        method: 'POST',
        headers: geminiHeaders(),
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const rawContent = response.data.choices[0].message.content;
    context.log('LLM Compound Learning Output:', rawContent.slice(0, 400) + (rawContent.length > 400 ? '...' : ''));

    const parsed = extractJson(rawContent);
    const validated = validateWeights(parsed);
    const newWeights = normalize(validated);

    metaCubby.json.set(`/trait_weights/${role}`, newWeights);
    context.log('Weights updated (Gemini) for role:', role);
    context.log('New Weights:', JSON.stringify(newWeights));

    return { success: true, new_weights: newWeights };
}
