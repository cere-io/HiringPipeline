import { NextResponse } from 'next/server';
import { getCI, getStorage } from '@/lib/compound-intelligence/runtime';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const body = await req.json();
    const { schema_id } = body;

    if (!schema_id) {
      return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schema_id}" not found` }, { status: 404 });
    }

    const job = await ci.indexSchema(schema);

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const ci = getCI();
    const storage = getStorage();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id') || undefined;

    const [jobs, stats, adapters] = await Promise.all([
      ci.getIndexJobs(schemaId),
      ci.getGraphStats(schemaId),
      storage.listAdapterConnections(),
    ]);

    return NextResponse.json({
      success: true,
      jobs,
      stats,
      adapters,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
