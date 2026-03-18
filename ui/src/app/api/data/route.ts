import { NextResponse } from 'next/server';
import { mockCubbies } from '@/lib/runtime';

export async function GET() {
    const [traits, scores, outcomes, interviews, meta] = await Promise.all([
        mockCubbies['hiring-traits'].getAll(),
        mockCubbies['hiring-scores'].getAll(),
        mockCubbies['hiring-outcomes'].getAll(),
        mockCubbies['hiring-interviews'].getAll(),
        mockCubbies['hiring-meta'].getAll(),
    ]);

    return NextResponse.json({ traits, scores, outcomes, interviews, meta });
}
