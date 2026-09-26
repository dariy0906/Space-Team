// Конвейер дорожной CV-детекции: кадр камеры -> CV-сервис -> событие POTHOLE -> проверка оператором.
// Детектор — классическая эвристика (services/cv/detectors.py: RoadDamageDetector), не нейросеть.
// Координаты события — место установки камеры: по одному кадру точную позицию ямы не вычислить.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Camera, Incident, Prisma, Severity } from '@prisma/client';
import { db } from './db';
import { publishIncident } from './events';
import { distanceMeters } from './routing';

export const ROAD_DETECTOR_LABEL = 'CV-детектор (эвристика)';
/** Обнаружения и обращения ближе этого расстояния считаются одной и той же проблемой. */
export const LINK_RADIUS_METERS = 30;
// Кадр городской камеры может содержать прохожих и номера машин: он виден только сотрудникам,
// даже если прикреплён к обращению жителя.
export const CAMERA_FRAME_STAGE = 'CAMERA';
const MAX_FRAME_BYTES = 3_000_000;
const OPEN = { notIn: ['RESOLVED', 'REJECTED'] as ('RESOLVED' | 'REJECTED')[] };

const detectionSchema = z.object({
  type: z.literal('ROAD_DAMAGE'),
  score: z.number().min(0).max(100),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  areaRatio: z.number(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  method: z.string(),
  experimental: z.boolean(),
});
const analysisSchema = z.object({
  detections: z.array(detectionSchema),
  detector: z.string(),
  kind: z.string(),
  width: z.number(),
  height: z.number(),
});
export type RoadDetection = z.infer<typeof detectionSchema>;
export type RoadAnalysis = z.infer<typeof analysisSchema>;

export type RoadMetadata = {
  detector: string;
  detectorKind: string;
  detections: RoadDetection[];
  cameraName: string;
  locationPrecision: 'camera';
  cameraDetections: number;
  linkedIncidentIds?: string[];
};

// Ответ POST /api/road/analyze.
export type RoadAnalyzeResult = {
  error?: string;
  analyzed?: boolean;
  detections?: RoadDetection[];
  detector?: string;
  cameraName?: string;
  incidentId?: string;
  linked?: boolean;
};

const severityOrder: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function frameKind(type: string): 'jpg' | 'png' | 'webp' | null {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : null;
}

export async function analyzeRoadFrame(bytes: Buffer, contentType: string): Promise<RoadAnalysis> {
  const base = process.env.CV_SERVICE_URL;
  if (!base) throw new Error('CV-сервис не подключён: задайте CV_SERVICE_URL');
  if (bytes.length > MAX_FRAME_BYTES) throw new Error('Кадр больше 3 МБ');
  const res = await fetch(`${base}/detect-road`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, Authorization: `Bearer ${process.env.CV_SERVICE_KEY || ''}` },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  }).catch((e: unknown) => {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    throw new Error(timeout ? 'CV-сервис не ответил за 20 секунд' : `CV-сервис недоступен (${base})`);
  });
  if (res.status === 401) throw new Error('CV-сервис отклонил ключ доступа (CV_SERVICE_KEY)');
  if (!res.ok) throw new Error('CV-сервис не смог обработать кадр');
  return analysisSchema.parse(await res.json());
}

/** Кадр сохраняется рядом с остальными фото и отдаётся через /api/media с проверкой прав. */
export async function saveFrame(bytes: Buffer, ext: 'jpg' | 'png' | 'webp'): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'uploads');
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), bytes);
  return `/api/media/${name}`;
}

async function findOpenRoadIssue(tx: Prisma.TransactionClient, at: { lat: number; lng: number }, excludeId?: string) {
  const candidates = await tx.incident.findMany({
    where: { type: { in: ['POTHOLE', 'ROAD'] }, status: OPEN, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  return candidates.find(i => distanceMeters(i, at) <= LINK_RADIUS_METERS) ?? null;
}

/**
 * Записывает результат анализа кадра. Если рядом уже есть открытая дорожная проблема
 * (из прошлой детекции или от жителя), кадр добавляется к ней, а не порождает дубль.
 */
export async function recordRoadDetections(input: { camera: Camera; frameUrl: string; analysis: RoadAnalysis; actorId: string }) {
  const { camera, frameUrl, analysis, actorId } = input;
  const best = analysis.detections[0];
  if (!best) return null;
  const severity = analysis.detections.reduce<Severity>((max, d) => severityOrder.indexOf(d.severity) > severityOrder.indexOf(max) ? d.severity : max, 'LOW');
  const scoreText = `${ROAD_DETECTOR_LABEL}: оценка ${Math.round(best.score)}%`;

  return db.$transaction(async tx => {
    const existing = await findOpenRoadIssue(tx, camera);
    if (existing) {
      const meta = (existing.metadata ?? {}) as Partial<RoadMetadata>;
      const updated = await tx.incident.update({
        where: { id: existing.id },
        data: {
          cameraId: existing.cameraId ?? camera.id,
          confidence: Math.max(existing.confidence ?? 0, best.score),
          severity: severityOrder.indexOf(severity) > severityOrder.indexOf(existing.severity) ? severity : existing.severity,
          metadata: { ...meta, cameraName: meta.cameraName ?? camera.name, detections: analysis.detections, cameraDetections: (meta.cameraDetections ?? 0) + 1, detector: analysis.detector, detectorKind: analysis.kind, locationPrecision: 'camera' } satisfies Prisma.InputJsonValue,
          media: { create: { type: 'IMAGE', stage: CAMERA_FRAME_STAGE, url: frameUrl } },
          history: { create: { action: `Повторное обнаружение камерой ${camera.name}`, comment: scoreText, actorId } },
        },
      });
      await publishIncident(tx, updated, `Камера ${camera.name} снова видит повреждение дороги`);
      return { incident: updated, linked: true };
    }

    const metadata: RoadMetadata = {
      detector: analysis.detector,
      detectorKind: analysis.kind,
      detections: analysis.detections,
      cameraName: camera.name,
      locationPrecision: 'camera',
      cameraDetections: 1,
    };
    const incident = await tx.incident.create({
      data: {
        title: 'Возможная яма на дороге',
        description: `${ROAD_DETECTOR_LABEL} нашёл на кадре камеры ${camera.name} тёмную область с резкой границей — признак ямы или выбоины. Это кандидат, а не подтверждённый факт: нужна проверка оператором. Координаты — место установки камеры, точную позицию ямы по одному кадру определить нельзя.`,
        type: 'POTHOLE',
        source: 'CAMERA',
        severity,
        confidence: best.score,
        lat: camera.lat,
        lng: camera.lng,
        address: `Рядом с камерой ${camera.name}`,
        cameraId: camera.id,
        isDemo: camera.isDemo,
        metadata: metadata satisfies Prisma.InputJsonValue,
        media: { create: { type: 'IMAGE', stage: CAMERA_FRAME_STAGE, url: frameUrl } },
        history: { create: { action: 'Обнаружено камерой, ожидает проверки оператором', comment: scoreText, actorId, newStatus: 'NEW' } },
      },
    });
    await publishIncident(tx, incident, `Камера ${camera.name}: возможная яма на дороге`);
    return { incident, linked: false };
  });
}

/**
 * Связывает новое обращение жителя с уже открытой дорожной проблемой рядом. Обращение остаётся
 * отдельным (житель следит за своим статусом), но обе карточки указывают друг на друга.
 */
export async function linkNearbyRoadIssue(tx: Prisma.TransactionClient, report: Pick<Incident, 'id' | 'type' | 'lat' | 'lng' | 'metadata'>) {
  if (report.type !== 'POTHOLE' && report.type !== 'ROAD') return null;
  const existing = await findOpenRoadIssue(tx, report, report.id);
  if (!existing) return null;
  const parentMeta = (existing.metadata ?? {}) as Partial<RoadMetadata>;
  await tx.incident.update({
    where: { id: existing.id },
    data: {
      metadata: { ...parentMeta, linkedIncidentIds: [...new Set([...(parentMeta.linkedIncidentIds ?? []), report.id])] } satisfies Prisma.InputJsonValue,
      history: { create: { action: `Житель сообщил о той же проблеме (обращение № ${report.id.slice(0, 8).toUpperCase()})` } },
    },
  });
  await tx.incident.update({
    where: { id: report.id },
    data: {
      metadata: { ...((report.metadata ?? {}) as Record<string, unknown>), linkedIncidentIds: [existing.id] } satisfies Prisma.InputJsonValue,
      history: { create: { action: `Проблема уже зарегистрирована: № ${existing.id.slice(0, 8).toUpperCase()}`, isPublic: true } },
    },
  });
  return existing;
}
