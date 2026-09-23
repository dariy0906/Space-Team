'use client';
import { useMemo, useState } from 'react';
import { Droplets, Gauge, TriangleAlert, Waves } from 'lucide-react';
import { Glyph } from './icons';
import MapView from './map-view';
import type { MapPoint } from './map';
import { PIPE_NETWORK, pipeConditionColor, pipeConditionLabel, pipeKindLabel, type PipeCondition, type PipeKind } from '@/lib/pipe-network';

const conditions = Object.keys(pipeConditionLabel) as PipeCondition[];
const kinds = Object.keys(pipeKindLabel) as PipeKind[];

/** Приблизительная длина сегмента: ломаная по точкам, формула гаверсинуса. */
function lengthKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371 * 2 * Math.asin(Math.sqrt(a));
  }
  return total;
}

const lengths = new Map(PIPE_NETWORK.map(pipe => [pipe.id, lengthKm(pipe.coords)]));

export default function PipeNetworkView({ points }: { points: MapPoint[] }) {
  const [activeConditions, setActiveConditions] = useState<PipeCondition[]>(conditions);
  const [activeKinds, setActiveKinds] = useState<PipeKind[]>(kinds);
  const [showIncidents, setShowIncidents] = useState(true);

  const segments = useMemo(
    () => PIPE_NETWORK.filter(pipe => activeConditions.includes(pipe.condition) && activeKinds.includes(pipe.type)),
    [activeConditions, activeKinds],
  );

  const stats = useMemo(() => {
    const km = segments.reduce((sum, pipe) => sum + (lengths.get(pipe.id) ?? 0), 0);
    const byCondition = conditions.map(condition => {
      const list = segments.filter(pipe => pipe.condition === condition);
      return { condition, count: list.length, km: list.reduce((sum, pipe) => sum + (lengths.get(pipe.id) ?? 0), 0) };
    });
    const years = segments.map(pipe => pipe.yearBuilt);
    return {
      km,
      byCondition,
      oldest: years.length > 0 ? Math.min(...years) : 0,
      avgAge: years.length > 0 ? Math.round(years.reduce((sum, year) => sum + (new Date().getFullYear() - year), 0) / years.length) : 0,
    };
  }, [segments]);

  const risky = useMemo(
    () => segments.filter(pipe => pipe.condition === 'critical').sort((a, b) => a.yearBuilt - b.yearBuilt).slice(0, 8),
    [segments],
  );

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  }

  const kpis = [
    { icon: Waves, label: 'Участков в выборке', value: segments.length, note: `из ${PIPE_NETWORK.length} всего` },
    { icon: Gauge, label: 'Протяжённость', value: `${stats.km.toFixed(1)} км`, note: 'по выбранным фильтрам' },
    { icon: TriangleAlert, label: 'Аварийных', value: stats.byCondition.find(item => item.condition === 'critical')?.count ?? 0, note: `${(stats.byCondition.find(item => item.condition === 'critical')?.km ?? 0).toFixed(1)} км сети` },
    { icon: Droplets, label: 'Средний возраст', value: `${stats.avgAge} лет`, note: stats.oldest ? `самый старый участок — ${stats.oldest} г.` : '—' },
  ];

  return (
    <>
      <div className="kpi-grid pipe-kpi">
        {kpis.map(item => (
          <div className="kpi" key={item.label}>
            <span><item.icon size={13} /> {item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Схема водопровода Актау</h2>
              <span>Нажмите на линию, чтобы увидеть диаметр, материал и год прокладки</span>
            </div>
            <label className="switch">
              <input type="checkbox" checked={showIncidents} onChange={event => setShowIncidents(event.target.checked)} />
              <span>Инциденты на сети</span>
            </label>
          </div>
          <div className="panel-body pipe-filters">
            <div className="filter-row">
              <span className="filter-title">Состояние</span>
              {conditions.map(condition => (
                <button
                  key={condition}
                  type="button"
                  className={`chip ${activeConditions.includes(condition) ? 'on' : ''}`}
                  style={activeConditions.includes(condition) ? { borderColor: pipeConditionColor[condition], color: pipeConditionColor[condition] } : undefined}
                  onClick={() => toggle(activeConditions, condition, setActiveConditions)}
                >
                  <i style={{ background: pipeConditionColor[condition] }} />
                  {pipeConditionLabel[condition]}
                  <b>{PIPE_NETWORK.filter(pipe => pipe.condition === condition).length}</b>
                </button>
              ))}
            </div>
            <div className="filter-row">
              <span className="filter-title">Тип линии</span>
              {kinds.map(kind => (
                <button key={kind} type="button" className={`chip ${activeKinds.includes(kind) ? 'on' : ''}`} onClick={() => toggle(activeKinds, kind, setActiveKinds)}>
                  {pipeKindLabel[kind]}
                  <b>{PIPE_NETWORK.filter(pipe => pipe.type === kind).length}</b>
                </button>
              ))}
            </div>
          </div>
          <MapView points={showIncidents ? points : []} pipes={segments} defaultPipes lockPipes autoFit={false} className="pipe-map" />
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Износ сети</h2>
              <span>Распределение по состоянию</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="condition-bars">
              {stats.byCondition.map(item => {
                const share = stats.km > 0 ? (item.km / stats.km) * 100 : 0;
                return (
                  <div className="condition-bar" key={item.condition}>
                    <div className="condition-bar-top">
                      <span><i style={{ background: pipeConditionColor[item.condition] }} />{pipeConditionLabel[item.condition]}</span>
                      <b>{item.km.toFixed(1)} км</b>
                    </div>
                    <div className="condition-bar-track">
                      <div style={{ width: `${share}%`, background: pipeConditionColor[item.condition] }} />
                    </div>
                    <small>{item.count} участков · {share.toFixed(0)} % сети</small>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel-header"><div><h2>Приоритет замены</h2><span>Самые старые аварийные участки</span></div></div>
          <div className="incident-list">
            {risky.map(pipe => (
              <article className="incident-card" key={pipe.id}>
                <div className="incident-card-top">
                  <span className="incident-icon icon-critical"><Glyph name="droplets" size={17} animate/></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <strong className="truncate">{pipe.name || pipe.id}</strong>
                      <span className="badge severity-critical"><i className="badge-dot"/>{pipeConditionLabel[pipe.condition]}</span>
                    </div>
                    <p>{pipeKindLabel[pipe.type]} · ⌀{pipe.diameter} мм · {pipe.material}</p>
                  </div>
                </div>
                <div className="incident-meta">
                  <span>Проложен в {pipe.yearBuilt} г.</span>
                  <span>{(lengths.get(pipe.id) ?? 0).toFixed(2)} км</span>
                </div>
              </article>
            ))}
            {risky.length === 0 && <div className="empty-state"><strong>Аварийных участков нет</strong>В текущей выборке фильтров</div>}
          </div>
        </section>
      </div>
    </>
  );
}
