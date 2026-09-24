import Link from 'next/link';
import ResidentMap from '@/components/resident-map';
import ReportCard from '@/components/report-card';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
export const dynamic='force-dynamic';
export default async function Resident(){
 const u=await requireUser('RESIDENT');const [reports,warnings]=await Promise.all([db.incident.findMany({where:{reporterId:u.id},include:{media:true},orderBy:{createdAt:'desc'},take:5}),db.publicWarning.findMany({where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}})]);
 return <><div className="page-heading"><div><p className="eyebrow">ГОРОД ДЛЯ ЖИТЕЛЕЙ</p><h1>Мой Актау</h1><p className="subtle">Городские предупреждения и ваши обращения</p></div><Link href="/resident/report" className="button">＋ Сообщить о проблеме</Link></div>{warnings.map(w=><div className="warning-banner" key={w.id}><strong>{w.title} {w.isDemo&&<small>· DEMO</small>}</strong><p>{w.description}</p></div>)}<div className="content-grid"><section className="panel"><ResidentMap points={warnings.map(w=>({id:w.id,title:w.title,lat:w.lat,lng:w.lng,kind:'resident',subtitle:w.description}))}/></section><section className="panel"><div className="panel-header"><h2>Мои обращения</h2><Link href="/resident/reports" className="text-link">Все →</Link></div><div className="incident-list">{reports.map(i=><ReportCard key={i.id} incident={i}/>)}{!reports.length&&<div className="empty-state">Ваши обращения появятся здесь</div>}</div></section></div></>;
}

