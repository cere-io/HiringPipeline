import { NextResponse } from 'next/server';
import { conciergeHandle, createContext } from '@/lib/runtime';
import { Event } from '@/lib/agents/types';

/**
 * Expected Webhook Payload from Join.com (or forwarded by HR-2026-E2E)
 * The structure might vary, but we attempt to extract the key components.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        // Try to parse the standard Join.com webhook or fallback to flat structure
        const candidateId = body.candidate?.id || body.candidateId || `join-${Date.now()}`;
        const role = body.job?.title || body.role || 'engineer'; // Default to engineer if we can't parse it
        
        // The resume text might be deep in the payload or already extracted by the HR-2026-E2E layer
        const resumeText = body.candidate?.resume_text || body.resumeText || "Candidate applied via Join.com without parsable resume text.";

        console.log(`[Webhook] Received Join Application for ${candidateId} (Role: ${role})`);

        const event: Event = {
            id: `evt-${Date.now()}`,
            event_type: 'NEW_APPLICATION',
            app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
            account_id: 'join-integration',
            timestamp: new Date().toISOString(),
            signature: 'sig',
            context_path: { agent_service: 'hiring', workspace: 'ws-1' },
            payload: {
                candidateId,
                role,
                resumeText
            }
        };

        const useRealNode = process.env.NEXT_PUBLIC_USE_REAL_DDC_NODE === 'true';

        if (useRealNode) {
            const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'https://compute-1.devnet.ddc-dragon.com';
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Join event forwarded to real DDC Node Event Runtime'] });
        } else {
            // Local Mock Execution
            const { context, logs } = createContext();
            const result = await conciergeHandle(event, context);
            return NextResponse.json({ success: true, result, logs, source: 'Join Webhook' });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
