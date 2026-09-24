// Демо-данные городских слоёв: объекты (реальные, из OpenStreetMap), дорожные камеры на реальной
// геометрии улиц, станции воздуха (SIMULATED), аварии водоснабжения и дорожные проблемы.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FacilityKind, Prisma, PrismaClient } from '@prisma/client';
import { PIPE_NETWORK } from '../src/lib/pipe-network';
import { distanceMeters } from '../src/lib/routing';
import { destination } from '../src/lib/city';
import { AIR_SENSOR_TYPE } from '../src/lib/air-monitor';

type FacilityRow = { kind: FacilityKind; name: string; address: string; lat: number; lng: number };

/** Точки для камер берутся с линий дорожно-трубной сети — она построена по дорогам OSM. */
function roadCameraPoints(count: number) {
  const core = PIPE_NETWORK.flatMap(p => p.coords).map(([lng, lat]) => ({ lat, lng }))
    .filter(p => p.lat > 43.635 && p.lat < 43.69 && p.lng > 51.14 && p.lng < 51.2);
  const picked = [core[Math.floor(core.length / 2)]];
  while (picked.length < count) {
    // Самая удалённая от уже выбранных точка — камеры равномерно покрывают город.
    let best = core[0], bestD = -1;
    for (const p of core) {
      const d = Math.min(...picked.map(q => distanceMeters(p, q)));
      if (d > bestD) { best = p; bestD = d; }
    }
    picked.push(best);
  }
  return picked;
}

// Демо-станции: показания смоделированы и помечены isDemo; ветер — ВЮВ, как типично для Актау.
const airStations = [
  { name: 'AQ-01 · 14 мкр.', lat: 43.6512, lng: 51.146, pm25: 6.5, pm10: 31, no2: 12 },
  { name: 'AQ-02 · Набережная', lat: 43.641, lng: 51.1546, pm25: 21, pm10: 64, no2: 18 },
  { name: 'AQ-03 · Промзона', lat: 43.67, lng: 51.205, pm25: 48, pm10: 182, no2: 41 },
];
const demoWind = { windDirDeg: 100, windSpeedMs: 4.5 };

export async function seedCity(db: PrismaClient, byEmail: Map<string, string>) {
  if ((await db.cityFacility.count()) === 0) {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), 'scripts', 'data', 'aktau-facilities.json'), 'utf8')) as { items: FacilityRow[] };
    await db.cityFacility.createMany({ data: file.items.map(f => ({ kind: f.kind, name: f.name, address: f.address, lat: f.lat, lng: f.lng, isDemo: false })) });
  }

  if ((await db.camera.count()) === 0) {
    const points = roadCameraPoints(8);
    for (const [i, p] of points.entries()) await db.camera.create({ data: { name: `AKT-0${11 + i}`, lat: p.lat, lng: p.lng, isDemo: true } });
  }

  if ((await db.sensor.count({ where: { type: AIR_SENSOR_TYPE } })) === 0) {
    for (const s of airStations) {
      await db.sensor.create({
        data: {
          name: s.name, type: AIR_SENSOR_TYPE, lat: s.lat, lng: s.lng,
          readings: { create: { isDemo: true, values: { pm25: s.pm25, pm10: s.pm10, no2: s.no2, ...demoWind, source: 'demo-simulation' } satisfies Prisma.InputJsonValue } },
        },
      });
    }
  }

  if ((await db.incident.count({ where: { type: { in: ['WATER_OUTAGE', 'POTHOLE'] } } })) > 0) return;
  const operatorId = byEmail.get('operator@demo.kz');
  const residentId = byEmail.get('resident@demo.kz');
  const cameras = await db.camera.findMany({ orderBy: { name: 'asc' } });

  const outages = [
    { title: 'Отключение холодной воды · 12 мкр.', district: '12 мкр.', lat: 43.66105, lng: 51.15033, radiusMeters: 450, status: 'CONFIRMED' as const, severity: 'HIGH' as const, cause: 'Порыв распределительного водовода Ø200 мм', restoreHours: 5 },
    { title: 'Падение давления воды · 4 мкр.', district: '4 мкр.', lat: 43.63432, lng: 51.16471, radiusMeters: 350, status: 'NEW' as const, severity: 'MEDIUM' as const, cause: 'Датчик W-016: давление 1,1 бар при норме 2,9 бар', restoreHours: undefined },
  ];
  for (const o of outages) {
    await db.incident.create({
      data: {
        title: o.title,
        description: `${o.cause}. Демонстрационная авария: зона воздействия задана радиусом ${o.radiusMeters} м от места порыва.`,
        type: 'WATER_OUTAGE', source: 'SENSOR', severity: o.severity, status: o.status, isDemo: true,
        lat: o.lat, lng: o.lng, address: `${o.district}, Актау`, district: o.district,
        metadata: { radiusMeters: o.radiusMeters, cause: o.cause, ...(o.restoreHours ? { expectedRestoreAt: new Date(Date.now() + o.restoreHours * 3600000).toISOString() } : {}) } satisfies Prisma.InputJsonValue,
        history: { create: [{ action: 'Авария зафиксирована датчиками давления', newStatus: 'NEW', actorId: operatorId }, ...(o.status === 'CONFIRMED' ? [{ action: 'Подтверждено оператором, жители в зоне уведомлены', previousStatus: 'NEW' as const, newStatus: 'CONFIRMED' as const, actorId: operatorId, isPublic: true }] : [])] },
      },
    });
  }

  // Жалоба на яму в 12 м от камеры AKT-014: разбор кадра с этой камеры покажет связывание.
  const linkCamera = cameras.find(c => c.name === 'AKT-014') ?? cameras[0];
  if (linkCamera && residentId) {
    const p = destination(linkCamera, 45, 12);
    await db.incident.create({
      data: {
        title: 'Глубокая яма на проезжей части', description: 'Яма примерно полметра, машины резко объезжают её по встречной.',
        type: 'POTHOLE', source: 'RESIDENT', severity: 'MEDIUM', status: 'NEW', isDemo: true,
        lat: p.lat, lng: p.lng, address: 'Проезжая часть, точка отмечена на карте', reporterId: residentId,
        citizenReport: { create: { userId: residentId } },
        history: { create: { action: 'Житель отправил обращение', newStatus: 'NEW', actorId: residentId, isPublic: true } },
      },
    });
  }

  // Ранее обнаруженная камерой и подтверждённая яма — в очереди ремонта.
  const repairCamera = cameras.find(c => c.name === 'AKT-012') ?? cameras[1];
  if (repairCamera) {
    await db.incident.create({
      data: {
        title: 'Яма на дороге', description: 'Обнаружено CV-детектором (эвристика) на кадре камеры и подтверждено оператором. Координаты — место установки камеры.',
        type: 'POTHOLE', source: 'CAMERA', severity: 'HIGH', status: 'CONFIRMED', isDemo: true, confidence: 84,
        lat: repairCamera.lat, lng: repairCamera.lng, address: `Рядом с камерой ${repairCamera.name}`, cameraId: repairCamera.id,
        metadata: { detector: 'road-damage-heuristic-v1', detectorKind: 'classical-cv-heuristic', detections: [], cameraName: repairCamera.name, locationPrecision: 'camera', cameraDetections: 2 } satisfies Prisma.InputJsonValue,
        history: { create: [{ action: 'Обнаружено камерой, ожидает проверки оператором', newStatus: 'NEW' }, { action: 'Подтверждено оператором', previousStatus: 'NEW', newStatus: 'CONFIRMED', actorId: operatorId }] },
      },
    });
  }
}
