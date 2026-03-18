import { NextResponse } from 'next/server';
import { extractText } from 'unpdf';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return NextResponse.json({ success: false, error: 'Only PDF files are supported' }, { status: 400 });
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        const { text, totalPages } = await extractText(buffer);
        const fullText = Array.isArray(text) ? text.join('\n\n') : text;

        return NextResponse.json({ success: true, text: fullText, pages: totalPages });
    } catch (e: any) {
        console.error('[PDF Upload Error]', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
