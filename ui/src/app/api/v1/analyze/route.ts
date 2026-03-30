import { NextResponse } from 'next/server';
import { getCI, getStorage } from '@/lib/compound-intelligence/runtime';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const { schema_id, subject_id, text, role } = await req.json();

    if (!schema_id || !subject_id || !text || !role) {
      return NextResponse.json({ success: false, error: 'Missing schema_id, subject_id, text, or role' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schema_id}" not found` }, { status: 404 });
    }

    const analysis = await ci.analyze({ schema, subjectId: subject_id, text, role });

    // Dual-write: index interview/analysis into knowledge graph
    const storage = getStorage();
    const [traits, score] = await Promise.all([
      storage.getTraits(schema_id, subject_id),
      storage.getScore(schema_id, subject_id),
    ]);
    if (traits) {
      ci.graphIndexer.indexSubject({
        schema,
        subjectId: subject_id,
        traits,
        score,
        analysis,
        subjectName: traits.subject_name,
      }).catch(err => console.error('[GraphIndexer] analyze dual-write failed:', err));
    }

    return NextResponse.json({ success: true, analysis });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
