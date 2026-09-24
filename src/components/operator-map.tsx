'use client';
import { useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Cctv, Construction, Crosshair, Droplets, Gauge, HardHat, Loader2, Mail, School, Siren, Sparkles, X } from 'lucide-react';
import MapView from './map-view';
import type { CityLayers, LayerKey, LayerPoint } from '@/lib/city-layers';
import { aqiCategories } from '@/lib/city';
import { severityColor, severityLabel } from '@/lib/labels';

const LAYERS: { key: LayerKey; label: string; icon: ComponentType<{ size?: number }>; color: string }[] = [
  { key: 'critical', label: 'Критические', icon: Siren, color: '#e5484d' },
  { key: 'road', label: 'Дороги и ямы', icon: Construction, color: '#ef8a17' },
  { key: 'reports', label: 'Обращения', icon: Mail, color: '#6366f1' },
  { key: 'water', label: 'Вода', icon: Droplets, color: '#2b7bd6' },
  { key: 'air', label: 'Воздух (AQI)', icon: Gauge, color: '#16a34a' },
  { key: 'schools', label: 'Школы и больницы', icon: School, color: '#a855f7' },
  { key: 'cameras', label: 'Камеры', icon: Cctv, color: '#64748b' },
  { key: 'workers', label: 'Бригады', icon: HardHat, color: '#0d9488' },
  { key: 'other', label: 'Прочие события', icon: Sparkles, color: '#94a3b8' },
];

// Объектов фона много (около сотни школ и больниц) — по умолчанию их слой выключен,
// чтобы с первого взгляда были видны события.
const DEFAULT_OFF: LayerKey[] = ['schools'];

export default function OperatorMap({ layers, available, locate = false }: { layers: CityLayers; available?: LayerKey[]; locate?: boolean }) {
  const shownLayers = LAYERS.filter(l => !available || available.includes(l.key));
  const [off, setOff] = useState<Set<LayerKey>>(new Set(DEFAULT_OFF));
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<LayerPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  function findMe() {
    if (!navigator.geolocation) { setLocateError('Геолокация не поддерживается'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        setLocateError('');
        setMe({ id: 'me', title: 'Вы здесь', lat: pos.coords.latitude, lng: pos.coords.longitude, kind: 'resident', subtitle: `Точность ±${Math.round(pos.coords.accuracy)} м`, layer: 'reports', href: null });
        setSelected(null);
      },
      err => { setLocating(false); setLocateError(err.code === err.PERMISSION_DENIED ? 'Доступ к геолокации запрещён' : 'Не удалось определить позицию'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const counts = useMemo(() => {
    const c = new Map<LayerKey, number>();
    for (const p of [...layers.points, ...layers.overlays]) c.set(p.layer, (c.get(p.layer) ?? 0) + 1);
    return c;
  }, [layers]);

  const points = useMemo(() => [...layers.points.filter(p => !off.has(p.layer)), ...(me ? [me] : [])], [layers.points, off, me]);
  const overlays = useMemo(() => layers.overlays.filter(p => !off.has(p.layer)), [layers.overlays, off]);
  const zones = useMemo(() => layers.zones.filter(z => !off.has(z.layer)), [layers.zones, off]);
  const card = selected ? layers.details[selected] : null;

  function toggle(key: LayerKey) {
    setOff(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="ops-map">
      <div className="ops-layers" role="group" aria-label="Слои карты">
        {shownLayers.map(({ key, label, icon: Icon, color }) => (
          <button key={key} type="button" className={`ops-layer ${off.has(key) ? '' : 'on'}`} style={{ '--layer': color } as CSSProperties} aria-pressed={!off.has(key)} onClick={() => toggle(key)}>
            <span className="ops-layer-check" aria-hidden="true" />
            <Icon size={15} />
            {label}
            <b>{counts.get(key) ?? 0}</b>
          </button>
        ))}
        {locate && (
          <button type="button" className="ops-layer ops-locate" onClick={findMe} disabled={locating}>
            {locating ? <Loader2 size={15} className="spin" /> : <Crosshair size={15} />}
            {locating ? 'Определяем…' : 'Моё местоположение'}
          </button>
        )}
        {locateError && <span className="subtle" role="status">{locateError}</span>}
      </div>

      <div className="ops-stage">
        <MapView points={points} overlays={overlays} zones={zones} onSelect={setSelected} selectedId={selected ?? (me ? me.id : null)} typeLegend={false} autoFit={false} className="ops-canvas" />

        {card && (
          <aside className="ops-panel" aria-label="Карточка объекта">
            <button type="button" className="ops-panel-close" onClick={() => setSelected(null)} aria-label="Закрыть"><X size={18} /></button>
            <h3>{card.title}</h3>
            {card.subtitle && <p className="ops-panel-sub">{card.subtitle}</p>}
            <div className="ops-panel-badges">{card.badges.map(b => <span key={b.label} className={`badge tone-${b.tone}`}>{b.label}</span>)}</div>
            {card.image && <Image src={card.image} alt="Фото объекта" width={400} height={240} unoptimized className="ops-panel-img" />}
            {card.facts.length > 0 && <dl className="ops-panel-facts">{card.facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
            {card.text && <p className="ops-panel-text">{card.text}</p>}
            {card.list && (
              <div className="ops-panel-list">
                <strong>{card.list.title}</strong>
                <ul>{card.list.items.map(item => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {card.note && <p className="ops-panel-note">{card.note}</p>}
            {card.href && <Link href={card.href} className="button ops-panel-link">{card.hrefLabel ?? 'Открыть'} <ArrowUpRight size={15} /></Link>}
          </aside>
        )}
      </div>

      <div className="ops-legend">
        <span className="ops-legend-title">Важность</span>
        {Object.entries(severityColor).map(([k, v]) => <span key={k}><i style={{ background: v }} />{severityLabel[k as keyof typeof severityLabel]}</span>)}
        <span className="ops-legend-title">AQI</span>
        {aqiCategories.slice(0, 4).map(c => <span key={c.id}><i style={{ background: c.color }} />{c.label}</span>)}
        <span className="ops-legend-title">Зоны</span>
        <span><i className="zone-swatch water" />отключение воды</span>
        <span><i className="zone-swatch plume" />перенос загрязнения (оценка)</span>
      </div>
    </div>
  );
}
