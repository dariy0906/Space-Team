'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap, RasterTileSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { severityColor, severityLabel, typeLabel } from '@/lib/labels';
import { PIPE_NETWORK, pipeConditionColor, pipeConditionLabel, pipeKindLabel, type PipeSegment } from '@/lib/pipe-network';
import { kindColor, kindLabel, type MapPoint, type MapPointKind } from '@/lib/map-kinds';
import { kindGlyph, typeGlyph } from './icons';
import { ICONS, type IconNode } from '@/lib/icon-paths';
import type { Severity } from '@prisma/client';

export type { MapPoint, MapPointKind } from '@/lib/map-kinds';

const AKTAU_CENTER: [number, number] = [51.174, 43.653];
const AKTAU_ZOOM = 11.5;
// MapLibre не рисует ни одной подписи без glyphs — без этого URL счётчик кластеров оставался пустым.
// Сервер демонстрационный: для продакшена шрифты стоит положить в public/ и раздавать со своего домена.
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
// Без явного адреса worker MapLibre под Next.js отдаёт 404, и тогда не отрисовывается
// ни один GeoJSON-слой: ни точки, ни кластеры, ни схема водопровода (см. scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const LIGHT_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILES = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

/** Рисует контур иконки lucide на canvas: та же геометрия, что и в разметке, без системных эмодзи. */
function drawGlyph(ctx: CanvasRenderingContext2D, node: IconNode, size: number) {
  const scale = size / 24;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, attrs] of node) {
    const path = new Path2D();
    if (tag === 'path') path.addPath(new Path2D(String(attrs.d)));
    else if (tag === 'circle') path.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2);
    else if (tag === 'rect') path.roundRect(Number(attrs.x), Number(attrs.y), Number(attrs.width), Number(attrs.height), Number(attrs.rx ?? 0));
    else if (tag === 'line') { path.moveTo(Number(attrs.x1), Number(attrs.y1)); path.lineTo(Number(attrs.x2), Number(attrs.y2)); }
    else if (tag === 'polyline' || tag === 'polygon') {
      const nums = String(attrs.points).trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        if (i === 0) path.moveTo(nums[0], nums[1]); else path.lineTo(nums[i], nums[i + 1]);
      }
      if (tag === 'polygon') path.closePath();
    } else continue;
    ctx.stroke(path);
  }
  ctx.restore();
}

function pointColor(point: MapPoint): string {
  return point.severity ? severityColor[point.severity] : kindColor[point.kind];
}

function feature(point: MapPoint): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    id: point.id,
    geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    properties: {
      id: point.id,
      title: point.title,
      kind: point.kind,
      subtitle: point.subtitle ?? '',
      severity: point.severity ?? '',
      typeLabel: point.type ? typeLabel[point.type] : kindLabel[point.kind],
      icon: point.type ? `type-${point.type}` : `kind-${point.kind}`,
      color: pointColor(point),
      radius: point.severity === 'CRITICAL' ? 17 : point.kind === 'incident' ? 15 : 12,
      urgent: point.severity === 'CRITICAL' || point.severity === 'HIGH' ? 1 : 0,
      weight: point.severity === 'CRITICAL' ? 1 : point.severity === 'HIGH' ? 0.75 : point.severity === 'MEDIUM' ? 0.5 : 0.3,
    },
  };
}

function pointCollection(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: 'FeatureCollection', features: points.map(feature) };
}

function pipeCollection(segments: PipeSegment[] = PIPE_NETWORK): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: segments.map(pipe => ({
      type: 'Feature' as const,
      id: pipe.id,
      geometry: { type: 'LineString' as const, coordinates: pipe.coords },
      properties: { ...pipe, color: pipeConditionColor[pipe.condition], width: pipe.type === 'trunk' ? 5 : 2.5 },
    })),
  };
}

/** Прямоугольник, охватывающий все точки; null — если точек нет. */
function boundsOf(points: MapPoint[]): maplibregl.LngLatBounds | null {
  if (points.length === 0) return null;
  const bounds = new maplibregl.LngLatBounds();
  for (const point of points) bounds.extend([point.lng, point.lat]);
  return bounds;
}

function row(label: string, value: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'map-popup-row';
  const key = document.createElement('span');
  key.textContent = label;
  const val = document.createElement('b');
  val.textContent = value;
  node.append(key, val);
  return node;
}

export type CityMapProps = {
  points: MapPoint[];
  route?: [[number, number], [number, number]];
  className?: string;
  /** Показывать панель слоёв над картой. */
  controls?: boolean;
  /** Включить слой водопровода сразу при открытии. */
  defaultPipes?: boolean;
  /** Группировать близкие точки в кластеры. */
  cluster?: boolean;
  /** Подгонять видимую область под точки. */
  autoFit?: boolean;
  /** Клик по карте возвращает координаты — используется в форме обращения. */
  onPick?: (lat: number, lng: number) => void;
  /** Подмножество водопровода: если не задано, показывается вся сеть. */
  pipes?: PipeSegment[];
  /** Скрыть переключатель слоя труб (страница водопровода управляет им сама). */
  lockPipes?: boolean;
};

export default function CityMap({ points, route, className = '', controls = true, defaultPipes = false, cluster = true, autoFit = true, onPick, pipes, lockPipes = false }: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const pickRef = useRef(onPick);
  const fitKeyRef = useRef('');
  const pipeFittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [showPipes, setShowPipes] = useState(defaultPipes);
  const [showHeat, setShowHeat] = useState(false);

  pickRef.current = onPick;

  // Сигнатура набора точек: пересчёт видимой области только при реальном изменении состава.
  const fitKey = useMemo(() => points.map(p => `${p.id}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`).join('|'), [points]);
  const data = useMemo(() => pointCollection(points), [points]);

  const pipeData = useMemo(() => pipeCollection(pipes ?? PIPE_NETWORK), [pipes]);
  const pipeStats = useMemo(() => {
    const list = pipes ?? PIPE_NETWORK;
    return {
      total: list.length,
      critical: list.filter(p => p.condition === 'critical').length,
      poor: list.filter(p => p.condition === 'poor').length,
      km: Math.round(list.reduce((sum, p) => sum + p.coords.length * 0.06, 0)),
    };
  }, [pipes]);

  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const openPopup = useCallback((map: MlMap, lngLat: [number, number], build: (node: HTMLElement) => void) => {
    popupRef.current?.remove();
    const node = document.createElement('div');
    node.className = 'map-popup';
    build(node);
    popupRef.current = new maplibregl.Popup({ offset: 16, maxWidth: '280px', closeButton: true }).setLngLat(lngLat).setDOMContent(node).addTo(map);
  }, []);

  // Карта создаётся один раз. Раньше эффект зависел от points и пересоздавал её на каждый рендер,
  // из-за чего только что добавленная точка исчезала вместе со старым экземпляром карты.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      center: AKTAU_CENTER,
      zoom: AKTAU_ZOOM,
      pitch: 28,
      attributionControl: { compact: true },
      style: {
        version: 8,
        glyphs: GLYPHS,
        sources: { osm: { type: 'raster', tiles: [LIGHT_TILES], tileSize: 256, attribution: '© OpenStreetMap contributors, © CARTO' } },
        layers: [{ id: 'base', type: 'raster', source: 'osm' }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      const markerIcons: Record<string, IconNode> = {
        ...Object.fromEntries(Object.entries(typeGlyph).map(([key, icon]) => [`type-${key}`, ICONS[icon]])),
        ...Object.fromEntries(Object.entries(kindGlyph).map(([key, icon]) => [`kind-${key}`, ICONS[icon]])),
      };
      for (const [name, node] of Object.entries(markerIcons)) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const size = 42;
        ctx.translate((64 - size) / 2, (64 - size) / 2);
        drawGlyph(ctx, node, size);
        map.addImage(name, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2.4 });
      }

      map.addSource('pipes', { type: 'geojson', data: pipeCollection([]) });
      map.addLayer({ id: 'pipes-casing', type: 'line', source: 'pipes', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': '#0b1f31', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['*', ['get', 'width'], 0.7], 16, ['*', ['get', 'width'], 2.4]] } });
      map.addLayer({ id: 'pipes', type: 'line', source: 'pipes', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': ['get', 'color'], 'line-opacity': ['case', ['==', ['get', 'type'], 'trunk'], 0.95, 0.7], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['*', ['get', 'width'], 0.5], 16, ['*', ['get', 'width'], 1.9]], 'line-dasharray': [1, 0] } });

      map.addSource('points', { type: 'geojson', data: pointCollection([]), cluster, clusterRadius: 48, clusterMaxZoom: 13 });

      map.addLayer({ id: 'heat', type: 'heatmap', source: 'points', layout: { visibility: 'none' }, paint: { 'heatmap-weight': ['get', 'weight'], 'heatmap-intensity': 1.2, 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 26, 16, 60], 'heatmap-opacity': 0.75, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(33,150,224,0.35)', 0.45, 'rgba(31,163,139,0.5)', 0.7, 'rgba(240,172,67,0.7)', 1, 'rgba(223,79,98,0.85)'] } });

      map.addLayer({ id: 'marker-pulse', type: 'circle', source: 'points', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'urgent'], 1]], paint: { 'circle-color': ['get', 'color'], 'circle-opacity': 0.18, 'circle-radius': 26 } });
      map.addLayer({ id: 'markers', type: 'circle', source: 'points', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['get', 'radius'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
      map.addLayer({ id: 'marker-icons', type: 'symbol', source: 'points', filter: ['!', ['has', 'point_count']], layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 0.85 } });

      map.addLayer({ id: 'clusters', type: 'circle', source: 'points', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#0f9aa8', 10, '#0d7d96', 25, '#123b59'], 'circle-radius': ['step', ['get', 'point_count'], 19, 10, 24, 25, 30], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5, 'circle-opacity': 0.94 } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13 }, paint: { 'text-color': '#fff' } });

      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#00a9b7', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [2, 1.4] } });

      for (const layer of ['markers', 'clusters', 'pipes'] as const) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = pickRef.current ? 'crosshair' : ''; });
      }

      map.on('click', 'markers', event => {
        const found = event.features?.[0];
        if (!found || found.geometry.type !== 'Point') return;
        event.originalEvent.stopPropagation();
        const props = found.properties as { id: string; title: string; subtitle: string; kind: MapPointKind; severity: string; typeLabel: string };
        openPopup(map, found.geometry.coordinates as [number, number], node => {
          const title = document.createElement('strong');
          title.textContent = props.title;
          node.append(title);
          if (props.severity) {
            const badge = document.createElement('span');
            badge.className = `map-popup-badge severity-${props.severity.toLowerCase()}`;
            badge.textContent = severityLabel[props.severity as Severity];
            node.append(badge);
          }
          node.append(row('Категория', props.typeLabel));
          if (props.subtitle) node.append(row('Адрес', props.subtitle));
          if (props.kind === 'incident') {
            const link = document.createElement('a');
            link.href = `/incidents/${props.id}`;
            link.textContent = 'Открыть событие →';
            node.append(link);
          }
        });
      });

      map.on('click', 'pipes', event => {
        const found = event.features?.[0];
        if (!found) return;
        event.originalEvent.stopPropagation();
        const pipe = found.properties as { id: string; name: string; type: keyof typeof pipeKindLabel; diameter: number; material: string; yearBuilt: number; condition: keyof typeof pipeConditionLabel };
        openPopup(map, [event.lngLat.lng, event.lngLat.lat], node => {
          const title = document.createElement('strong');
          title.textContent = pipe.name || pipe.id;
          node.append(title);
          const badge = document.createElement('span');
          badge.className = 'map-popup-badge';
          badge.style.background = `${pipeConditionColor[pipe.condition]}22`;
          badge.style.color = pipeConditionColor[pipe.condition];
          badge.textContent = pipeConditionLabel[pipe.condition];
          node.append(badge);
          node.append(row('Тип', pipeKindLabel[pipe.type]), row('Диаметр', `${pipe.diameter} мм`), row('Материал', pipe.material), row('Год прокладки', String(pipe.yearBuilt)), row('Износ', `${Math.min(100, Math.round(((new Date().getFullYear() - pipe.yearBuilt) / 50) * 100))} %`));
        });
      });

      map.on('click', 'clusters', async event => {
        const found = event.features?.[0];
        if (!found || found.geometry.type !== 'Point') return;
        event.originalEvent.stopPropagation();
        const source = map.getSource('points') as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(Number(found.properties?.cluster_id));
        map.easeTo({ center: found.geometry.coordinates as [number, number], zoom });
      });

      map.on('click', event => {
        const pick = pickRef.current;
        if (!pick) return;
        const hit = map.queryRenderedFeatures(event.point, { layers: ['markers', 'clusters'] });
        if (hit.length > 0) return;
        pick(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6)));
      });

      setReady(true);
    });

    const resizer = new ResizeObserver(() => map.resize());
    resizer.observe(container.current);
    return () => {
      resizer.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [cluster, openPopup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('pipes') as GeoJSONSource | undefined)?.setData(pipeData);
  }, [pipeData, ready]);

  // На странице водопровода точек может не быть вовсе, поэтому стартовую область
  // задаёт сама сеть — иначе карта осталась бы на обзорном зуме всего региона.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !lockPipes || pipeFittedRef.current) return;
    const segments = pipes ?? PIPE_NETWORK;
    if (segments.length === 0) return;
    pipeFittedRef.current = true;
    const bounds = new maplibregl.LngLatBounds();
    for (const pipe of segments) for (const coord of pipe.coords) bounds.extend(coord);
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 50, right: 50 }, duration: 0 });
  }, [pipes, lockPipes, ready]);

  // Смена темы меняет только тайлы — карта и её слои остаются на месте.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('osm') as RasterTileSource | undefined)?.setTiles([dark ? DARK_TILES : LIGHT_TILES]);
  }, [dark, ready]);

  // Точки обновляются данными источника, а не пересозданием карты.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('points') as GeoJSONSource | undefined)?.setData(data);
  }, [data, ready]);

  // Без этого новая точка (например, геолокация жителя) просто оставалась за пределами экрана.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !autoFit || route || fitKey === fitKeyRef.current) return;
    fitKeyRef.current = fitKey;
    const bounds = boundsOf(points);
    if (!bounds) return;
    const single = bounds.getNorthEast().lat === bounds.getSouthWest().lat && bounds.getNorthEast().lng === bounds.getSouthWest().lng;
    if (single) map.easeTo({ center: bounds.getCenter(), zoom: Math.max(map.getZoom(), 14.2), duration: 700 });
    else map.fitBounds(bounds, { padding: { top: 70, bottom: 70, left: 60, right: 60 }, maxZoom: 15.5, duration: 700 });
  }, [fitKey, points, ready, autoFit, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('route') as GeoJSONSource | undefined;
    if (!source) return;
    if (!route) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: route.map(([lat, lng]) => [lng, lat]) }, properties: {} });
    map.fitBounds([[Math.min(route[0][1], route[1][1]), Math.min(route[0][0], route[1][0])], [Math.max(route[0][1], route[1][1]), Math.max(route[0][0], route[1][0])]], { padding: 90, maxZoom: 14.5 });
  }, [route, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const layer of ['pipes', 'pipes-casing']) map.setLayoutProperty(layer, 'visibility', showPipes ? 'visible' : 'none');
  }, [showPipes, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('heat', 'visibility', showHeat ? 'visible' : 'none');
  }, [showHeat, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = onPick ? 'crosshair' : '';
  }, [onPick, ready]);

  // Мягкая пульсация вокруг критичных событий — считается по времени, без перерисовки React.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let frame = 0;
    const tick = (time: number) => {
      const radius = 24 + Math.sin(time / 420) * 8;
      map.setPaintProperty('marker-pulse', 'circle-radius', radius);
      map.setPaintProperty('marker-pulse', 'circle-opacity', 0.26 - Math.sin(time / 420) * 0.1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  const visible = points.length;

  return (
    <div className={`map-frame ${className}`}>
      {controls && (
        <div className="map-toolbar">
          {!lockPipes && (
            <button type="button" className={`map-chip ${showPipes ? 'on' : ''}`} onClick={() => setShowPipes(v => !v)} aria-pressed={showPipes}>
              <span className="map-chip-mark pipes" /> Карта труб
            </button>
          )}
          <button type="button" className={`map-chip ${showHeat ? 'on' : ''}`} onClick={() => setShowHeat(v => !v)} aria-pressed={showHeat}>
            <span className="map-chip-mark heat" /> Тепловая карта
          </button>
          <button type="button" className="map-chip" onClick={() => { const bounds = boundsOf(points); const map = mapRef.current; if (!map) return; if (bounds) map.fitBounds(bounds, { padding: 70, maxZoom: 15.5, duration: 600 }); else map.easeTo({ center: AKTAU_CENTER, zoom: AKTAU_ZOOM, duration: 600 }); }}>
            <span className="map-chip-mark fit" /> Показать все ({visible})
          </button>
        </div>
      )}
      <div ref={container} className="city-map" aria-label="Карта Актау" />
      {onPick && <div className="map-hint">Нажмите на карту, чтобы указать точное место</div>}
      {showPipes && (
        <div className="map-pipe-legend">
          <span className="map-pipe-legend-title">Состояние сети</span>
          {(Object.keys(pipeConditionLabel) as (keyof typeof pipeConditionLabel)[]).map(condition => (
            <span key={condition}><i style={{ background: pipeConditionColor[condition] }} />{pipeConditionLabel[condition]}</span>
          ))}
          <span className="map-pipe-legend-stat">{pipeStats.total} участков · ≈{pipeStats.km} км · {pipeStats.critical} аварийных</span>
        </div>
      )}
    </div>
  );
}
