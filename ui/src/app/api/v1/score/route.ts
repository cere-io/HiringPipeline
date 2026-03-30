import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';
import { getStorage } from '@/lib/compound-intelligence/runtime';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const { schema_id, subject_id, role } = await req.json();

    if (!schema_id || !subject_id || !role) {
      return NextResponse.json({ success: false, error: 'Missing schema_id, subject_id, or role' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schema_id}" not found` }, { status: 404 });
    }

    const score = await ci.score({ schema, subjectId: subject_id, role });

    // Dual-write: update graph node with score
    const storage = getStorage();
    const traits = await storage.getTraits(schema_id, subject_id);
    if (traits) {
      ci.graphIndexer.indexSubject({
        schema,
        subjectId: subject_id,
        traits,
        score,
        subjectName: traits.subject_name,
      }).catch(err => console.error('[GraphIndexer] score dual-write failed:', err));
    }

    return NextResponse.json({ success: true, score });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
