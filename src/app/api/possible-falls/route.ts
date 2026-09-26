import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { dispatchCritical } from '@/lib/dispatch';
import { publishIncident } from '@/lib/events';

export const runtime = 'nodejs';
const maxBodyBytes = 5_500_000;
const maxImageBytes = 5_000_000;
const eventSchema = z.object({
  event_type: z.string(), incident_key: z.string().trim().min(1).max(300), camera_id: z.string().trim().min(1).max(200),
  tracked_person_id: z.union([z.string(), z.number().int()]).optional(), timestamp: z.number().finite().optional(),
  timestamp_basis: z.enum(['video_relative_seconds', 'utc_capture_time']).optional(), source_time_seconds: z.number().finite().nonnegative().optional(),
  frame_number: z.number().int().nonnegative().optional(), bounding_box_xyxy: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  time_on_ground_seconds: z.number().finite().nonnegative().optional(), ground_arrival_seconds: z.number().finite().nonnegative().optional(),
  detection_score: z.number().finite().min(0).max(1).optional(), detection_confidence: z.number().finite().min(0).max(1).optional(),
  pose_confidence: z.number().finite().min(0).max(1).nullable().optional(), candidate_score: z.number().finite().min(0).max(1).nullable().optional(), score_meaning: z.string().max(1000).optional(),
});
type FallEvent = z.infer<typeof eventSchema>;
function authorized(request: Request): boolean {
  const secret = process.env.ROBOFLOW_WEBHOOK_SECRET, header = request.headers.get('authorization');
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7)), expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function isJpeg(bytes: Buffer) { return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
function captureTime(event: FallEvent) {
  if (event.timestamp_basis !== 'utc_capture_time' || event.timestamp == null) return null;
  const time = new Date(event.timestamp > 1_000_000_000_000 ? event.timestamp : event.timestamp * 1000);
  return Number.isNaN(time.valueOf()) ? null : time.toISOString();
}
function eventMetadata(event: FallEvent) { return {
  provider: 'roboflow', incidentKey: event.incident_key, roboflowCameraId: event.camera_id, trackedPersonId: event.tracked_person_id ?? null,
  timestamp: event.timestamp ?? null, timestampBasis: event.timestamp_basis ?? null, sourceTimeSeconds: event.source_time_seconds ?? null, captureTimeUtc: captureTime(event),
  frameNumber: event.frame_number ?? null, boundingBoxXyxy: event.bounding_box_xyxy ?? null, timeOnGroundSeconds: event.time_on_ground_seconds ?? null,
  groundArrivalSeconds: event.ground_arrival_seconds ?? null, detectionConfidence: event.detection_confidence ?? event.detection_score ?? null,
  scoreMeaning: event.score_meaning ?? 'Person detector confidence; not a calibrated fall probability.', poseConfidence: event.pose_confidence ?? null, candidateScore: event.candidate_score ?? null,
}; }
export async function POST(request: Request) {
  if (!process.env.ROBOFLOW_WEBHOOK_SECRET) return Response.json({ message: 'Webhook is not configured' }, { status: 503 });
  if (!authorized(request)) return Response.json({ message: 'Unauthorized' }, { status: 401 });
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) return Response.json({ message: 'Expected multipart/form-data' }, { status: 415 });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(contentLength) || contentLength > maxBodyBytes) return Response.json({ message: 'Payload too large' }, { status: 413 });
  let form: FormData; try { form = await request.formData(); } catch { return Response.json({ message: 'Invalid multipart payload' }, { status: 400 }); }
  const rawEvents = form.get('events'); if (typeof rawEvents !== 'string') return Response.json({ message: 'events must be a JSON array' }, { status: 400 });
  let payload: unknown; try { payload = JSON.parse(rawEvents); } catch { return Response.json({ message: 'events contains invalid JSON' }, { status: 400 }); }
  const result = z.array(eventSchema).safeParse(payload); if (!result.success) return Response.json({ message: 'events payload is invalid' }, { status: 400 });
  const events = result.data.filter(event => event.event_type === 'PERSON_FALL'); if (!events.length) return Response.json({ message: 'No supported PERSON_FALL events' }, { status: 422 });
  const uploaded = form.get('annotated_frame');
  if (!(uploaded instanceof File) || uploaded.size === 0 || uploaded.size > maxImageBytes) return Response.json({ message: 'annotated_frame must be a JPEG up to 5 MB' }, { status: 400 });
  const frame = Buffer.from(await uploaded.arrayBuffer()); if (uploaded.type !== 'image/jpeg' || !isJpeg(frame)) return Response.json({ message: 'annotated_frame must be a JPEG' }, { status: 400 });
  const cameras = await db.camera.findMany({ where: { roboflowCameraId: { in: [...new Set(events.map(event => event.camera_id))] }, status: { not: 'DISABLED' } } });
  const bySource = new Map(cameras.map(camera => [camera.roboflowCameraId, camera])); let created = 0, duplicates = 0; const unmapped: string[] = [];
  for (const event of events) {
    const camera = bySource.get(event.camera_id); if (!camera) { unmapped.push(event.camera_id); continue; }
    const filename = `${randomUUID()}.jpg`, dir = path.join(process.cwd(), 'data', 'uploads');
    try {
      await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, filename), frame, { flag: 'wx' });
      await db.$transaction(async tx => {
        const incident = await tx.incident.create({ data: {
          title: 'Возможное падение человека', description: 'Roboflow Cloud зафиксировал человека, остающегося на земле. Требуется проверка оператором.',
          type: 'PERSON_FALL', source: 'CAMERA', severity: 'CRITICAL', isDemo: false, lat: camera.lat, lng: camera.lng, address: camera.name, cameraId: camera.id,
          externalEventKey: event.incident_key, metadata: eventMetadata(event), media: { create: { type: 'IMAGE', stage: 'BEFORE', url: `/api/media/${filename}` } },
          history: { create: { action: 'Roboflow Cloud: возможное падение человека', newStatus: 'NEW' } },
        }}); await publishIncident(tx, incident, 'Критическое событие: возможное падение человека');
      }); created++;
    } catch (error) {
      await unlink(path.join(dir, filename)).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { duplicates++; continue; }
      throw error;
    }
  }
  if (created) await dispatchCritical();
  if (!created && !duplicates) return Response.json({ message: 'No active camera mapping found', unmapped: [...new Set(unmapped)] }, { status: 422 });
  return Response.json({ ok: true, created, duplicates, unmapped: [...new Set(unmapped)] });
}
