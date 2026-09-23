import Link from 'next/link';
import { Plus } from 'lucide-react';
import IncidentCard from '@/components/incident-card';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function Reports() { const user = await requireUser('RESIDENT'); const incidents = await db.incident.findMany({ where:{reporterId:user.id},orderBy:{createdAt:'desc'} }); return <><div className="page-heading"><div><p className="eyebrow">ЖИТЕЛЬ</p><h1>Мои обращения</h1></div><Link href="/resident/report" className="button"><Plus size={16}/> Новое обращение</Link></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{incidents.map(i=><IncidentCard key={i.id} incident={i}/>)}</div>{incidents.length===0&&<div className="panel empty-state"><strong>Пока пусто</strong>Создайте первое обращение</div>}</>; }
