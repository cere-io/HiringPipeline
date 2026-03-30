import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';

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

    const traits = await ci.extract({ schema, subjectId: subject_id, text, role });

    // Dual-write: index into knowledge graph
    ci.graphIndexer.indexSubject({
      schema,
      subjectId: subject_id,
      traits,
      subjectName: traits.subject_name,
    }).catch(err => console.error('[GraphIndexer] extract dual-write failed:', err));

    return NextResponse.json({ success: true, traits });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
