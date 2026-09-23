'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { severityColor } from '@/lib/labels';
import type { Severity } from '@prisma/client';
import type { IncidentType } from '@prisma/client';
import { typeIcon } from '@/lib/labels';

export type MapPoint = { id: string; title: string; lat: number; lng: number; severity?: Severity; type?: IncidentType; kind: 'incident' | 'worker' | 'camera' | 'sensor' | 'drone' | 'resident'; subtitle?: string };
const center: [number, number] = [51.174, 43.653];
function feature(point: MapPoint): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, properties: { id: point.id, title: point.title, kind: point.kind, subtitle: point.subtitle ?? '', icon: point.type ? `type-${point.type}` : `kind-${point.kind}`, color: point.severity ? severityColor[point.severity] : point.kind === 'worker' ? '#22b8a6' : point.kind === 'resident' ? '#2196e0' : '#64748b' } };
}
export default function CityMap({ points, route, className = '' }: { points: MapPoint[]; route?: [[number, number], [number, number]]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [dark,setDark] = useState(false);
  useEffect(() => { const update = () => setDark(document.documentElement.classList.contains('dark')); update(); const observer = new MutationObserver(update); observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']}); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!container.current) return;
    const tiles = dark ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const map = new maplibregl.Map({ container: container.current, center, zoom: 11.5, pitch: 28, style: { version: 8, sources: { osm: { type: 'raster', tiles: [tiles], tileSize: 256, attribution: '© OpenStreetMap contributors, © CARTO' } }, layers: [{ id: 'base', type: 'raster', source: 'osm' }] } });
    mapRef.current = map; map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      const icons: Record<string,string> = { ...Object.fromEntries(Object.entries(typeIcon).map(([key,value])=>[`type-${key}`,value])), 'kind-worker':'◆', 'kind-camera':'📷', 'kind-sensor':'◉', 'kind-drone':'✦', 'kind-resident':'⌖', 'kind-incident':'●' };
      for (const [name,symbol] of Object.entries(icons)) { const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64; const ctx=canvas.getContext('2d'); if (!ctx) continue; ctx.font='42px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(symbol,32,33); map.addImage(name,ctx.getImageData(0,0,64,64),{pixelRatio:2}); }
      map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: points.map(feature) }, cluster: true, clusterRadius: 45 });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'points', filter: ['has','point_count'], paint: { 'circle-color': '#123b59', 'circle-radius': 20, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'points', filter: ['has','point_count'], layout: { 'text-field': ['get','point_count_abbreviated'], 'text-size': 13 }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'markers', type: 'circle', source: 'points', filter: ['!', ['has','point_count']], paint: { 'circle-color': ['get','color'], 'circle-radius': 16, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
      map.addLayer({ id: 'marker-icons', type: 'symbol', source: 'points', filter: ['!', ['has','point_count']], layout: { 'icon-image': ['get','icon'], 'icon-allow-overlap': true } });
      if (route) { map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route.map(([lat,lng]) => [lng,lat]) }, properties: {} } }); map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#00a9b7', 'line-width': 5, 'line-opacity': .85 } }); map.fitBounds([[Math.min(route[0][1],route[1][1]),Math.min(route[0][0],route[1][0])],[Math.max(route[0][1],route[1][1]),Math.max(route[0][0],route[1][0])]], { padding: 80, maxZoom: 14 }); }
      map.on('click','markers', e => { const f = e.features?.[0]; if (!f || f.geometry.type !== 'Point') return; const p = f.properties as { id: string; title: string; subtitle: string; kind: string }; const node = document.createElement('div'); node.className = 'map-popup'; const strong = document.createElement('strong'); strong.textContent = p.title; node.append(strong, document.createElement('br'), document.createTextNode(p.subtitle)); if (p.kind === 'incident') { const link = document.createElement('a'); link.href = `/incidents/${p.id}`; link.textContent = 'Открыть событие →'; node.append(document.createElement('br'), link); } new maplibregl.Popup({ offset: 14 }).setLngLat(f.geometry.coordinates as [number,number]).setDOMContent(node).addTo(map); });
      map.on('click','clusters', async e => { const f = e.features?.[0]; if (!f || f.geometry.type !== 'Point') return; const id = Number(f.properties?.cluster_id); const source = map.getSource('points') as GeoJSONSource; const zoom = await source.getClusterExpansionZoom(id); map.easeTo({ center: f.geometry.coordinates as [number,number], zoom }); });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [route, points, dark]);
  return <div ref={container} className={`city-map ${className}`} aria-label="Карта Актау" />;
}
