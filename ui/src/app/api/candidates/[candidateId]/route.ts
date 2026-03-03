import { NextResponse } from 'next/server';
import { mockCubbies } from '@/lib/runtime';

export async function GET(
    request: Request,
    { params }: { params: { candidateId: string } }
) {
    const candidateId = params.candidateId;

    if (!candidateId) {
        return NextResponse.json({ success: false, error: 'Missing candidateId' }, { status: 400 });
    }

    try {
        const traits = mockCubbies['hiring-traits'].json.get(`/${candidateId}`);
        const score = mockCubbies['hiring-scores'].json.get(`/${candidateId}`);
        const interview = mockCubbies['hiring-interviews'].json.get(`/${candidateId}`);
        const outcome = mockCubbies['hiring-outcomes'].json.get(`/${candidateId}`);

        if (!traits && !score && !interview) {
            return NextResponse.json({ 
                success: false, 
                error: `Candidate ${candidateId} not found in any cubby.` 
            }, { status: 404 });
        }

        // Return a unified view for OpenClaw
        return NextResponse.json({
            success: true,
            candidateId,
            data: {
                traits: traits || null,
                score: score || null,
                interview: interview || null,
                human_outcome: outcome || null,
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
