import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    const checks: Record<string, boolean> = {};

    // Check Supabase connection
    try {
        const { data, error } = await supabase.from('role_weights').select('role').limit(1);
        checks.supabase = !error && (data?.length ?? 0) > 0;
    } catch {
        checks.supabase = false;
    }

    // Check env vars
    checks.gemini = !!process.env.GEMINI_API_KEY;
    checks.supabase_key = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    checks.storage_mode = !!process.env.STORAGE_MODE;

    const allGreen = Object.values(checks).every(v => v);

    return NextResponse.json({
        status: allGreen ? 'healthy' : 'degraded',
        checks,
        storage_mode: process.env.STORAGE_MODE || 'mock',
        timestamp: new Date().toISOString(),
    }, { status: allGreen ? 200 : 503 });
}
