import { NextResponse } from 'next/server';
import { createContext, mockCubbies, logPipelineEvent } from '@/lib/runtime';
import { score as scoreExecute } from '@/lib/agents/scorer';
import type { CandidateStatus } from '@/lib/agents/types';

export const maxDuration = 10;

export async function POST(req: Request) {
    try {
        const { candidateId, role, traits } = await req.json();

        if (!candidateId || !role) {
            return NextResponse.json({ success: false, error: 'Missing candidateId or role' }, { status: 400 });
        }

        const { context, logs } = createContext();

        // Inject traits into cubby so the scorer can read them
        if (traits) {
            await context.cubby('hiring-traits').json.set(`/${candidateId}`, traits);
        }

        const result = await scoreExecute({ candidateId, role }, context);

        // Write pipeline status
        const now = new Date().toISOString();
        const status: CandidateStatus = {
            candidate_id: candidateId,
            role,
            stage: 'ai_scored',
            created_at: now,
            updated_at: now,
        };
        await mockCubbies['hiring-status'].json.set(`/${candidateId}`, status);

        logPipelineEvent(`evt-score-${Date.now()}`, 'STAGE_CHANGE', candidateId, {
            previousStage: 'applied',
            newStage: 'ai_scored',
            role,
        }, 'ui').catch(() => {});

        return NextResponse.json({ success: true, score: result.score || result, logs });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
