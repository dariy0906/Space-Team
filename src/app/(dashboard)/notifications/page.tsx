import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {readNotificationsAction} from '@/app/actions';
export default async function Notifications(){const u=await requireUser();const items=await db.notification.findMany({where:{userId:u.id},orderBy:{createdAt:'desc'},take:100});return <><div className="page-heading"><div><p className="eyebrow">ОБНОВЛЕНИЯ</p><h1>Уведомления</h1></div><form action={readNotificationsAction}><button className="button secondary">Прочитать все</button></form></div><section className="panel"><div className="incident-list">{items.map(n=><Link href={n.href} className="incident-card" key={n.id}><strong className="flex items-center gap-2">{!n.readAt&&<i className="badge-dot text-cyan-600" aria-label="Не прочитано"/>}{n.title}</strong><p>{n.createdAt.toLocaleString('ru-RU')}</p></Link>)}{!items.length&&<div className="empty-state">Уведомлений пока нет</div>}</div></section></>;}

