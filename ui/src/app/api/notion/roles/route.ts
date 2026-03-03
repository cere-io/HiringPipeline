import { NextResponse } from 'next/server';

export async function GET() {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  // This is the database ID extracted from the URL: https://www.notion.so/cere/24cd800083d6804daaf7f5b100d71ea9?v=24cd800083d68012ad1b000c67053535
  const NOTION_DB_ID = process.env.NOTION_ROLES_DB_ID || '24cd800083d6804daaf7f5b100d71ea9'; 

  if (!NOTION_API_KEY) {
    // If no key is set, return some sensible defaults so the demo doesn't break
    return NextResponse.json({
      success: true,
      roles: ['Senior Backend Engineer', 'Frontend Developer', 'AI Engineer', 'Product Manager'],
      source: 'fallback'
    });
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Optionally add a filter here, e.g., to only get "Active" roles
        // "filter": { "property": "Status", "select": { "equals": "Active" } }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API Error:', errorData);
      throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Parse the properties based on typical Notion setup. 
    // Usually the "Title" property contains the role name.
    const roles = data.results.map((page: any) => {
      // Find the property that is of type "title"
      const titleProperty = Object.values(page.properties).find((prop: any) => prop.type === 'title') as any;
      if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
        return titleProperty.title[0].plain_text;
      }
      return 'Unknown Role';
    }).filter((role: string) => role !== 'Unknown Role');

    return NextResponse.json({ success: true, roles, source: 'notion' });

  } catch (error: any) {
    console.error('Failed to fetch roles from Notion:', error);
    // Fallback gracefully so UI doesn't crash during demo
    return NextResponse.json({
      success: false,
      roles: ['Senior Backend Engineer', 'Frontend Developer (Fallback)'],
      error: error.message
    });
  }
}
