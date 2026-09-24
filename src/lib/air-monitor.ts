// Мониторинг качества воздуха: данные станций, ветер, школы в зоне переноса и предупреждения.
// LIVE — модельные данные CAMS через открытый API Open-Meteo (без ключа, обновление раз в 15 минут).
// SIMULATED — демонстрационные станции; их показания помечены isDemo и так же подписаны в интерфейсе.
import type { Prisma, Sensor, SensorReading, Severity } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { AQI_WARNING_LEVEL, aqiCategory, aqiFromPm25, estimatePlume, facilitiesWithin, inPlume, type Plume, type Wind } from './city';
import { distanceMeters } from './routing';

export const AIR_SENSOR_TYPE = 'AIR';
export const LIVE_SENSOR_NAME = 'Модель CAMS · центр Актау';
const LIVE_POINT = { lat: 43.6505, lng: 51.1605 };
const LIVE_REFRESH_MS = 15 * 60 * 1000;

const readingSchema = z.object({
  pm25: z.number(),
  pm10: z.number().optional(),
  no2: z.number().optional(),
  aqi: z.number().optional(),
  windDirDeg: z.number(),
  windSpeedMs: z.number(),
  source: z.string().optional(),
  observedAt: z.string().optional(),
});
export type AirValues = z.infer<typeof readingSchema>;

export type AirStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dataKind: 'LIVE' | 'SIMULATED';
  source: string;
  measuredAt: Date;
  values: AirValues;
  aqi: number;
  category: ReturnType<typeof aqiCategory>;
  wind: Wind;
  plume: Plume;
  schoolsInZone: { id: string; name: string; kind: string; distance: number }[];
};

function toStation(sensor: Sensor, reading: SensorReading, facilities: { id: string; name: string; kind: 'SCHOOL' | 'KINDERGARTEN' | 'HOSPITAL' | 'SOCIAL'; lat: number; lng: number }[]): AirStation | null {
  const parsed = readingSchema.safeParse(reading.values);
  if (!parsed.success) return null;
  const values = parsed.data;
  // У LIVE есть официальный индекс провайдера (24-часовое усреднение EPA). Для симуляции считаем
  // по текущей концентрации — это оценка, а не суточный индекс.
  const aqi = Math.round(values.aqi ?? aqiFromPm25(values.pm25));
  const wind = { directionDeg: values.windDirDeg, speedMs: values.windSpeedMs };
  const plume = estimatePlume(sensor, wind);
  const children = facilities.filter(f => f.kind === 'SCHOOL' || f.kind === 'KINDERGARTEN');
  const schoolsInZone = facilitiesWithin(sensor, plume.lengthMeters, children)
    .filter(f => inPlume(sensor, plume, f))
    .map(f => ({ id: f.id, name: f.name, kind: f.kind, distance: f.distance }));
  return {
    id: sensor.id,
    name: sensor.name,
    lat: sensor.lat,
    lng: sensor.lng,
    dataKind: reading.isDemo ? 'SIMULATED' : 'LIVE',
    source: values.source ?? (reading.isDemo ? 'demo-simulation' : 'sensor'),
    measuredAt: values.observedAt ? new Date(values.observedAt) : reading.createdAt,
    values,
    aqi,
    category: aqiCategory(aqi),
    wind,
    plume,
    schoolsInZone,
  };
}

/** Последние показания всех станций воздуха с рассчитанными зонами. */
export async function airSnapshot(): Promise<AirStation[]> {
  const [sensors, facilities] = await Promise.all([
    db.sensor.findMany({ where: { type: AIR_SENSOR_TYPE }, include: { readings: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { name: 'asc' } }),
    db.cityFacility.findMany({ select: { id: true, name: true, kind: true, lat: true, lng: true } }),
  ]);
  return sensors.flatMap(s => {
    const reading = s.readings[0];
    const station = reading ? toStation(s, reading, facilities) : null;
    return station ? [station] : [];
  });
}

const openMeteoAir = z.object({ current: z.object({ time: z.string(), pm2_5: z.number(), pm10: z.number(), nitrogen_dioxide: z.number(), us_aqi: z.number() }) });
const openMeteoWind = z.object({ current: z.object({ wind_speed_10m: z.number(), wind_direction_10m: z.number() }) });

/** Забирает свежие модельные данные Open-Meteo, если с прошлого обновления прошло 15 минут. */
export async function refreshLiveAir(force = false): Promise<boolean> {
  let sensor = await db.sensor.findFirst({ where: { type: AIR_SENSOR_TYPE, name: LIVE_SENSOR_NAME } });
  if (!sensor) sensor = await db.sensor.create({ data: { name: LIVE_SENSOR_NAME, type: AIR_SENSOR_TYPE, ...LIVE_POINT } });
  const last = await db.sensorReading.findFirst({ where: { sensorId: sensor.id }, orderBy: { createdAt: 'desc' } });
  if (!force && last && Date.now() - last.createdAt.getTime() < LIVE_REFRESH_MS) return false;
  const q = `latitude=${LIVE_POINT.lat}&longitude=${LIVE_POINT.lng}&timezone=Asia%2FAqtau`;
  const [airRes, windRes] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5,pm10,nitrogen_dioxide,us_aqi`, { signal: AbortSignal.timeout(8000), cache: 'no-store' }),
    fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`, { signal: AbortSignal.timeout(8000), cache: 'no-store' }),
  ]);
  if (!airRes.ok || !windRes.ok) return false;
  const air = openMeteoAir.parse(await airRes.json()).current;
  const wind = openMeteoWind.parse(await windRes.json()).current;
  const values: AirValues = {
    pm25: air.pm2_5,
    pm10: air.pm10,
    no2: air.nitrogen_dioxide,
    aqi: air.us_aqi,
    windDirDeg: wind.wind_direction_10m,
    windSpeedMs: wind.wind_speed_10m,
    source: 'Open-Meteo · модель CAMS',
    observedAt: new Date(`${air.time}:00+05:00`).toISOString(),
  };
  await db.sensorReading.create({ data: { sensorId: sensor.id, values: values satisfies Prisma.InputJsonValue, isDemo: false } });
  return true;
}

function severityFor(aqi: number): Severity {
  return aqi > 200 ? 'CRITICAL' : aqi > 150 ? 'HIGH' : 'MEDIUM';
}

/**
 * Для станций с AQI от 101 и детскими учреждениями в зоне переноса создаёт (или обновляет)
 * городское предупреждение и событие AIR_QUALITY для операторов. Повторный вызов идемпотентен.
 */
export async function evaluateAirQuality(): Promise<{ warnings: number; created: number }> {
  const stations = await airSnapshot();
  let warnings = 0;
  let created = 0;
  for (const s of stations) {
    if (s.aqi < AQI_WARNING_LEVEL || s.schoolsInZone.length === 0) continue;
    warnings++;
    // В тексте — сначала учреждения с собственным названием: «Школа №12» информативнее, чем «Детский сад».
    const generic = new Set(['Школа', 'Детский сад']);
    const named = [...s.schoolsInZone].sort((a, b) => Number(generic.has(a.name)) - Number(generic.has(b.name)) || a.distance - b.distance);
    const names = named.slice(0, 3).map(f => f.name).join(', ');
    const more = s.schoolsInZone.length > 3 ? ` и ещё ${s.schoolsInZone.length - 3}` : '';
    const tag = s.dataKind === 'SIMULATED' ? ' [SIMULATED]' : '';
    const title = `Качество воздуха: ${s.category.label.toLowerCase()} (AQI ${s.aqi})${tag}`;
    const description = `Высокий уровень PM2.5 (${s.values.pm25.toFixed(0)} мкг/м³) у станции «${s.name}». По оценке направления ветра в зоне переноса: ${names}${more}. Рекомендация: ${s.category.advice}`;
    const severity = severityFor(s.aqi);

    const result = await db.$transaction(async tx => {
      const existingWarning = (await tx.publicWarning.findMany({ where: { expiresAt: { gt: new Date() }, title: { startsWith: 'Качество воздуха' } } }))
        .find(w => distanceMeters(w, s) < 50);
      if (existingWarning) {
        await tx.publicWarning.update({ where: { id: existingWarning.id }, data: { title, description, severity, expiresAt: new Date(Date.now() + 3 * 3600000) } });
      } else {
        await tx.publicWarning.create({ data: { title, description, severity, lat: s.lat, lng: s.lng, isDemo: s.dataKind === 'SIMULATED', expiresAt: new Date(Date.now() + 3 * 3600000) } });
        // Жители видят предупреждение на своей карте без ручного обновления.
        await tx.realtimeEvent.create({ data: { role: 'RESIDENT' } });
      }

      const openIncident = (await tx.incident.findMany({ where: { type: 'AIR_QUALITY', status: { notIn: ['RESOLVED', 'REJECTED'] } } })).find(i => distanceMeters(i, s) < 50);
      const metadata = { aqi: s.aqi, pm25: s.values.pm25, dataKind: s.dataKind, source: s.source, wind: s.wind, plumeMethod: s.plume.method, schools: s.schoolsInZone } satisfies Prisma.InputJsonValue;
      if (openIncident) {
        await tx.incident.update({ where: { id: openIncident.id }, data: { metadata, severity, description } });
        return false;
      }
      const incident = await tx.incident.create({
        data: {
          title: `Ухудшение воздуха у школ · ${s.name}`,
          description,
          type: 'AIR_QUALITY',
          source: s.dataKind === 'SIMULATED' ? 'SIMULATION' : 'SENSOR',
          severity,
          lat: s.lat,
          lng: s.lng,
          address: s.name,
          isDemo: s.dataKind === 'SIMULATED',
          metadata,
          history: { create: { action: `Предупреждение сформировано автоматически: AQI ${s.aqi}, в зоне ${s.schoolsInZone.length} дет. учреждений`, newStatus: 'NEW' } },
        },
      });
      // Центр уведомлений: операторам и администраторам.
      const recipients = await tx.user.findMany({ where: { role: { in: ['OPERATOR', 'ADMIN'] }, isActive: true }, select: { id: true } });
      await tx.notification.createMany({ data: recipients.map(u => ({ userId: u.id, title: `Воздух у школ: AQI ${s.aqi}${tag}`, href: `/incidents/${incident.id}` })) });
      await tx.realtimeEvent.createMany({ data: recipients.map(u => ({ userId: u.id })) });
      return true;
    });
    if (result) created++;
  }
  return { warnings, created };
}
