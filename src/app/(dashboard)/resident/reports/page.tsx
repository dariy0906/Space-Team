import Link from 'next/link';
import ReportCard from '@/components/report-card';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
export default async function Reports(){const u=await requireUser('RESIDENT');const reports=await db.incident.findMany({where:{reporterId:u.id},include:{media:true},orderBy:{createdAt:'desc'}});return <><div className="page-heading"><h1>Мои обращения</h1><Link href="/resident/report" className="button">＋ Новое обращение</Link></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{reports.map(i=><ReportCard key={i.id} incident={i}/>)}</div>{!reports.length&&<div className="panel empty-state">Обращений пока нет</div>}</>;}

