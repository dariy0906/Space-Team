// Городские расчёты без обращения к БД: качество воздуха, ветер, зоны воздействия.
// Всё, что здесь не является измерением, — упрощённая оценка и помечается так в интерфейсе.
import type { FacilityKind, IncidentStatus } from '@prisma/client';
import { distanceMeters, type Coordinate } from './routing';

// ─────────────────────────── Качество воздуха ───────────────────────────

export type AqiCategory = 'GOOD' | 'MODERATE' | 'UNHEALTHY_SENSITIVE' | 'UNHEALTHY' | 'VERY_UNHEALTHY' | 'HAZARDOUS';

export const aqiCategories: { id: AqiCategory; max: number; label: string; color: string; advice: string }[] = [
  { id: 'GOOD', max: 50, label: 'Хорошо', color: '#22a55b', advice: 'Качество воздуха не вызывает опасений.' },
  { id: 'MODERATE', max: 100, label: 'Умеренно', color: '#d4b106', advice: 'Особо чувствительным людям стоит сократить долгую нагрузку на улице.' },
  { id: 'UNHEALTHY_SENSITIVE', max: 150, label: 'Вредно для чувствительных', color: '#ef8a17', advice: 'Детям, пожилым и людям с болезнями лёгких — ограничить время на улице.' },
  { id: 'UNHEALTHY', max: 200, label: 'Вредно', color: '#e03e3e', advice: 'Всем ограничить активность на улице; занятия школьников перенести в помещение.' },
  { id: 'VERY_UNHEALTHY', max: 300, label: 'Очень вредно', color: '#8e3fa0', advice: 'Избегать пребывания на улице.' },
  { id: 'HAZARDOUS', max: 500, label: 'Опасно', color: '#7e1030', advice: 'Оставаться в помещении с закрытыми окнами.' },
];

// Шкала EPA для PM2.5 (редакция 2024 г.), концентрации в мкг/м³.
const PM25_BREAKPOINTS: [number, number, number, number][] = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

/** Индекс AQI по концентрации PM2.5 (линейная интерполяция внутри диапазона EPA). */
export function aqiFromPm25(pm25: number): number {
  const c = Math.max(0, Math.floor(pm25 * 10) / 10);
  const row = PM25_BREAKPOINTS.find(([lo, hi]) => c >= lo && c <= hi) ?? PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
  const [lo, hi, aLo, aHi] = row;
  return Math.min(500, Math.round(((aHi - aLo) / (hi - lo)) * (Math.min(c, hi) - lo) + aLo));
}

export function aqiCategory(aqi: number) {
  return aqiCategories.find(c => aqi <= c.max) ?? aqiCategories[aqiCategories.length - 1];
}

/** С этого уровня рядом со школами формируется предупреждение. */
export const AQI_WARNING_LEVEL = 101;

// ─────────────────────────── Ветер ───────────────────────────

export type Wind = { directionDeg: number; speedMs: number };

const compass = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
/** Метеорологическое направление — откуда дует ветер: 90° = восточный ветер. */
export function windFromLabel(directionDeg: number): string {
  return compass[Math.round((((directionDeg % 360) + 360) % 360) / 45) % 8];
}

/** Точка на расстоянии distance метров от origin по азимуту bearing (градусы, 0 = север). */
export function destination(origin: Coordinate, bearingDeg: number, distance: number): Coordinate {
  const R = 6371000;
  const rad = Math.PI / 180;
  const b = bearingDeg * rad;
  const lat1 = origin.lat * rad;
  const lng1 = origin.lng * rad;
  const d = distance / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / rad, lng: lng2 / rad };
}

export function bearingDeg(from: Coordinate, to: Coordinate): number {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

export type Plume = {
  /** Куда движется воздух: противоположно направлению «откуда дует». */
  towardDeg: number;
  lengthMeters: number;
  halfAngleDeg: number;
  polygon: [number, number][];
  method: 'geometric-estimate';
};

/**
 * Упрощённая оценка зоны переноса загрязнения: сектор по ветру от станции. Длина — путь воздуха
 * за ~20 минут при текущей скорости (от 1,2 до 5 км). Это не атмосферная модель рассеивания:
 * рельеф, застройка, устойчивость атмосферы и выбросы не учитываются.
 */
export function estimatePlume(station: Coordinate, wind: Wind): Plume {
  const towardDeg = (wind.directionDeg + 180) % 360;
  const lengthMeters = Math.min(5000, Math.max(1200, wind.speedMs * 60 * 20));
  const halfAngleDeg = wind.speedMs >= 6 ? 18 : wind.speedMs >= 3 ? 25 : 35;
  const arc: [number, number][] = [];
  for (let a = -halfAngleDeg; a <= halfAngleDeg; a += halfAngleDeg / 6) {
    const p = destination(station, towardDeg + a, lengthMeters);
    arc.push([p.lng, p.lat]);
  }
  const polygon: [number, number][] = [[station.lng, station.lat], ...arc, [station.lng, station.lat]];
  return { towardDeg, lengthMeters, halfAngleDeg, polygon, method: 'geometric-estimate' };
}

/** Попадает ли точка в сектор переноса или в ближний радиус вокруг станции. */
export function inPlume(station: Coordinate, plume: Plume, point: Coordinate, nearRadius = 800): boolean {
  const d = distanceMeters(station, point);
  if (d <= nearRadius) return true;
  if (d > plume.lengthMeters) return false;
  const diff = Math.abs(((bearingDeg(station, point) - plume.towardDeg + 540) % 360) - 180);
  return diff <= plume.halfAngleDeg;
}

// ─────────────────────────── Зоны аварий ───────────────────────────

/** Круг радиуса radius метров вокруг центра — для отображения зоны отключения. */
export function circlePolygon(center: Coordinate, radius: number, steps = 40): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(center, (360 / steps) * i, radius);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

export type FacilityLike = { id: string; kind: FacilityKind; name: string; lat: number; lng: number };

export function facilitiesWithin<T extends FacilityLike>(center: Coordinate, radius: number, facilities: T[]): (T & { distance: number })[] {
  return facilities
    .map(f => ({ ...f, distance: Math.round(distanceMeters(center, f)) }))
    .filter(f => f.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

export const facilityLabel: Record<FacilityKind, string> = { SCHOOL: 'Школа', KINDERGARTEN: 'Детский сад', HOSPITAL: 'Медучреждение', SOCIAL: 'Социальный объект' };

/** Этапы аварии водоснабжения поверх общих статусов событий. */
export const waterStage: Record<IncidentStatus, { id: string; label: string }> = {
  NEW: { id: 'DETECTED', label: 'Обнаружено' },
  WAITING_OPERATOR: { id: 'DETECTED', label: 'Обнаружено' },
  REOPENED: { id: 'CONFIRMED', label: 'Подтверждено повторно' },
  CONFIRMED: { id: 'CONFIRMED', label: 'Подтверждено' },
  ASSIGNED: { id: 'CREW_ASSIGNED', label: 'Бригада назначена' },
  IN_PROGRESS: { id: 'IN_PROGRESS', label: 'Идёт ремонт' },
  RESOLVED: { id: 'FIXED', label: 'Устранено' },
  REJECTED: { id: 'CLOSED', label: 'Закрыто' },
};

export type WaterOutageMeta = {
  radiusMeters: number;
  cause: string;
  expectedRestoreAt?: string;
  crew?: string;
};
