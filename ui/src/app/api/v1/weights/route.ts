import { NextResponse } from 'next/server';
import { getCI } from '@/lib/compound-intelligence/runtime';

/**
 * GET /api/v1/weights?schema_id=X&role=Y
 * Returns current weights for a schema + role.
 * If role is omitted, returns all roles' weights.
 */
export async function GET(req: Request) {
  try {
    const ci = getCI();
    const url = new URL(req.url);
    const schemaId = url.searchParams.get('schema_id');
    const role = url.searchParams.get('role');

    if (!schemaId) {
      return NextResponse.json({ success: false, error: 'Missing schema_id query param' }, { status: 400 });
    }

    if (role) {
      const weights = await ci.getWeights(schemaId, role);
      return NextResponse.json({ success: true, schema_id: schemaId, role, weights });
    }

    const allWeights = await ci.getAllWeights(schemaId);
    return NextResponse.json({ success: true, schema_id: schemaId, weights: allWeights });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
