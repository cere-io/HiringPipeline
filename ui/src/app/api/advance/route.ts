import { NextResponse } from 'next/server';
import { mockCubbies, logPipelineEvent } from '@/lib/runtime';
import { supabase } from '@/lib/supabase';
import { CandidateStatus, PipelineStage } from '@/lib/agents/types';

const STAGE_ORDER: PipelineStage[] = ['applied', 'ai_scored', 'human_review', 'interview', 'hired', 'performance_review'];

function nextStage(current: PipelineStage): PipelineStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
}

/**
 * Reconstruct candidate status from pipeline_events when in-memory cubby is empty.
 * This handles the Vercel serverless case where each invocation has fresh memory.
 */
async function getStatusFromEvents(candidateId: string): Promise<CandidateStatus | null> {
    try {
        const { data } = await supabase
            .from('pipeline_events')
            .select('event_type, payload, created_at')
            .eq('candidate_id', candidateId)
            .order('created_at', { ascending: false });

        if (!data || data.length === 0) return null;

        // Find the latest STAGE_CHANGE event, or infer from NEW_APPLICATION
        let stage: PipelineStage = 'applied';
        let role = '';
        let rejectedAtStage: PipelineStage | undefined;
        let rejectionReasons: string[] | undefined;
        let createdAt = '';

        for (const evt of data) {
            if (evt.event_type === 'STAGE_CHANGE') {
                stage = evt.payload?.newStage || stage;
                if (evt.payload?.newStage === 'rejected') {
                    rejectedAtStage = evt.payload?.previousStage;
                    rejectionReasons = evt.payload?.reasons;
                }
            }
            if (evt.event_type === 'NEW_APPLICATION') {
                role = evt.payload?.role || role;
                if (stage === 'applied') stage = 'ai_scored';
                if (!createdAt) createdAt = evt.created_at;
            }
        }

        return {
            candidate_id: candidateId,
            role,
            stage,
            rejected_at_stage: rejectedAtStage,
            rejection_reasons: rejectionReasons,
            created_at: createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const { candidateId, decision, reasons } = await req.json();

        if (!candidateId || !decision) {
            return NextResponse.json({ success: false, error: 'Missing candidateId or decision' }, { status: 400 });
        }

        const statusCubby = mockCubbies['hiring-status'];
        let status: CandidateStatus | null = await statusCubby.json.get(`/${candidateId}`);

        // Fallback: reconstruct status from pipeline_events (handles serverless cold starts)
        if (!status) {
            status = await getStatusFromEvents(candidateId);
        }

        if (!status) {
            return NextResponse.json({ success: false, error: 'Candidate not found in pipeline' }, { status: 404 });
        }

        if (status.stage === 'rejected') {
            return NextResponse.json({ success: false, error: 'Candidate already rejected' }, { status: 400 });
        }

        const now = new Date().toISOString();

        if (decision === 'reject') {
            const rejReasons = Array.isArray(reasons) ? reasons : [];
            const updated: CandidateStatus = {
                ...status,
                stage: 'rejected',
                rejected_at_stage: status.stage,
                ...(rejReasons.length > 0 && { rejection_reasons: rejReasons }),
                updated_at: now,
            };
            await statusCubby.json.set(`/${candidateId}`, updated);

            // Persist stage change to pipeline_events so it survives serverless cold starts
            logPipelineEvent(`evt-stage-${Date.now()}`, 'STAGE_CHANGE', candidateId, {
                previousStage: status.stage,
                newStage: 'rejected',
                reasons: rejReasons.length > 0 ? rejReasons : undefined,
            }, 'advance').catch(() => {});

            return NextResponse.json({ success: true, status: updated });
        }

        if (decision === 'advance') {
            const next = nextStage(status.stage);
            if (!next) {
                return NextResponse.json({ success: false, error: `Cannot advance from stage: ${status.stage}` }, { status: 400 });
            }
            const updated: CandidateStatus = {
                ...status,
                stage: next,
                updated_at: now,
            };
            await statusCubby.json.set(`/${candidateId}`, updated);

            logPipelineEvent(`evt-stage-${Date.now()}`, 'STAGE_CHANGE', candidateId, {
                previousStage: status.stage,
                newStage: next,
            }, 'advance').catch(() => {});

            return NextResponse.json({ success: true, status: updated });
        }

        return NextResponse.json({ success: false, error: 'Invalid decision. Use "advance" or "reject".' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
