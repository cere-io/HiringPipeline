import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { source, result, originalText } = await req.json();

    const logDir = path.join(process.cwd(), 'logs');
    await fs.mkdir(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `extraction-${timestamp}.json`);

    const logData = {
      timestamp,
      source,
      result,
      originalText,
    };

    await fs.writeFile(logFile, JSON.stringify(logData, null, 2), 'utf-8');

    return new Response(JSON.stringify({ success: true, file: logFile }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
