import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';
import { PRESET_SCHEMAS } from '@/lib/compound-intelligence/schema/registry';

export async function GET(req: Request) {
  try {
    const ci = getCI();
    const url = new URL(req.url);
    const domain = url.searchParams.get('domain') || undefined;
    const schemas = await ci.schemas.list(domain);
    return NextResponse.json({ success: true, schemas, presets: Object.keys(PRESET_SCHEMAS) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const body = await req.json();

    if (body.preset) {
      const schema = await ci.schemas.createFromPreset(body.preset);
      return NextResponse.json({ success: true, schema });
    }

    if (!body.name || !body.domain || !body.fields) {
      return NextResponse.json({ success: false, error: 'Missing name, domain, or fields' }, { status: 400 });
    }

    const schema = await ci.schemas.create(body);
    return NextResponse.json({ success: true, schema });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
