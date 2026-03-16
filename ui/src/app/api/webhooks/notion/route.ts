import { NextResponse } from 'next/server';
import { distillExecute, createContext, logPipelineEvent } from '@/lib/runtime';
import { Event } from '@/lib/agents/types';

/**
 * Expected Webhook Payload from Notion (via HR-2026-E2E integration)
 * {
 *   "candidateId": "join-id-or-notion-id",
 *   "role": "engineer",
 *   "humanScore": 8,
 *   "notes": "Great candidate, strong technical skills."
 * }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        // Extract the relevant fields from the HR-2026-E2E / Notion webhook
        const candidateId = body.candidateId || body.id; // Fallbacks depending on exact payload
        const role = body.role || 'engineer';
        const humanScore = body.humanScore;

        if (!candidateId || typeof humanScore !== 'number') {
            return NextResponse.json({ success: false, error: 'Missing candidateId or humanScore in Notion webhook payload' }, { status: 400 });
        }

        console.log(`[Webhook] Received Notion Human Score for ${candidateId}: ${humanScore}`);
        logPipelineEvent(`evt-${Date.now()}`, 'OUTCOME_RECORDED', candidateId, { role, humanScore }, 'notion').catch(() => {});

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
                payload: { candidateId, role, outcome: humanScore } // Pass the numeric score as outcome
            };
            
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Notion Outcome event forwarded to real DDC Node Event Runtime'] });
        } else {
            // Local Mock Execution
            const { context, logs } = createContext();
            
            // We pass the humanScore directly as the outcome, our updated distillation agent handles numeric scores!
            const result = await distillExecute({ candidateId, role, outcome: humanScore }, context);
            return NextResponse.json({ success: true, result, logs, source: 'Notion Webhook' });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
