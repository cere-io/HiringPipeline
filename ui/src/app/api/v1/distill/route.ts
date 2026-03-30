import { NextResponse } from 'next/server';
import { getCI, getStorage } from '@/lib/compound-intelligence/runtime';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const { schema_id, subject_id, role, outcome, feedback, reasons, source, is_performance_review } = await req.json();

    if (!schema_id || !subject_id || !role || outcome === undefined) {
      return NextResponse.json({ success: false, error: 'Missing schema_id, subject_id, role, or outcome' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schema_id}" not found` }, { status: 404 });
    }

    const result = await ci.distill({
      schema,
      subjectId: subject_id,
      role,
      outcome,
      feedback,
      reasons,
      source,
      isPerformanceReview: is_performance_review,
    });

    // Dual-write: re-index subject with outcome into knowledge graph
    const storage = getStorage();
    const [traits, score, analysis] = await Promise.all([
      storage.getTraits(schema_id, subject_id),
      storage.getScore(schema_id, subject_id),
      storage.getAnalysis(schema_id, subject_id),
    ]);
    if (traits) {
      ci.graphIndexer.indexSubject({
        schema,
        subjectId: subject_id,
        traits,
        score,
        analysis,
        outcome: { outcome, feedback, role },
        subjectName: traits.subject_name,
      }).catch(err => console.error('[GraphIndexer] distill dual-write failed:', err));
    }

    return NextResponse.json({ success: true, result });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
