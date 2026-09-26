// Разбор кадра дорожной камеры: кадр -> CV-сервис -> событие POTHOLE «ожидает проверки».
// JSON-маршрут, а не server action: результат показывается прямо из ответа и не зависит от
// перерисовки всей страницы после действия, которая в этом окружении иногда не завершалась.
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { sameOrigin } from '@/lib/http';
import { db } from '@/lib/db';
import { analyzeRoadFrame, frameKind, recordRoadDetections, saveFrame, type RoadAnalyzeResult } from '@/lib/road';

const MAX_FRAME_BYTES = 3_000_000;
const reply = (body: RoadAnalyzeResult, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: 'Запрос отклонён: другой источник' }, 403);
  const user = await currentUser();
  if (!user || user.role !== 'OPERATOR') return reply({ error: 'Нужен вход оператора' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_FRAME_BYTES + 100_000) return reply({ error: 'Кадр больше 3 МБ' }, 413);

  const data = await request.formData().catch(() => null);
  if (!data) return reply({ error: 'Не удалось прочитать форму' }, 400);
  const cameraId = z.string().uuid().safeParse(String(data.get('cameraId') ?? ''));
  if (!cameraId.success) return reply({ error: 'Выберите камеру' }, 400);
  const file = data.get('frame');
  if (!(file instanceof File) || file.size === 0) return reply({ error: 'Добавьте кадр с камеры' }, 400);
  const ext = frameKind(file.type);
  if (!ext) return reply({ error: 'Нужен кадр JPG, PNG или WebP' }, 400);
  if (file.size > MAX_FRAME_BYTES) return reply({ error: 'Кадр больше 3 МБ' }, 413);
  const camera = await db.camera.findUnique({ where: { id: cameraId.data } });
  if (!camera) return reply({ error: 'Камера не найдена' }, 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  let analysis;
  try {
    analysis = await analyzeRoadFrame(bytes, file.type);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'CV-сервис недоступен', cameraName: camera.name }, 502);
  }
  if (!analysis.detections.length) return reply({ analyzed: true, detections: [], detector: analysis.detector, cameraName: camera.name });

  const frameUrl = await saveFrame(bytes, ext);
  const recorded = await recordRoadDetections({ camera, frameUrl, analysis, actorId: user.id });
  return reply({
    analyzed: true,
    detections: analysis.detections,
    detector: analysis.detector,
    cameraName: camera.name,
    incidentId: recorded?.incident.id,
    linked: recorded?.linked,
  });
}
