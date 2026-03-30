import { NextResponse } from 'next/server';
import { getExperimentTracker } from '@/lib/compound-intelligence/runtime';

/**
 * POST /api/v1/experiments — Record a control experiment run
 * GET  /api/v1/experiments?schema_id=X — Get correlation stats
 */
export async function POST(req: Request) {
  try {
    const tracker = getExperimentTracker();
    const { schema_id, subject_id, adapter_source, ai_score, external_score, human_decision } = await req.json();

    if (!schema_id || !subject_id || ai_score === undefined) {
      return NextResponse.json({ success: false, error: 'Missing schema_id, subject_id, or ai_score' }, { status: 400 });
    }

    const run = await tracker.recordRun({
      schemaId: schema_id,
      subjectId: subject_id,
      adapterSource: adapter_source || 'unknown',
      aiScore: ai_score,
      externalScore: external_score,
      humanDecision: human_decision,
    });

    return NextResponse.json({ success: true, experiment: run });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const tracker = getExperimentTracker();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');

    if (!schemaId) {
      return NextResponse.json({ success: false, error: 'Missing schema_id query param' }, { status: 400 });
    }

    const stats = await tracker.getCorrelationStats(schemaId);
    return NextResponse.json({ success: true, schema_id: schemaId, stats });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
