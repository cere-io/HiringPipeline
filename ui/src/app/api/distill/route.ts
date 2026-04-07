import { NextResponse } from 'next/server';
import { distillExecute, createContext, mockCubbies } from '@/lib/runtime';
import { supabase } from '@/lib/supabase';
import type { Event, CandidateStatus } from '@/lib/agents/types';

/**
 * On Vercel serverless, cubbies start empty each invocation.
 * Pre-load candidate data from Supabase so the distillation agent can read it.
 */
const SCHEMA_ID = 'hiring-hiring-v1';

async function hydrateFromSupabase(candidateId: string, context: ReturnType<typeof createContext>['context']) {
    try {
        const [traitsRes, scoresRes, outcomesRes] = await Promise.all([
            supabase.from('ci_traits').select('*').eq('schema_id', SCHEMA_ID).eq('subject_id', candidateId).single(),
            supabase.from('ci_scores').select('*').eq('schema_id', SCHEMA_ID).eq('subject_id', candidateId).single(),
            supabase.from('ci_outcomes').select('*').eq('schema_id', SCHEMA_ID).eq('subject_id', candidateId).single(),
        ]);

        if (traitsRes.data) {
            const row = traitsRes.data;
            const flat = {
                ...(row.traits || {}),
                profile_dna: row.profile_scores || null,
                candidate_name: row.subject_name,
                ...(row.subject_meta || {}),
                extracted_at: row.extracted_at,
            };
            await context.cubby('hiring-traits').json.set(`/${candidateId}`, flat);
        }
        if (scoresRes.data) {
            await context.cubby('hiring-scores').json.set(`/${candidateId}`, {
                id: scoresRes.data.subject_id,
                composite_score: scoresRes.data.composite_score,
                reasoning: scoresRes.data.reasoning,
                weights_used: scoresRes.data.weights_used,
                timestamp: scoresRes.data.scored_at,
            });
        }
        if (outcomesRes.data) {
            await context.cubby('hiring-outcomes').json.set(`/${candidateId}`, {
                candidate_id: outcomesRes.data.subject_id,
                outcome: outcomesRes.data.outcome,
                role: outcomesRes.data.role,
                feedback: outcomesRes.data.feedback,
                is_performance_review: outcomesRes.data.is_performance_review,
                recorded_at: outcomesRes.data.recorded_at,
            });
        }
    } catch {}
}

export async function POST(req: Request) {
    try {
        const { candidateId, role, outcome, source, isPerformanceReview, feedback, reasons } = await req.json();
        
        const useRealNode = process.env.NEXT_PUBLIC_USE_REAL_DDC_NODE === 'true';

        if (useRealNode) {
            const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'https://compute-1.devnet.ddc-dragon.com';
            const event: Event = {
                id: `evt-${Date.now()}`,
                event_type: 'OUTCOME_RECORDED',
                app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
                account_id: 'user-1',
                timestamp: new Date().toISOString(),
                signature: 'sig',
                context_path: { agent_service: 'hiring', workspace: 'ws-1' },
                payload: { candidateId, role, outcome }
            };
            
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Outcome event forwarded to real DDC Node Event Runtime'] });
        } else {
            const { context, logs } = createContext();

            // Hydrate cubbies from Supabase (needed on Vercel where memory is fresh)
            await hydrateFromSupabase(candidateId, context);

            if (isPerformanceReview) {
                const status: CandidateStatus | null = await mockCubbies['hiring-status']?.json?.get(`/${candidateId}`);
                if (status && status.stage !== 'hired' && status.stage !== 'performance_review') {
                    return NextResponse.json({ success: false, error: `Cannot submit performance review — candidate stage is "${status.stage}", must be "hired"` }, { status: 400 });
                }
                if (status) {
                    await mockCubbies['hiring-status'].json.set(`/${candidateId}`, { ...status, stage: 'performance_review', updated_at: new Date().toISOString() });
                }
            }

            const result = await distillExecute({ candidateId, role, outcome, source, isPerformanceReview, feedback, reasons }, context);

            try {
                await supabase.from('ci_outcomes').upsert({
                    schema_id: SCHEMA_ID,
                    subject_id: candidateId,
                    outcome,
                    role,
                    feedback: feedback || null,
                    is_performance_review: isPerformanceReview || false,
                    recorded_at: new Date().toISOString(),
                }, { onConflict: 'schema_id,subject_id' });
            } catch {}

            if (result.new_weights) {
                try {
                    await supabase.from('schema_weights').upsert({
                        schema_id: SCHEMA_ID,
                        role,
                        weights: result.new_weights,
                    }, { onConflict: 'schema_id,role' });
                } catch {}
            }

            // Persist signals to pipeline_events for Vercel durability
            if (reasons && reasons.length > 0) {
                try {
                    await supabase.from('pipeline_events').insert({
                        id: `evt-sig-${Date.now()}`,
                        event_type: 'SIGNALS_INDEXED',
                        candidate_id: candidateId,
                        payload: { reasons, outcome, role },
                        source: 'distill',
                    });
                } catch {}
            }

            return NextResponse.json({ ...result, logs });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
