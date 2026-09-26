import Link from 'next/link';
import { Activity, ArrowUpRight, CheckCheck, Clock3, RadioTower, Users, Video, TriangleAlert } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sourceLabel, severityColor, severityLabel } from '@/lib/labels';
import type { Severity } from '@prisma/client';
import type { MapPoint } from '@/components/map';
import IncidentCard from '@/components/incident-card';
import LinkCamera from '@/components/operator-map';
export const dynamic = 'force-dynamic';
export default async function OperatorDashboard() {
  await requireUser('OPERATOR');
  const [incidents, workers, cameras, sensors, drones] = await Promise.all([
    db.incident.findMany({ orderBy: { createdAt:'desc' }, take:100 }),
    db.user.findMany({ where: { role:'WORKER' }, include: { tasks: { where: { status: { not:'COMPLETED' } } } } }),
    db.camera.findMany(), db.sensor.findMany(), db.drone.findMany(),
  ]);
  const active = incidents.filter(x => !['RESOLVED','REJECTED'].includes(x.status));
  const today = new Date(); today.setHours(0,0,0,0);
  const closedToday = await db.incident.count({ where: { status:'RESOLVED', updatedAt: { gte: today } } });
  const completed = await db.workerTask.findMany({ where: { acceptedAt: { not: null } }, select: { acceptedAt:true, assignedAt:true }, take:100 });
  const avg = completed.length ? Math.round(completed.reduce((sum,t) => sum + ((t.acceptedAt?.getTime() ?? t.assignedAt.getTime()) - t.assignedAt.getTime())/60000,0)/completed.length) : 0;
  const points: MapPoint[] = [...active.map(x => ({ id:x.id,title:x.title,lat:x.lat,lng:x.lng,severity:x.severity,type:x.type,kind:'incident' as const,subtitle:`${x.address} · ${sourceLabel[x.source]}${x.isDemo?' · DEMO':''}` })),...workers.filter(x => x.lat && x.lng).map(x => ({ id:x.id,title:x.name,lat:x.lat!,lng:x.lng!,kind:'worker' as const,subtitle:x.tasks.length ? 'На задании':'Свободен' })),...cameras.map(x => ({ id:x.id,title:x.name,lat:x.lat,lng:x.lng,kind:'camera' as const,subtitle:'Демо-камера' })),...sensors.map(x => ({ id:x.id,title:x.name,lat:x.lat,lng:x.lng,kind:'sensor' as const,subtitle:'Демо-датчик' })),...drones.map(x => ({ id:x.id,title:x.name,lat:x.lat,lng:x.lng,kind:'drone' as const,subtitle:'Демо-дрон' }))];
  const critical = active.filter(x => x.severity === 'CRITICAL');
  const kpis = [
    { title: 'Активные инциденты', value: active.length, note: 'В последних 100 событиях', icon: Activity, tone: 'brand' },
    { title: 'Критические', value: critical.length, note: 'Приоритет для оператора', icon: TriangleAlert, tone: 'danger' },
    { title: 'Закрыто сегодня', value: closedToday, note: 'Подтверждённый результат', icon: CheckCheck, tone: 'safe' },
    { title: 'Средняя реакция', value: completed.length ? `${avg} мин` : '—', note: 'Последние 100 принятых задач', icon: Clock3, tone: 'info' },
  ];
  return <div className="operations-page">
    <div className="page-heading"><div><p className="eyebrow">ОПЕРАТИВНЫЙ ЦЕНТР / АКТАУ</p><h1>Город в поле зрения<span className="heading-dot">.</span></h1><p className="subtle">События, инфраструктура и городские службы — в одном пространстве.</p></div><Link href="/operator/incidents" className="button secondary">Журнал событий <ArrowUpRight size={17}/></Link></div>
    <div className="operations-metrics">{kpis.map(k=><div className={`kpi metric-${k.tone}`} key={k.title}><div className="metric-top"><span>{k.title}</span><div className="metric-icon"><k.icon size={19}/></div></div><strong>{k.value}</strong><small>{k.note}</small></div>)}</div>
    {critical.length>0&&<div className="priority-strip"><span className="priority-icon"><TriangleAlert size={21}/></span><div><strong>Требуют вашего внимания · {critical.length}</strong><div className="priority-links">{critical.slice(0,2).map(i=><Link key={i.id} href={'/incidents/'+i.id}>{i.title} <ArrowUpRight size={14}/></Link>)}</div></div></div>}
    <div className="dashboard-grid operations-grid"><section className="panel operations-map"><div className="panel-header"><div><p className="eyebrow">ГОРОДСКАЯ СРЕДА</p><h2>Карта инцидентов</h2></div><span className="badge status-confirmed"><span className="live-dot"/>{active.length} активных событий</span></div><LinkCamera points={points}/><div className="map-legend">{Object.entries(severityColor).map(([k,v])=><span key={k}><b style={{background:v}}/>{severityLabel[k as Severity]}</span>)}<span><b style={{background:'#22b8a6'}}/>Работники</span><span><b style={{background:'#64748b'}}/>Служебные точки</span></div><div className="resource-strip"><div><Users size={18}/><span><strong>{workers.filter(x=>x.tasks.length===0).length} / {workers.length}</strong><small>Свободные работники</small></span></div><div><Video size={18}/><span><strong>{cameras.length}</strong><small>Камеры в системе</small></span></div><div><Activity size={18}/><span><strong>{active.filter(x=>x.status==='IN_PROGRESS').length}</strong><small>В работе</small></span></div><div><CheckCheck size={18}/><span><strong>{active.filter(x=>x.status==='ASSIGNED').length}</strong><small>Назначены</small></span></div></div></section>
    <section className="panel event-feed"><div className="panel-header"><div><p className="eyebrow">ЛЕНТА СОБЫТИЙ</p><h2>Последние поступления</h2></div><Link href="/operator/incidents" className="feed-all" aria-label="Все события"><ArrowUpRight size={20}/></Link></div><div className="incident-list">{incidents.slice(0,4).map(i=><IncidentCard key={i.id} incident={i}/>)}{incidents.length===0&&<div className="empty-state"><RadioTower size={30} className="mx-auto mb-2"/><strong>Событий пока нет</strong>Обращения жителей появятся автоматически</div>}</div><Link href="/operator/incidents" className="feed-footer">Открыть журнал событий <ArrowUpRight size={16}/></Link></section></div>
  </div>;
}
