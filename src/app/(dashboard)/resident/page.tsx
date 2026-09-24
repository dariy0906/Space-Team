import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import OperatorMap from '@/components/operator-map';
import ReportCard from '@/components/report-card';
import { requireUser } from '@/lib/auth';
import { buildCityLayers } from '@/lib/city-layers';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';

export default async function Resident() {
  const u = await requireUser('RESIDENT');
  const [reports, warnings, layers] = await Promise.all([
    db.incident.findMany({ where: { reporterId: u.id }, include: { media: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    db.publicWarning.findMany({ where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
    // Житель видит публичные городские проблемы и свои обращения; чужие обращения — нет.
    buildCityLayers('resident', u.id),
  ]);
  return <>
    <div className="page-heading"><div><p className="eyebrow">ГОРОД ДЛЯ ЖИТЕЛЕЙ</p><h1>Мой Актау</h1><p className="subtle">Вода, воздух, дороги и ваши обращения на одной карте</p></div><Link href="/resident/report" className="button"><Plus size={16}/> Сообщить о проблеме</Link></div>
    {warnings.map(w => <div className="warning-banner" key={w.id}><strong>{w.title} {w.isDemo && <small>· DEMO</small>}</strong><p>{w.description}</p></div>)}
    <div className="content-grid">
      <section className="panel"><OperatorMap layers={layers} available={['critical', 'road', 'reports', 'water', 'air', 'schools', 'other']} locate/></section>
      <section className="panel"><div className="panel-header"><div><h2>Мои обращения</h2><span>Следите за ходом решения</span></div><Link href="/resident/reports" className="text-link">Все <ArrowRight size={15}/></Link></div><div className="incident-list">{reports.map(i => <ReportCard key={i.id} incident={i}/>)}{!reports.length && <div className="empty-state"><strong>Обращений пока нет</strong>Если заметите проблему, сообщите городской службе</div>}</div></section>
    </div>
  </>;
}
