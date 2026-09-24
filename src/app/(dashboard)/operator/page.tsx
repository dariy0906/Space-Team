import Link from 'next/link';
import { ArrowUpRight, RadioTower } from 'lucide-react';
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
  const kpis = [['Активные инциденты',active.length,'За всё время'],['Критические',active.filter(x=>x.severity==='CRITICAL').length,'Требуют внимания'],['Назначены',active.filter(x=>x.status==='ASSIGNED').length,'В плане служб'],['В работе',active.filter(x=>x.status==='IN_PROGRESS').length,'Исполняются'],['Закрыто сегодня',closedToday,'Решённые'],['Свободные работники',workers.filter(x=>x.tasks.length===0).length,'Доступны'],['Средняя реакция',`${avg} мин`,'Принятие задачи']];
  return <><div className="page-heading"><div><p className="eyebrow">ПАНЕЛЬ ОПЕРАТОРА</p><h1>Обзор городской среды</h1><p className="subtle">Мониторинг происшествий и городских служб · Актау</p></div><span className="badge status-confirmed"><span className="live-dot"/> Мониторинг активен</span></div><div className="kpi-grid">{kpis.map(([title,value,note])=><div className="kpi" key={title}><span>{title}</span><strong>{value}</strong><small>{note}</small></div>)}</div>{active.some(i=>i.severity==='CRITICAL')&&<div className="critical-banner"><strong>Требуют решения оператора</strong><div className="flex flex-wrap gap-3 mt-2">{active.filter(i=>i.severity==='CRITICAL').slice(0,4).map(i=><Link key={i.id} href={'/incidents/'+i.id}>{i.title} →</Link>)}</div></div>}<div className="dashboard-grid"><section className="panel"><div className="panel-header"><h2>Карта инцидентов</h2><span>{active.length} активных событий</span></div><LinkCamera points={points}/><div className="map-legend">{Object.entries(severityColor).map(([k,v])=><span key={k}><b style={{background:v}}/>{severityLabel[k as Severity]}</span>)}<span><b style={{background:'#22b8a6'}}/>Работники</span><span><b style={{background:'#64748b'}}/>Служебные точки</span></div></section><section className="panel"><div className="panel-header"><div><h2>Последние события</h2><span>Актуальная городская сводка</span></div><Link href="/operator/incidents" className="text-link">Все <ArrowUpRight size={15}/></Link></div><div className="incident-list">{incidents.slice(0,5).map(i=><IncidentCard key={i.id} incident={i}/>)}{incidents.length===0&&<div className="empty-state"><RadioTower size={30} className="mx-auto mb-2"/><strong>Событий пока нет</strong>Обращения жителей появятся автоматически</div>}</div></section></div></>;
}
