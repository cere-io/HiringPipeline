import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function extractJsonFromText(raw: string): any {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found in scorer output');
    return JSON.parse(cleaned.slice(start, end + 1));
}

const DEFAULT_WEIGHTS = {
    skills: 0.1, years_of_experience: 0.1, company_stages: 0.08, education_level: 0.07,
    schools: 0.08, hard_things_done: 0.215, hackathons: 0.075,
    open_source_contributions: 0.1, company_signals: 0.14
};

export async function POST(req: Request) {
    try {
        const { candidateId, role, traits, candidateName } = await req.json();
        if (!candidateId || !role || !traits) {
            return NextResponse.json({ success: false, error: 'Missing candidateId, role, or traits' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        const signals = {
            skills_count: traits.skills?.length || 0,
            years_of_experience: traits.years_of_experience || 0,
            company_stages: traits.company_stages || [],
            education_level: traits.education_level || 'Unknown',
            schools_rating: traits.schools?.rating || 0,
            hard_things_rating: traits.hard_things_done?.rating || 0,
            hackathons_rating: traits.hackathons?.rating || 0,
            oss_rating: traits.open_source_contributions?.rating || 0,
            company_signals_rating: traits.company_signals?.rating || 0,
        };

        const systemPrompt = `You are a hiring scorer. Given candidate signals and trait weights for "${role}", output a composite score 0-100.
Return ONLY: {"composite_score": <number>, "reasoning": "<1-2 sentence explanation>"}

Weights: ${JSON.stringify(DEFAULT_WEIGHTS)}

Scoring guidance:
- Each trait category is rated 0-10. Multiply by its weight.
- Adjust ±15 points based on role fit, career trajectory, and standout factors.
- 70+ = strong candidate, 50-69 = maybe, <50 = likely pass.`;

        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Candidate signals:\n${JSON.stringify(signals, null, 2)}` }
                ],
                temperature: 0.3
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ success: false, error: `Gemini ${res.status}: ${errText}` }, { status: 502 });
        }

        const data = await res.json();
        const rawContent = data.choices[0].message.content;
        const parsed = extractJsonFromText(rawContent);

        const score = {
            id: candidateId,
            composite_score: Number(parsed.composite_score) || 0,
            reasoning: parsed.reasoning || '',
            weights_used: DEFAULT_WEIGHTS,
            timestamp: new Date().toISOString(),
        };

        const SCHEMA_ID = 'hiring-hiring-v1';
        try {
            await Promise.all([
                supabase.from('ci_traits').upsert({
                    schema_id: SCHEMA_ID,
                    subject_id: candidateId,
                    traits: {
                        skills: traits.skills || [],
                        years_of_experience: traits.years_of_experience || 0,
                        company_stages: traits.company_stages || [],
                        education_level: traits.education_level || 'None',
                        schools: traits.schools || { items: [], rating: 0 },
                        hard_things_done: traits.hard_things_done || { items: [], rating: 0 },
                        hackathons: traits.hackathons || { items: [], rating: 0 },
                        open_source_contributions: traits.open_source_contributions || { items: [], rating: 0 },
                        company_signals: traits.company_signals || { items: [], rating: 0 },
                        conclusive_score: traits.conclusive_score || 0,
                        dimensions: traits.dimensions || {},
                    },
                    profile_scores: traits.profile_dna || null,
                    subject_name: candidateName || traits.candidate_name || null,
                    subject_meta: {
                        role,
                        source_completeness: traits.source_completeness || { has_resume: true, has_linkedin: false },
                        human_feedback_score: traits.human_feedback_score || null,
                    },
                    extracted_at: traits.extracted_at || new Date().toISOString(),
                }, { onConflict: 'schema_id,subject_id' }),
                supabase.from('ci_scores').upsert({
                    schema_id: SCHEMA_ID,
                    subject_id: candidateId,
                    role,
                    composite_score: score.composite_score,
                    reasoning: score.reasoning,
                    weights_used: score.weights_used,
                    scored_at: score.timestamp,
                }, { onConflict: 'schema_id,subject_id' }),
                supabase.from('pipeline_events').insert([
                    { id: `evt-app-${Date.now()}`, event_type: 'NEW_APPLICATION', candidate_id: candidateId, payload: { role, source: 'ui' }, source: 'ui' },
                    { id: `evt-score-${Date.now() + 1}`, event_type: 'STAGE_CHANGE', candidate_id: candidateId, payload: { previousStage: 'applied', newStage: 'ai_scored', role, score: score.composite_score }, source: 'ui' },
                ]),
            ]);
        } catch (e: any) {
            console.error('[score] Supabase write error:', e.message);
        }

        // Write to cubbies for local dev (non-critical)
        try {
            const { mockCubbies } = await import('@/lib/runtime');
            await mockCubbies['hiring-traits']?.json?.set(`/${candidateId}`, traits);
            await mockCubbies['hiring-scores']?.json?.set(`/${candidateId}`, score);
            await mockCubbies['hiring-status']?.json?.set(`/${candidateId}`, {
                candidate_id: candidateId, role, stage: 'ai_scored',
                created_at: score.timestamp, updated_at: score.timestamp,
            });
        } catch {}

        return NextResponse.json({
            success: true,
            score,
            logs: [`Score: ${score.composite_score} — ${score.reasoning}`],
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
