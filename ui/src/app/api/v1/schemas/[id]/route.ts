import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ci = getCI();
    const schema = await ci.schemas.get(id);
    if (!schema) return NextResponse.json({ success: false, error: 'Schema not found' }, { status: 404 });
    return NextResponse.json({ success: true, schema });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ci = getCI();
    const body = await req.json();
    const schema = await ci.schemas.update(id, body);
    return NextResponse.json({ success: true, schema });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ci = getCI();
    await ci.schemas.delete(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
