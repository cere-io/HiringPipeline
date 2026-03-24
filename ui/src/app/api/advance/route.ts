import { NextResponse } from 'next/server';
import { mockCubbies } from '@/lib/runtime';
import { CandidateStatus, PipelineStage } from '@/lib/agents/types';

const STAGE_ORDER: PipelineStage[] = ['applied', 'ai_scored', 'human_review', 'interview', 'hired', 'performance_review'];

function nextStage(current: PipelineStage): PipelineStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
}

export async function POST(req: Request) {
    try {
        const { candidateId, decision, reasons } = await req.json();

        if (!candidateId || !decision) {
            return NextResponse.json({ success: false, error: 'Missing candidateId or decision' }, { status: 400 });
        }

        const statusCubby = mockCubbies['hiring-status'];
        const status: CandidateStatus | null = await statusCubby.json.get(`/${candidateId}`);

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
            return NextResponse.json({ success: true, status: updated });
        }

        return NextResponse.json({ success: false, error: 'Invalid decision. Use "advance" or "reject".' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
