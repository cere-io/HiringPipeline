import { NextResponse } from 'next/server';
import { getCI, getStorage } from '@/lib/compound-intelligence/runtime';
import type { AdapterConnection } from '@/lib/compound-intelligence/types';

export async function POST(req: Request) {
  try {
    const ci = getCI();
    const storage = getStorage();
    const { adapter_type, schema_id, config } = await req.json();

    if (!adapter_type || !schema_id) {
      return NextResponse.json({ success: false, error: 'Missing adapter_type or schema_id' }, { status: 400 });
    }

    const schema = await ci.schemas.get(schema_id);
    if (!schema) {
      return NextResponse.json({ success: false, error: `Schema "${schema_id}" not found` }, { status: 404 });
    }

    const validTypes = ['join', 'notion', 'generic-webhook'];
    if (!validTypes.includes(adapter_type)) {
      return NextResponse.json({ success: false, error: `Invalid adapter_type. Valid: ${validTypes.join(', ')}` }, { status: 400 });
    }

    let testResult: { subjects?: number } = {};

    if (adapter_type === 'join') {
      const token = config?.token || process.env.JOIN_API_TOKEN;
      if (!token) {
        return NextResponse.json({ success: false, error: 'Join adapter requires a token (config.token or JOIN_API_TOKEN env)' }, { status: 400 });
      }
      try {
        const { JoinAdapter } = await import('@/lib/adapters/join/adapter');
        const adapter = new JoinAdapter(token);
        const subjects = await adapter.pollNewSubjects();
        testResult = { subjects: subjects.length };
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `Join connection test failed: ${e.message}` }, { status: 400 });
      }
    }

    if (adapter_type === 'notion') {
      const token = config?.token || process.env.NOTION_API_KEY;
      const databaseId = config?.database_id || process.env.NOTION_CANDIDATES_DB_ID;
      if (!token) {
        return NextResponse.json({ success: false, error: 'Notion adapter requires a token (config.token or NOTION_API_KEY env)' }, { status: 400 });
      }
      if (!databaseId) {
        return NextResponse.json({ success: false, error: 'Notion adapter requires database_id in config' }, { status: 400 });
      }
      try {
        const { NotionClient } = await import('@/lib/adapters/notion/client');
        const client = new NotionClient(token);
        const result = await client.queryDatabase(databaseId);
        testResult = { subjects: result.results?.length ?? 0 };
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `Notion connection test failed: ${e.message}` }, { status: 400 });
      }
    }

    const conn: AdapterConnection = {
      id: `adapter-${adapter_type}-${Date.now()}`,
      adapter_type,
      schema_id,
      config: config || {},
      is_active: true,
      last_poll_at: null,
      subjects_processed: 0,
      created_at: new Date().toISOString(),
    };

    await storage.saveAdapterConnection(conn);
    return NextResponse.json({ success: true, connection: conn, test: testResult });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const storage = getStorage();
    const connections = await storage.listAdapterConnections();
    return NextResponse.json({ success: true, connections });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
