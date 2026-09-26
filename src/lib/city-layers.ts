// Сборка слоёв городской карты: события, объекты, камеры, станции воздуха, зоны воздействия.
// Один источник для панели оператора и для жителя — жителю отдаётся только публичная часть.
import type { Incident, IncidentMedia } from '@prisma/client';
import { db } from './db';
import { airSnapshot } from './air-monitor';
import { circlePolygon, facilitiesWithin, facilityLabel, waterStage, windFromLabel, type WaterOutageMeta } from './city';
import { publicIncidentTypes, severityLabel, sourceLabel, statusLabel, typeLabel } from './labels';
import type { MapPoint, MapZone } from './map-kinds';
import type { RoadMetadata } from './road';

export type LayerKey = 'critical' | 'road' | 'reports' | 'water' | 'air' | 'schools' | 'cameras' | 'workers' | 'other';
export type Tone = 'danger' | 'warn' | 'safe' | 'info' | 'muted';

export type DetailCard = {
  title: string;
  subtitle?: string;
  badges: { label: string; tone: Tone }[];
  facts: { label: string; value: string }[];
  text?: string;
  image?: string;
  list?: { title: string; items: string[] };
  note?: string;
  href?: string;
  hrefLabel?: string;
};

export type LayerPoint = MapPoint & { layer: LayerKey };
export type LayerZone = MapZone & { layer: LayerKey };
export type CityLayers = {
  points: LayerPoint[];
  overlays: LayerPoint[];
  zones: LayerZone[];
  details: Record<string, DetailCard>;
  updatedAt: string;
};

const WATER_COLOR = '#2b7bd6';
const SEVERITY_TONE: Record<string, Tone> = { CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warn', LOW: 'safe' };
const fmt = (d: Date) => d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Aqtau' });

function layerOf(i: Incident): LayerKey {
  if (i.severity === 'CRITICAL') return 'critical';
  if (i.type === 'POTHOLE' || i.type === 'ROAD') return 'road';
  if (i.type === 'WATER_OUTAGE' || i.type === 'WATER_LEAK') return 'water';
  if (i.type === 'AIR_QUALITY') return 'air';
  if (i.source === 'RESIDENT') return 'reports';
  return 'other';
}

function dataKindBadge(i: Incident): { label: string; tone: Tone } | null {
  if (i.source === 'SIMULATION') return { label: 'SIMULATED', tone: 'muted' };
  if (i.isDemo) return { label: 'DEMO DATA', tone: 'muted' };
  return null;
}

export async function buildCityLayers(scope: 'operator' | 'resident', userId?: string): Promise<CityLayers> {
  const operator = scope === 'operator';
  const [incidents, facilities, cameras, workers, sensors, drones, stations] = await Promise.all([
    db.incident.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'REJECTED'] },
        ...(operator ? {} : { OR: [{ reporterId: userId }, { type: { in: [...publicIncidentTypes] }, source: { not: 'RESIDENT' } }] }),
      },
      include: { media: { orderBy: { createdAt: 'desc' }, take: 1 }, assignedWorker: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.cityFacility.findMany(),
    operator ? db.camera.findMany() : Promise.resolve([]),
    operator ? db.user.findMany({ where: { role: 'WORKER', isActive: true, lat: { not: null } }, include: { tasks: { where: { status: { not: 'COMPLETED' } } }, workerProfile: true } }) : Promise.resolve([]),
    operator ? db.sensor.findMany({ where: { type: { not: 'AIR' } } }) : Promise.resolve([]),
    operator ? db.drone.findMany() : Promise.resolve([]),
    airSnapshot(),
  ]);

  const points: LayerPoint[] = [];
  const overlays: LayerPoint[] = [];
  const zones: LayerZone[] = [];
  const details: Record<string, DetailCard> = {};

  for (const i of incidents as (Incident & { media: IncidentMedia[]; assignedWorker: { name: string } | null })[]) {
    const mine = i.reporterId === userId;
    const canOpen = operator || mine;
    const layer = layerOf(i);
    points.push({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, severity: i.severity, type: i.type, kind: 'incident', subtitle: i.address, layer, href: canOpen ? undefined : null });

    const badges: DetailCard['badges'] = [{ label: severityLabel[i.severity], tone: SEVERITY_TONE[i.severity] }, { label: statusLabel[i.status], tone: 'info' }];
    const kind = dataKindBadge(i);
    if (kind) badges.push(kind);
    const facts: DetailCard['facts'] = [
      { label: 'Категория', value: typeLabel[i.type] },
      { label: 'Источник', value: sourceLabel[i.source] },
      { label: 'Обнаружено', value: fmt(i.createdAt) },
    ];
    const card: DetailCard = { title: i.title, subtitle: i.address, badges, facts, text: i.description || undefined, href: canOpen ? `/incidents/${i.id}` : undefined, hrefLabel: 'Открыть карточку' };
    if (operator && i.media[0]) card.image = i.media[0].url;
    if (operator || mine) facts.push({ label: 'Исполнитель', value: i.assignedWorker?.name ?? 'Не назначен' });

    if (i.type === 'WATER_OUTAGE') {
      const meta = (i.metadata ?? {}) as Partial<WaterOutageMeta>;
      const radius = meta.radiusMeters ?? 400;
      zones.push({ id: `zone-${i.id}`, kind: 'water', polygon: circlePolygon(i, radius), color: WATER_COLOR, layer: 'water' });
      const affected = facilitiesWithin(i, radius, facilities);
      card.badges[1] = { label: waterStage[i.status].label, tone: 'info' };
      facts.push({ label: 'Причина', value: meta.cause ?? 'Уточняется' });
      facts.push({ label: 'Зона', value: `радиус ${radius} м` });
      facts.push({ label: 'Восстановление', value: meta.expectedRestoreAt ? `ожидается ${fmt(new Date(meta.expectedRestoreAt))}` : 'срок уточняется' });
      card.list = { title: `Затронутые объекты (${affected.length})`, items: affected.slice(0, 8).map(f => `${facilityLabel[f.kind]}: ${f.name} · ${f.distance} м`) };
      card.note = 'Жилые дома в зоне не перечисляются: данных о домах в системе нет. Показаны социальные объекты.';
    }
    if (i.type === 'POTHOLE' && i.source === 'CAMERA') {
      const meta = (i.metadata ?? {}) as Partial<RoadMetadata>;
      facts.push({ label: 'Камера', value: meta.cameraName ?? '—' });
      if (i.confidence !== null) facts.push({ label: 'Оценка CV-детектора', value: `${Math.round(i.confidence)}% (эвристика)` });
      card.note = 'Координаты — место установки камеры, а не точная позиция ямы.';
    }
    if (i.type === 'AIR_QUALITY') {
      const meta = (i.metadata ?? {}) as { schools?: { name: string; distance: number }[] };
      if (meta.schools?.length) card.list = { title: `Детские учреждения в зоне переноса (${meta.schools.length})`, items: meta.schools.slice(0, 8).map(s => `${s.name} · ${s.distance} м`) };
    }
    details[i.id] = card;
  }

  for (const f of facilities) {
    const kind = f.kind === 'SCHOOL' ? 'school' : f.kind === 'KINDERGARTEN' ? 'kindergarten' : 'hospital';
    overlays.push({ id: f.id, title: f.name, lat: f.lat, lng: f.lng, kind, subtitle: f.address, layer: 'schools', href: null });
    details[f.id] = { title: f.name, subtitle: f.address, badges: [{ label: facilityLabel[f.kind], tone: 'info' }], facts: [], note: 'Данные объекта — OpenStreetMap.' };
  }

  for (const c of cameras) {
    overlays.push({ id: c.id, title: c.name, lat: c.lat, lng: c.lng, kind: 'camera', subtitle: 'Дорожная камера', layer: 'cameras', href: null });
    details[c.id] = { title: `Камера ${c.name}`, subtitle: 'Дорожная камера', badges: [{ label: c.isDemo ? 'DEMO DATA' : 'LIVE', tone: 'muted' }], facts: [{ label: 'Статус', value: c.status === 'ONLINE' ? 'В сети' : c.status }], href: '/operator/road', hrefLabel: 'Разобрать кадр' };
  }
  for (const d of drones) {
    overlays.push({ id: d.id, title: d.name, lat: d.lat, lng: d.lng, kind: 'drone', subtitle: 'Демо-дрон', layer: 'cameras', href: null });
    details[d.id] = { title: d.name, subtitle: 'Береговой дрон', badges: [{ label: 'DEMO DATA', tone: 'muted' }], facts: [{ label: 'Статус', value: d.status }] };
  }
  for (const s of sensors) {
    overlays.push({ id: s.id, title: s.name, lat: s.lat, lng: s.lng, kind: 'sensor', subtitle: 'Датчик давления', layer: 'water', href: null });
    details[s.id] = { title: s.name, subtitle: 'Датчик водопровода', badges: [{ label: 'DEMO DATA', tone: 'muted' }], facts: [{ label: 'Статус', value: s.status === 'ONLINE' ? 'В сети' : s.status }] };
  }
  for (const w of workers) {
    points.push({ id: w.id, title: w.name, lat: w.lat!, lng: w.lng!, kind: 'worker', subtitle: w.tasks.length ? 'На задании' : 'Свободен', layer: 'workers', href: null });
    details[w.id] = { title: w.name, subtitle: w.workerProfile?.specialization ?? 'Работник', badges: [{ label: w.tasks.length ? 'На задании' : 'Свободен', tone: w.tasks.length ? 'warn' : 'safe' }], facts: [{ label: 'Активных задач', value: String(w.tasks.length) }], note: 'Позиция — последняя сохранённая.' };
  }

  for (const s of stations) {
    overlays.push({ id: s.id, title: s.name, lat: s.lat, lng: s.lng, kind: 'air', color: s.category.color, label: String(s.aqi), subtitle: `AQI ${s.aqi}`, layer: 'air', href: null });
    // Шлейф рисуем там, где есть что показывать: от «вредно для чувствительных» и выше.
    if (s.aqi > 100) zones.push({ id: `plume-${s.id}`, kind: 'plume', polygon: s.plume.polygon, color: s.category.color, layer: 'air' });
    details[s.id] = {
      title: s.name,
      subtitle: `Обновлено ${fmt(s.measuredAt)}`,
      badges: [{ label: `AQI ${s.aqi} · ${s.category.label}`, tone: s.aqi > 150 ? 'danger' : s.aqi > 100 ? 'warn' : 'safe' }, { label: s.dataKind, tone: s.dataKind === 'LIVE' ? 'info' : 'muted' }],
      facts: [
        { label: 'PM2.5', value: `${s.values.pm25.toFixed(1)} мкг/м³` },
        ...(s.values.pm10 !== undefined ? [{ label: 'PM10', value: `${s.values.pm10.toFixed(0)} мкг/м³` }] : []),
        ...(s.values.no2 !== undefined ? [{ label: 'NO₂', value: `${s.values.no2.toFixed(1)} мкг/м³` }] : []),
        { label: 'Ветер', value: `${windFromLabel(s.wind.directionDeg)}, ${s.wind.speedMs.toFixed(1)} м/с` },
        { label: 'Источник', value: s.source },
      ],
      text: s.category.advice,
      list: s.aqi > 100 && s.schoolsInZone.length ? { title: `В зоне переноса (оценка): ${s.schoolsInZone.length} дет. учреждений`, items: s.schoolsInZone.slice(0, 8).map(f => `${f.name} · ${f.distance} м`) } : undefined,
      note: s.aqi > 100 ? 'Зона переноса — упрощённая геометрическая оценка по ветру, а не модель рассеивания.' : undefined,
    };
  }

  return { points, overlays, zones, details, updatedAt: new Date().toISOString() };
}
