import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.GEMINI_API_KEY || '';
  const masked = key.slice(0, 8) + '...' + key.slice(-4);
  
  // Test the key directly
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Say OK' }], temperature: 0 }),
    });
    const data = await res.json();
    return NextResponse.json({
      key_masked: masked,
      key_length: key.length,
      test_status: res.status,
      test_ok: res.ok,
      test_response: res.ok ? data.choices?.[0]?.message?.content : data,
    });
  } catch (e: any) {
    return NextResponse.json({ key_masked: masked, key_length: key.length, error: e.message });
  }
}
