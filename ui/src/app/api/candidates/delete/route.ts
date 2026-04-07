import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const { candidateId } = await req.json();

        if (!candidateId) {
            return NextResponse.json({ success: false, error: 'Missing candidateId' }, { status: 400 });
        }

        const SCHEMA_ID = 'hiring-hiring-v1';
        const tables = ['ci_traits', 'ci_scores', 'ci_outcomes', 'ci_analyses'];
        const results: Record<string, string> = {};

        for (const table of tables) {
            const { error } = await supabase.from(table).delete()
                .eq('schema_id', SCHEMA_ID).eq('subject_id', candidateId);
            results[table] = error ? error.message : 'deleted';
        }

        // Remove related pipeline_events
        const { error: evtError } = await supabase
            .from('pipeline_events')
            .delete()
            .eq('candidate_id', candidateId);
        results['pipeline_events'] = evtError ? evtError.message : 'deleted';

        // Also clear from in-memory cubbies if available
        try {
            const { mockCubbies } = await import('@/lib/runtime');
            for (const cubby of ['hiring-traits', 'hiring-scores', 'hiring-outcomes', 'hiring-interviews', 'hiring-status']) {
                await mockCubbies[cubby]?.json?.delete(`/${candidateId}`);
            }
        } catch {}

        return NextResponse.json({ success: true, candidateId, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
