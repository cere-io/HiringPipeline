import { Event, Context, TraitWeights, CandidateScore, CandidateTraits, AccountTraits, SalesTraitWeights, PipelineMode, DEFAULT_SALES_WEIGHTS } from '../types';

export async function handle(event: Event, context: Context) {
    const mode: PipelineMode = event.payload?.mode ?? 'recruiting';
    if (mode === 'recruiting') return score(event.payload, context);
    return scoreSales(event.payload, context);
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

function extractJson(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found in scorer output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

export async function score(payload: any, context: Context) {
    const { candidateId, role, mode } = payload;

    if (mode && mode !== 'recruiting') return scoreSales(payload, context);
    if (!candidateId || !role) {
        return { success: false, error: 'Missing candidateId or role' };
    }

    context.log('Scoring candidate:', candidateId, 'for role:', role);

    const traitsCubby = context.cubby('hiring-traits');
    const traits: CandidateTraits = traitsCubby.json.get(`/${candidateId}`);
    if (!traits) throw new Error(`Traits not found for candidate ${candidateId}`);

    const metaCubby = context.cubby('hiring-meta');
    let weights: TraitWeights = metaCubby.json.get(`/trait_weights/${role}`);

    if (!weights) {
        context.log(`No weights found for ${role}, initialising defaults`);
        weights = {
            skills: 0.1, years_of_experience: 0.1, company_stages: 0.1, education_level: 0.1,
            schools: 0.1, hard_things_done: 0.2, hackathons: 0.1,
            open_source_contributions: 0.1, company_signals: 0.1
        };
        metaCubby.json.set(`/trait_weights/${role}`, weights);
    }

    const signals = {
        skills_count: traits.skills.length,
        years_of_experience: traits.years_of_experience,
        company_stages: traits.company_stages,
        education_level: traits.education_level,
        schools_rating: traits.schools.rating,
        hard_things_rating: traits.hard_things_done.rating,
        hackathons_rating: traits.hackathons.rating,
        oss_rating: traits.open_source_contributions.rating,
        company_signals_rating: traits.company_signals.rating
    };

    context.log('Calling Gemini 2.0 Flash for composite scoring...');

    const prompt = `You are a hiring scoring engine.

Role: ${role}
Candidate signals: ${JSON.stringify(signals)}
Role weights (each weight = importance of that signal, all sum to 1.0): ${JSON.stringify(weights)}

Score this candidate 0-100 by applying the weights to each signal. Return ONLY this JSON:
{"composite_score": <number 0-100>, "reasoning": "<one concise sentence>"}`;

    const response = await context.fetch(geminiEndpoint(), {
        method: 'POST',
        headers: geminiHeaders(),
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'system', content: 'You are a precise scoring engine. Output only valid JSON, nothing else.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const raw = response.data.choices[0].message.content;
    context.log('LLM Scorer Output:', raw.slice(0, 300));

    const parsed = extractJson(raw);
    if (typeof parsed.composite_score !== 'number') {
        throw new Error('composite_score missing or non-numeric in Gemini output');
    }

    const compositeScore = Math.max(0, Math.min(100, parsed.composite_score));
    context.log(`LLM Score: ${compositeScore} — ${parsed.reasoning}`);

    traits.conclusive_score = parseFloat(compositeScore.toFixed(2));
    traitsCubby.json.set(`/${candidateId}`, traits);

    const scoreRecord: CandidateScore = {
        id: candidateId,
        composite_score: traits.conclusive_score,
        weights_used: weights,
        timestamp: new Date().toISOString()
    };

    const scoresCubby = context.cubby('hiring-scores');
    scoresCubby.json.set(`/${candidateId}`, scoreRecord);
    context.log('Saved score to hiring-scores cubby:', scoreRecord.composite_score);

    return { success: true, score: scoreRecord };
}

/** Sales-mode composite scorer. Formula-based (no LLM) for determinism + zero LLM cost.
 *  Same compound-learning loop: weights are per-segment, tuned by distillation from AE feedback. */
export async function scoreSales(payload: any, context: Context) {
    const { candidateId, role, mode } = payload;
    const accountId = candidateId;
    const segment = role || 'sales';
    if (!accountId) return { success: false, error: 'Missing accountId (candidateId)' };

    context.log('Scoring account:', accountId, 'segment:', segment, 'mode:', mode);
    const traitsCubby = context.cubby('hiring-traits');
    const traits: AccountTraits = traitsCubby.json.get(`/${accountId}`);
    if (!traits) throw new Error(`Account traits not found for ${accountId}`);

    const metaCubby = context.cubby('hiring-meta');
    let weights: SalesTraitWeights = metaCubby.json.get(`/sales_weights/${segment}`);
    if (!weights) {
        weights = { ...DEFAULT_SALES_WEIGHTS };
        metaCubby.json.set(`/sales_weights/${segment}`, weights);
    }

    const arrRating = Math.min(Math.log10(Math.max(traits.deal_size_potential, 1000)) / 6, 1) * 10;
    const components: Record<keyof SalesTraitWeights, number> = {
        icp_fit: traits.icp_fit.rating,
        intent_signals: traits.intent_signals.rating,
        deal_size_potential: arrRating,
        champion_strength: traits.champion_signals.rating,
        timing: traits.timing_signals.rating,
        decision_velocity: 5,
        competitive_displacement: traits.competitive_signals.rating,
        relationship_warmth: traits.relationship_warmth.rating,
        risk_signals: traits.risk_signals.rating,
    };
    let total = 0;
    for (const k of Object.keys(weights) as (keyof SalesTraitWeights)[]) total += components[k] * weights[k];
    const compositeScore = Math.max(0, Math.min(100, total));

    traits.conclusive_score = parseFloat(compositeScore.toFixed(2));
    traitsCubby.json.set(`/${accountId}`, traits);

    const scoreRecord: CandidateScore = {
        id: accountId,
        mode: mode as PipelineMode,
        composite_score: traits.conclusive_score,
        weights_used: weights,
        timestamp: new Date().toISOString(),
    };
    const scoresCubby = context.cubby('hiring-scores');
    scoresCubby.json.set(`/${accountId}`, scoreRecord);
    context.log('Saved sales score:', scoreRecord.composite_score);
    return { success: true, score: scoreRecord };
}
