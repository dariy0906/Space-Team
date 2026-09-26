import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { CAMERA_FRAME_STAGE } from '@/lib/road';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { name } = await params;
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return new NextResponse('Not found', { status: 404 });
  const media = await db.incidentMedia.findFirst({
    where: { url: `/api/media/${name}` },
    include: { incident: true },
  });
  if (!media) return new NextResponse('Not found', { status: 404 });
  const incident = media.incident;
  if (user.role === 'WORKER' && incident.assignedWorkerId !== user.id)
    return new NextResponse('Forbidden', { status: 403 });
  if (user.role === 'RESIDENT' && (incident.reporterId !== user.id || media.stage === CAMERA_FRAME_STAGE))
    return new NextResponse('Forbidden', { status: 403 });
  try {
    const bytes = await readFile(path.join(process.cwd(), 'data', 'uploads', name));
    const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
