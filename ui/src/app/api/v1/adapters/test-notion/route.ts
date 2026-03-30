import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/compound-intelligence/runtime';
import { NotionClient, extractTitle, extractRichText, extractSelect, extractEmail, extractUrl, blocksToText } from '@/lib/adapters/notion/client';

export async function GET(req: Request) {
  try {
    const storage = getStorage();
    const connections = await storage.listAdapterConnections();
    const notionConn = connections.find(c => c.adapter_type === 'notion');

    if (!notionConn) {
      return NextResponse.json({ success: false, error: 'No Notion adapter connected' }, { status: 404 });
    }

    const token = notionConn.config?.token || process.env.NOTION_API_KEY;
    const dbId = notionConn.config?.database_id;

    if (!token || !dbId) {
      return NextResponse.json({ success: false, error: 'Missing token or database_id' }, { status: 400 });
    }

    const client = new NotionClient(token);

    const result = await client.queryDatabase(dbId);
    const lastPage = result.results?.[0];

    if (!lastPage) {
      return NextResponse.json({ success: false, error: 'No pages found in database' }, { status: 404 });
    }

    const propSummary: Record<string, { type: string; value: string }> = {};
    for (const [key, val] of Object.entries(lastPage.properties) as [string, any][]) {
      let extracted = '';
      if (val.type === 'title') extracted = extractTitle(val);
      else if (val.type === 'rich_text') extracted = extractRichText(val);
      else if (val.type === 'select') extracted = extractSelect(val);
      else if (val.type === 'email') extracted = extractEmail(val);
      else if (val.type === 'url') extracted = extractUrl(val);
      else if (val.type === 'number') extracted = String(val.number ?? '');
      else if (val.type === 'multi_select') extracted = (val.multi_select || []).map((s: any) => s.name).join(', ');
      else if (val.type === 'status') extracted = val.status?.name || '';
      else if (val.type === 'relation') extracted = `[${(val.relation || []).length} relations]`;
      else if (val.type === 'files') extracted = `[${(val.files || []).length} files]`;
      else extracted = `[${val.type}]`;

      propSummary[key] = { type: val.type, value: extracted };
    }

    let pageBody = '';
    try {
      const blocks = await client.getPageBlocks(lastPage.id);
      pageBody = blocksToText(blocks);
    } catch (e: any) {
      pageBody = `(failed to fetch: ${e.message})`;
    }

    return NextResponse.json({
      success: true,
      page_id: lastPage.id,
      created: lastPage.created_time,
      properties: propSummary,
      page_body_length: pageBody.length,
      page_body_preview: pageBody.slice(0, 500),
      column_names: Object.keys(lastPage.properties),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
