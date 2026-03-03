import { NextResponse } from 'next/server';
import { distillExecute, createContext } from '@/lib/runtime';
import { Event } from '@/lib/agents/types';

export async function POST(req: Request) {
    try {
        const { candidateId, role, outcome } = await req.json();
        
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
                payload: { candidateId, role, outcome }
            };
            
            const res = await fetch(`${eventRuntimeUrl}/api/v1/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            const data = await res.json();
            return NextResponse.json({ ...data, logs: ['[LIVE NODE] Outcome event forwarded to real DDC Node Event Runtime'] });
        } else {
            const { context, logs } = createContext();
            const result = await distillExecute({ candidateId, role, outcome }, context);
            return NextResponse.json({ ...result, logs });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
