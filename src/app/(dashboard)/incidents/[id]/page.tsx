import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addCommentAction, assignWorkerAction, updateIncidentAction, updateTaskAction } from '@/app/actions';
import MapView from '@/components/map-view';
import ConfirmButton from '@/components/confirm-button';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sourceLabel, taskLabel, typeIcon, typeLabel } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function IncidentDetail({ params,searchParams }: { params: Promise<{id:string}>; searchParams:Promise<{toast?:string}> }) {
  const user = await requireUser(); const { id } = await params; const { toast } = await searchParams;
  const incident = await db.incident.findUnique({ where:{id},include:{media:true,history:{include:{actor:{select:{name:true,role:true}}},orderBy:{createdAt:'desc'}},assignedWorker:true,task:true,reporter:true} });
  if (!incident || (user.role==='RESIDENT' && incident.reporterId!==user.id && incident.source==='RESIDENT') || (user.role==='WORKER' && incident.assignedWorkerId!==user.id)) notFound();
  const workers = user.role==='OPERATOR' ? await db.user.findMany({ where:{role:'WORKER'},orderBy:{name:'asc'} }) : [];
  const nextTask = incident.task?.status==='ASSIGNED'?'ACCEPTED':incident.task?.status==='ACCEPTED'?'ON_THE_WAY':incident.task?.status==='ON_THE_WAY'?'ON_SITE':incident.task?.status==='ON_SITE'?'COMPLETED':null;
  const actionLabel = { ACCEPTED:'Принять',ON_THE_WAY:'Выехал',ON_SITE:'На месте',COMPLETED:'Завершить' } as const;
  return <>
    {toast&&<div className="toast">Изменения сохранены</div>}
    <div className="page-heading"><div><p className="eyebrow">ИНЦИДЕНТ · {incident.id.slice(0,8).toUpperCase()}</p><h1>{incident.title}</h1><p className="subtle">{incident.address} · {incident.createdAt.toLocaleString('ru-RU')}</p></div><StatusBadge status={incident.status}/></div>
    <div className="content-grid"><div className="space-y-4">
      <section className="panel"><div className="detail-hero"><span className="incident-icon text-xl">{typeIcon[incident.type]}</span><div className="flex-1"><div className="flex flex-wrap gap-2 mb-2"><SeverityBadge severity={incident.severity}/>{incident.isDemo&&<span className="badge status-new">DEMO / MOCK</span>}</div><p className="text-sm">{incident.description||'Описание не указано'}</p></div></div><div className="panel-body border-t" style={{borderColor:'var(--line)'}}><div className="detail-facts"><div><span>Категория</span>{typeLabel[incident.type]}</div><div><span>Источник</span>{sourceLabel[incident.source]}</div><div><span>Достоверность</span>{incident.confidence===null?'—':`${incident.confidence}%`}</div><div><span>Исполнитель</span>{incident.assignedWorker?.name||'Не назначен'}</div><div><span>Координаты</span>{incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}</div><div><span>Микрорайон</span>{incident.district||'—'}</div></div>{incident.media.map(m=><div key={m.id}>{m.type==='IMAGE'?<Image src={m.url} alt="Фото события" width={800} height={500} unoptimized className="media-preview"/>:<a href={m.url} className="text-link">Видео события</a>}</div>)}</div></section>
      <section className="panel"><div className="panel-header"><h2>Расположение</h2></div><MapView points={[{id:incident.id,title:incident.title,lat:incident.lat,lng:incident.lng,kind:'incident',type:incident.type,severity:incident.severity,subtitle:incident.address}]}/></section>
      <section className="panel"><div className="panel-header"><h2>История и комментарии</h2></div><div className="panel-body"><div className="timeline">{incident.history.map(h=><div className="timeline-item" key={h.id}><strong>{h.action}</strong><time>{h.createdAt.toLocaleString('ru-RU')} · {h.actor?.name||'Система'}</time>{h.comment&&<p>{h.comment}</p>}</div>)}</div><form action={addCommentAction} className="mt-6 grid gap-2"><input type="hidden" name="id" value={id}/><label className="field">Комментарий службы или участника<textarea name="comment" required maxLength={1000} placeholder="Добавить комментарий"/></label><button className="button justify-self-start">Отправить комментарий</button></form></div></section>
    </div><div className="space-y-4">
      <section className="panel"><div className="panel-header"><h2>Действия</h2></div><div className="panel-body">
        {user.role==='OPERATOR'&&<>{incident.status==='NEW'&&<div className="actions-row"><form action={updateIncidentAction}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value="CONFIRMED"/><button className="button">Подтвердить</button></form><form action={updateIncidentAction}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value="REJECTED"/><ConfirmButton message="Отклонить это событие?">Отклонить</ConfirmButton></form></div>}{['NEW','CONFIRMED'].includes(incident.status)&&<form action={assignWorkerAction} className="grid gap-3 mt-4"><input type="hidden" name="id" value={id}/><label className="field">Назначить работника<select name="workerId" required><option value="">Выберите работника</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><button className="button">Назначить</button></form>}</>}
        {user.role==='WORKER'&&incident.task&&<><p className="subtle">Статус задачи: {taskLabel[incident.task.status]}</p>{nextTask&&<form action={updateTaskAction} className="grid gap-3 mt-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value={nextTask}/>{nextTask==='COMPLETED'&&<><label className="field">Результат работы<textarea name="comment" required placeholder="Что сделано?"/></label><label className="field">Фото результата<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/></label></>}{nextTask==='COMPLETED'?<ConfirmButton className="button" message="Завершить задачу и закрыть инцидент?">Завершить</ConfirmButton>:<button className="button">{actionLabel[nextTask]}</button>}</form>}<Link href={`/worker/route/${id}`} className="button secondary mt-3">Открыть маршрут</Link></>}
        {user.role==='RESIDENT'&&<p className="subtle">Статус обращения и ответ службы видны в истории.</p>}
      </div></section>
      <section className="panel"><div className="panel-header"><h2>Параметры</h2></div><div className="panel-body detail-facts"><div><span>Создано</span>{incident.createdAt.toLocaleString('ru-RU')}</div><div><span>Изменено</span>{incident.updatedAt.toLocaleString('ru-RU')}</div><div><span>Автор</span>{incident.reporter?.name||'Демо-источник'}</div><div><span>Задача</span>{incident.task?taskLabel[incident.task.status]:'Нет'}</div></div></section>
    </div></div>
  </>;
}
