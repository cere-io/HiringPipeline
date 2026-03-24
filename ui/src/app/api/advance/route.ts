import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { CandidateStatus, PipelineStage } from '@/lib/agents/types';

const STAGE_ORDER: PipelineStage[] = ['applied', 'ai_scored', 'human_review', 'interview', 'hired', 'performance_review'];

function nextStage(current: PipelineStage): PipelineStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
}

async function getStatus(candidateId: string): Promise<CandidateStatus | null> {
    // Try in-memory cubbies first (works locally where memory is shared)
    try {
        const { mockCubbies } = await import('@/lib/runtime');
        const status = await mockCubbies['hiring-status']?.json?.get(`/${candidateId}`);
        if (status) return status;
    } catch {}

    // Fallback: reconstruct from pipeline_events (works on Vercel serverless)
    try {
        const { data } = await supabase
            .from('pipeline_events')
            .select('event_type, payload, created_at')
            .eq('candidate_id', candidateId)
            .order('created_at', { ascending: true });

        if (!data || data.length === 0) return null;

        let stage: PipelineStage = 'applied';
        let role = '';
        let rejectedAtStage: PipelineStage | undefined;
        let rejectionReasons: string[] | undefined;
        let createdAt = '';

        for (const evt of data) {
            if (evt.event_type === 'NEW_APPLICATION') {
                role = evt.payload?.role || role;
                if (stage === 'applied') stage = 'ai_scored';
                if (!createdAt) createdAt = evt.created_at;
            }
            if (evt.event_type === 'STAGE_CHANGE') {
                stage = evt.payload?.newStage || stage;
                if (evt.payload?.newStage === 'rejected') {
                    rejectedAtStage = evt.payload?.previousStage;
                    rejectionReasons = evt.payload?.reasons;
                }
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

async function saveStatus(candidateId: string, status: CandidateStatus): Promise<void> {
    try {
        const { mockCubbies } = await import('@/lib/runtime');
        await mockCubbies['hiring-status']?.json?.set(`/${candidateId}`, status);
    } catch {}
}

async function logEvent(candidateId: string, previousStage: string, newStage: string, reasons?: string[]): Promise<void> {
    try {
        await supabase.from('pipeline_events').insert({
            id: `evt-stage-${Date.now()}`,
            event_type: 'STAGE_CHANGE',
            candidate_id: candidateId,
            payload: { previousStage, newStage, ...(reasons && reasons.length > 0 ? { reasons } : {}) },
            source: 'advance',
        });
    } catch {}
}

export async function POST(req: Request) {
    try {
        const { candidateId, decision, reasons } = await req.json();

        if (!candidateId || !decision) {
            return NextResponse.json({ success: false, error: 'Missing candidateId or decision' }, { status: 400 });
        }

        const status = await getStatus(candidateId);

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
            await saveStatus(candidateId, updated);
            await logEvent(candidateId, status.stage, 'rejected', rejReasons);
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
            await saveStatus(candidateId, updated);
            await logEvent(candidateId, status.stage, next);
            return NextResponse.json({ success: true, status: updated });
        }

        return NextResponse.json({ success: false, error: 'Invalid decision. Use "advance" or "reject".' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
