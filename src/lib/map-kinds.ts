// Вынесено из map.tsx, чтобы серверные компоненты могли типизировать точки,
// не подтягивая maplibre-gl вместе с самой картой.
import type { IncidentType, Severity } from '@prisma/client';

export type MapPointKind = 'incident' | 'worker' | 'camera' | 'sensor' | 'drone' | 'resident' | 'picked';

export type MapPoint = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  severity?: Severity;
  type?: IncidentType;
  kind: MapPointKind;
  subtitle?: string;
  /**
   * Куда ведёт карточка точки. Не задано — для событий это /incidents/<id>;
   * null — без ссылки (например, чужое событие, чья карточка жителю недоступна).
   */
  href?: string | null;
};

export const kindColor: Record<MapPointKind, string> = {
  incident: '#df4f62',
  worker: '#22b8a6',
  camera: '#64748b',
  sensor: '#64748b',
  drone: '#64748b',
  resident: '#2196e0',
  picked: '#7b5cf0',
};

export const kindLabel: Record<MapPointKind, string> = {
  incident: 'Инцидент',
  worker: 'Работник',
  camera: 'Камера',
  sensor: 'Датчик',
  drone: 'Дрон',
  resident: 'Житель',
  picked: 'Выбранная точка',
};
