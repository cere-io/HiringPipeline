import { NextResponse } from 'next/server';
import { analyzeTranscript, createContext } from '@/lib/runtime';
import { Event } from '@/lib/agents/types';

/**
 * Expected Webhook Payload from HR-2026-E2E Email Scraper
 * {
 *   "candidateId": "join-123",
 *   "role": "engineer",
 *   "transcriptText": "Full text of the interview..."
 * }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        const candidateId = body.candidateId || body.id; 
        const role = body.role || 'engineer';
        const transcriptText = body.transcriptText || body.text;

        if (!candidateId || !transcriptText) {
            return NextResponse.json({ success: false, error: 'Missing candidateId or transcriptText in webhook payload' }, { status: 400 });
        }

        console.log(`[Webhook] Received Interview Transcript for ${candidateId}`);

        const useRealNode = process.env.NEXT_PUBLIC_USE_REAL_DDC_NODE === 'true';

        if (useRealNode) {
            const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'https://compute-1.devnet.ddc-dragon.com';
            const event: Event = {
                id: `evt-${Date.now()}`,
                event_type: 'INTERVIEW_TRANSCRIPT',
                app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
                account_id: 'hr-2026-e2e',
                timestamp: new Date().toISOString(),
                signature: 'sig',
                context_path: { agent_service: 'hiring', workspace: 'ws-1' },
                payload: { candidateId, role, transcriptText }
            };
            
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] INTERVIEW_TRANSCRIPT event forwarded to real DDC Node Event Runtime'] });
        } else {
            // Local Mock Execution
            const { context, logs } = createContext();
            
            // Execute the transcript analyzer agent
            const result = await analyzeTranscript({ candidateId, role, transcriptText }, context);
            return NextResponse.json({ ...result, logs, source: 'HR-2026-E2E Email Scraper' });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
