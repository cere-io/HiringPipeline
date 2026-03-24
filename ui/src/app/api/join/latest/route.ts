import { NextResponse } from 'next/server';
import { getJoinClient } from '@/lib/join-client';

export async function GET() {
    try {
        const client = getJoinClient();
        const apps = await client.getRecentApplications(1);
        if (!apps || apps.length === 0) {
            return NextResponse.json({ success: true, latest: null });
        }
        const app = apps[0];
        return NextResponse.json({
            success: true,
            latest: {
                name: `${app.candidate.firstName} ${app.candidate.lastName}`,
                role: app.job.title,
                time: app.createdAt,
                joinId: app.id,
            },
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
