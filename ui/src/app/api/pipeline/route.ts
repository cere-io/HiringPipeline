import { NextResponse } from 'next/server';
import { conciergeHandle, createContext } from '@/lib/runtime';
import { Event } from '@/lib/agents/types';

export async function POST(req: Request) {
    try {
        const { candidateId, role, resumeText } = await req.json();

        const event: Event = {
            id: `evt-${Date.now()}`,
            event_type: 'NEW_APPLICATION',
            app_id: process.env.NEXT_PUBLIC_DDC_APP_ID || 'ui-app',
            account_id: 'user-1',
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
            // Forward directly to the real Cere DDC Node Event Runtime
            const eventRuntimeUrl = process.env.EVENT_RUNTIME_URL || 'http://localhost:8084';
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Event forwarded to real DDC Node Event Runtime'] });
        } else {
            // Use local mock runtime
            const { context, logs } = createContext();
            const result = await conciergeHandle(event, context);
            return NextResponse.json({ ...result, logs });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
