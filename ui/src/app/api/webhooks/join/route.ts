import { NextResponse } from 'next/server';
import { conciergeHandle, createContext, logPipelineEvent, mockCubbies } from '@/lib/runtime';
import { Event, CandidateStatus } from '@/lib/agents/types';

/**
 * Receives candidate applications forwarded from:
 *   - The Join cron poller (/api/cron/join-poll)
 *   - Zapier/Make automation triggers
 *   - Direct API calls from HR-2026-E2E or the UI
 *
 * Normalizes across all payload shapes before feeding the pipeline.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Normalize across: Join cron poller, Zapier/Make forwarded, flat UI payloads
        const candidateId =
            body.candidateId ||                          // cron poller / flat
            (body.candidate?.id ? `join-${body.candidate.id}` : null) ||  // raw Join shape
            `join-${Date.now()}`;

        const role =
            body.role ||              // cron poller / flat
            body.job?.title ||        // raw Join shape
            'engineer';

        const resumeText =
            body.resumeText ||                  // cron poller / flat (already extracted)
            body.candidate?.resume_text ||      // Zapier enriched
            'Candidate applied via Join.com without parsable resume text.';

        const source = body.source || 'join-webhook';
        const candidateName =
            body.candidateName ||
            (body.candidate ? `${body.candidate.firstName || ''} ${body.candidate.lastName || ''}`.trim() : null);
        const candidateEmail = body.candidateEmail || body.candidate?.email;
        const linkedinUrl = body.linkedinUrl || body.candidate?.professionalLinks?.find((l: any) => l.type === 'LINKEDIN')?.url;

        console.log(`[Webhook] Received Join Application for ${candidateId} (Role: ${role}, Source: ${source})`);

        const eventId = `evt-${Date.now()}`;
        logPipelineEvent(eventId, 'NEW_APPLICATION', candidateId, { role, source }, source).catch(() => {});

        const event: Event = {
            id: eventId,
            event_type: 'NEW_APPLICATION',
            app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
            account_id: 'join-integration',
            timestamp: new Date().toISOString(),
            signature: 'sig',
            context_path: { agent_service: 'hiring', workspace: 'ws-1' },
            payload: { candidateId, role, resumeText },
        };

        const useRealNode = process.env.NEXT_PUBLIC_USE_REAL_DDC_NODE === 'true';

        if (useRealNode) {
            const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'https://compute-1.devnet.ddc-dragon.com';
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Join event forwarded to real DDC Node Event Runtime'] });
        } else {
            const { context, logs } = createContext();
            const result = await conciergeHandle(event, context);

            const now = new Date().toISOString();
            const status: CandidateStatus = {
                candidate_id: candidateId,
                role,
                stage: 'ai_scored',
                created_at: now,
                updated_at: now,
            };
            await mockCubbies['hiring-status'].json.set(`/${candidateId}`, status);

            // Store candidate metadata for UI display
            if (candidateName || candidateEmail || linkedinUrl) {
                const existingTraits = await mockCubbies['hiring-traits'].json.get(`/${candidateId}`);
                if (existingTraits) {
                    await mockCubbies['hiring-traits'].json.set(`/${candidateId}`, {
                        ...existingTraits,
                        ...(candidateName && { candidate_name: candidateName }),
                        ...(candidateEmail && { candidate_email: candidateEmail }),
                        ...(linkedinUrl && { linkedin_url: linkedinUrl }),
                        role,
                        source: source.replace('-webhook', '').replace('-test', ''),
                    });
                }
            }

            return NextResponse.json({ success: true, result, logs, source });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
