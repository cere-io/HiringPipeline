import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const { schema_id } = await req.json();
    if (!schema_id) return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });

    const schema = await ci.schemas.get(schema_id);
    if (!schema) return NextResponse.json({ success: false, error: 'Schema not found' }, { status: 404 });

    const patterns = await ci.discoverPatterns(schema);
    return NextResponse.json({ success: true, count: patterns.length, patterns });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const ci = getCI();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');
    if (!schemaId) return NextResponse.json({ success: false, error: 'Missing schema_id' }, { status: 400 });
    const patterns = await ci.getPatterns(schemaId);
    return NextResponse.json({ success: true, count: patterns.length, patterns });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
