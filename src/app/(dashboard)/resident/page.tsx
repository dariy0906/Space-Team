import Link from 'next/link';
import type { IncidentType } from '@prisma/client';
import { ArrowRight, Plus } from 'lucide-react';
import ResidentMap from '@/components/resident-map';
import ReportCard from '@/components/report-card';
import type { MapPoint } from '@/components/map';
import { TypeGlyph } from '@/components/icons';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicIncidentTypes, statusLabel, typeLabel } from '@/lib/labels';
export const dynamic = 'force-dynamic';

const isPublicType = (value: string | undefined): value is (typeof publicIncidentTypes)[number] => !!value && (publicIncidentTypes as readonly string[]).includes(value);

export default async function Resident({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const u = await requireUser('RESIDENT');
  const { type } = await searchParams;
  const filter = isPublicType(type) ? type : undefined;
  const [reports, warnings, city] = await Promise.all([
    db.incident.findMany({ where: { reporterId: u.id }, include: { media: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    db.publicWarning.findMany({ where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
    // Открытые городские проблемы публичных категорий. Чужие обращения жителей не показываются.
    db.incident.findMany({ where: { type: { in: [...publicIncidentTypes] }, source: { not: 'RESIDENT' }, status: { notIn: ['REJECTED', 'RESOLVED'] } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const counts = new Map<IncidentType, number>();
  for (const i of city) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  const shownCity = filter ? city.filter(i => i.type === filter) : city;
  const points: MapPoint[] = [
    ...warnings.map(w => ({ id: w.id, title: w.title, lat: w.lat, lng: w.lng, kind: 'resident' as const, severity: w.severity, subtitle: w.description, href: null })),
    // Карточка чужого события жителю недоступна, поэтому точка без ссылки — только статус.
    ...shownCity.map(i => ({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, kind: 'incident' as const, type: i.type, severity: i.severity, subtitle: `${i.address} · ${statusLabel[i.status]}`, href: null })),
    ...reports.map(i => ({ id: i.id, title: `Моё обращение: ${i.title}`, lat: i.lat, lng: i.lng, kind: 'incident' as const, type: i.type, severity: i.severity, subtitle: `${i.address} · ${statusLabel[i.status]}` })),
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">ГОРОД ДЛЯ ЖИТЕЛЕЙ</p><h1>Мой Актау</h1><p className="subtle">Городские предупреждения, проблемы рядом и ваши обращения</p></div><Link href="/resident/report" className="button"><Plus size={16}/> Сообщить о проблеме</Link></div>
    {warnings.map(w => <div className="warning-banner" key={w.id}><strong>{w.title} {w.isDemo && <small>· DEMO</small>}</strong><p>{w.description}</p></div>)}
    <div className="filters">
      <Link href="/resident" className={`chip ${filter ? '' : 'on'}`}>Все<b>{city.length}</b></Link>
      {publicIncidentTypes.filter(t => counts.get(t)).map(t => <Link key={t} href={`/resident?type=${t}`} className={`chip ${filter === t ? 'on' : ''}`}><TypeGlyph type={t} size={15}/> {typeLabel[t]}<b>{counts.get(t)}</b></Link>)}
    </div>
    <div className="content-grid">
      <section className="panel">{filter && shownCity.length === 0 && <div className="filter-empty">Открытых проблем категории «{typeLabel[filter]}» сейчас нет.</div>}<ResidentMap points={points}/></section>
      <section className="panel"><div className="panel-header"><div><h2>Мои обращения</h2><span>Следите за ходом решения</span></div><Link href="/resident/reports" className="text-link">Все <ArrowRight size={15}/></Link></div><div className="incident-list">{reports.map(i => <ReportCard key={i.id} incident={i}/>)}{!reports.length && <div className="empty-state"><strong>Обращений пока нет</strong>Если заметите проблему, сообщите городской службе</div>}</div></section>
    </div>
  </>;
}
