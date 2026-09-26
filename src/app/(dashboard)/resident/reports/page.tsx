import Link from 'next/link';
import { Plus } from 'lucide-react';
import ReportCard from '@/components/report-card';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {CAMERA_FRAME_STAGE} from '@/lib/road';
export default async function Reports(){const u=await requireUser('RESIDENT');const reports=await db.incident.findMany({where:{reporterId:u.id},include:{media:{where:{stage:{not:CAMERA_FRAME_STAGE}}}},orderBy:{createdAt:'desc'}});return <><div className="page-heading"><div><p className="eyebrow">ЖИТЕЛЬ</p><h1>Мои обращения</h1><p className="subtle">Статус каждого обращения обновляется автоматически</p></div><Link href="/resident/report" className="button"><Plus size={16}/> Новое обращение</Link></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{reports.map(i=><ReportCard key={i.id} incident={i}/>)}</div>{!reports.length&&<div className="panel empty-state">Обращений пока нет</div>}</>;}

