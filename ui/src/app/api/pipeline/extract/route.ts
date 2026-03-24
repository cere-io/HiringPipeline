import { NextResponse } from 'next/server';
import { createContext, logPipelineEvent } from '@/lib/runtime';
import { extract as traitExtract } from '@/lib/agents/trait-extractor';

export const maxDuration = 10;

export async function POST(req: Request) {
    try {
        const { candidateId, role, resumeText } = await req.json();

        if (!candidateId || !role || !resumeText) {
            return NextResponse.json({ success: false, error: 'Missing candidateId, role, or resumeText' }, { status: 400 });
        }

        const { context, logs } = createContext();
        const result = await traitExtract({ candidateId, resumeText, role }, context);

        logPipelineEvent(`evt-${Date.now()}`, 'NEW_APPLICATION', candidateId, { role, source: 'ui' }, 'ui').catch(() => {});

        return NextResponse.json({ success: true, traits: result.traits || result, logs });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
