import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function deleteAll(table: string, schemaId: string) {
  for (let pass = 0; pass < 30; pass++) {
    const { count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('schema_id', schemaId);
    if (!count || count === 0) break;
  }
}

export async function POST(req: Request) {
  try {
    const { schema_id } = await req.json();
    if (!schema_id) {
      return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });
    }

    const tables = [
      'graph_edges',
      'graph_nodes',
      'ci_traits',
      'ci_scores',
      'ci_outcomes',
      'ci_analyses',
      'ci_signals',
      'ci_experiments',
      'ci_sourcing_stats',
      'graph_index_jobs',
    ];

    const results: Record<string, string> = {};
    for (const table of tables) {
      try {
        await deleteAll(table, schema_id);
        results[table] = 'cleared';
      } catch (e: any) {
        results[table] = e.message || 'error';
      }
    }

    // Reset weights to defaults (delete non-default weights)
    try {
      await supabase.from('schema_weights').delete().eq('schema_id', schema_id).neq('role', '__default__');
      results['schema_weights'] = 'reset to defaults';
    } catch {}

    return NextResponse.json({ success: true, schema_id, results });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
