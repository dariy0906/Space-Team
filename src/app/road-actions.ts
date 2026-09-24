'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { analyzeRoadFrame, frameKind, recordRoadDetections, saveFrame, type RoadDetection } from '@/lib/road';

export type RoadActionState = {
  error?: string;
  analyzed?: boolean;
  detections?: RoadDetection[];
  detector?: string;
  cameraName?: string;
  incidentId?: string;
  linked?: boolean;
};

// Результат возвращается через useActionState, без redirect: разработчик №2 зафиксировал,
// что redirect из server action в этом окружении иногда не применяется.
export async function analyzeRoadFrameAction(_prev: RoadActionState, data: FormData): Promise<RoadActionState> {
  const user = await requireUser('OPERATOR');
  const cameraId = z.string().uuid().safeParse(String(data.get('cameraId') ?? ''));
  if (!cameraId.success) return { error: 'Выберите камеру' };
  const file = data.get('frame');
  if (!(file instanceof File) || file.size === 0) return { error: 'Добавьте кадр с камеры' };
  const ext = frameKind(file.type);
  if (!ext) return { error: 'Нужен кадр JPG, PNG или WebP' };
  if (file.size > 3_000_000) return { error: 'Кадр больше 3 МБ' };
  const camera = await db.camera.findUnique({ where: { id: cameraId.data } });
  if (!camera) return { error: 'Камера не найдена' };

  const bytes = Buffer.from(await file.arrayBuffer());
  let analysis;
  try {
    analysis = await analyzeRoadFrame(bytes, file.type);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'CV-сервис недоступен', cameraName: camera.name };
  }
  if (!analysis.detections.length) return { analyzed: true, detections: [], detector: analysis.detector, cameraName: camera.name };

  const frameUrl = await saveFrame(bytes, ext);
  const recorded = await recordRoadDetections({ camera, frameUrl, analysis, actorId: user.id });
  revalidatePath('/operator');
  revalidatePath('/operator/road');
  return {
    analyzed: true,
    detections: analysis.detections,
    detector: analysis.detector,
    cameraName: camera.name,
    incidentId: recorded?.incident.id,
    linked: recorded?.linked,
  };
}
