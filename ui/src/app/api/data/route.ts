import { NextResponse } from 'next/server';
import { mockCubbies } from '@/lib/runtime';

export async function GET() {
    const data = {
        traits: mockCubbies['hiring-traits'].getAll(),
        scores: mockCubbies['hiring-scores'].getAll(),
        outcomes: mockCubbies['hiring-outcomes'].getAll(),
        meta: mockCubbies['hiring-meta'].getAll(),
    };
    
    return NextResponse.json(data);
}
