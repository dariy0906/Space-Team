import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import ResidentMap from '@/components/resident-map';
import type { MapPoint } from '@/components/map';
import IncidentCard from '@/components/incident-card';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { typeIcon, typeLabel } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Resident({ searchParams }: { searchParams: Promise<{type?:string}> }) {
  const user = await requireUser('RESIDENT');
  const q = await searchParams;
  const incidents = await db.incident.findMany({ where: { status: { not:'REJECTED' } }, orderBy:{createdAt:'desc'},take:100 });
  const mine = incidents.filter(i=>i.reporterId===user.id);
  const shown = q.type && q.type in typeLabel ? incidents.filter(i=>i.type===q.type) : incidents;
  const points: MapPoint[] = shown.map(i=>({ id:i.id,title:i.title,lat:i.lat,lng:i.lng,severity:i.severity,type:i.type,kind:'incident',subtitle:i.address }));
  if(user.lat && user.lng) points.push({id:user.id,title:'Сохранённая позиция',lat:user.lat,lng:user.lng,kind:'resident'});
  return <><div className="page-heading"><div><p className="eyebrow">ГОРОД ДЛЯ ЖИТЕЛЕЙ</p><h1>Мой Актау</h1><p className="subtle">Инциденты рядом и ваши обращения</p></div><Link href="/resident/report" className="button"><Plus size={16}/> Сообщить о проблеме</Link></div><div className="filters"><Link href="/resident" className={`chip ${q.type?'':'on'}`}>Все<b>{incidents.length}</b></Link>{Object.entries(typeLabel).map(([k,v])=>{const count=incidents.filter(i=>i.type===k).length;return <Link key={k} href={`/resident?type=${k}`} className={`chip ${q.type===k?'on':''}`}>{typeIcon[k as keyof typeof typeIcon]} {v}<b>{count}</b></Link>;})}</div><div className="content-grid"><section className="panel">{shown.length===0&&<div className="filter-empty">По категории «{q.type&&q.type in typeLabel?typeLabel[q.type as keyof typeof typeLabel]:''}» событий пока нет — на карте показана только ваша позиция.</div>}<ResidentMap points={points}/></section><section className="panel"><div className="panel-header"><div><h2>Мои обращения</h2><span>Следите за ходом решения</span></div><Link href="/resident/reports" className="text-link">Все <ArrowRight size={15}/></Link></div><div className="incident-list">{mine.slice(0,5).map(i=><IncidentCard key={i.id} incident={i}/>)}{mine.length===0&&<div className="empty-state"><strong>Обращений пока нет</strong>Если заметите проблему, сообщите городской службе</div>}</div></section></div></>;
}
