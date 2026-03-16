import { NextResponse } from 'next/server';
import { mockCubbies } from '@/lib/runtime';

export async function GET() {
    const [traits, scores, outcomes, meta] = await Promise.all([
        mockCubbies['hiring-traits'].getAll(),
        mockCubbies['hiring-scores'].getAll(),
        mockCubbies['hiring-outcomes'].getAll(),
        mockCubbies['hiring-meta'].getAll(),
    ]);

    return NextResponse.json({ traits, scores, outcomes, meta });
}
