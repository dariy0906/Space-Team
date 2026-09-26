import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {cameraState} from '@/lib/cameras';
import {createCameraAction,stopCameraAction,toggleCameraAction} from '@/app/camera-actions';
import SubmitButton from '@/components/submit-button';
import InviteCameraForm from '@/components/invite-camera-form';

const stateLabels: Record<string,string> = {INVITED:'INVITED',CONNECTING:'CONNECTING',LIVE:'LIVE',DISCONNECTED:'DISCONNECTED',EXPIRED:'EXPIRED',STOPPED:'STOPPED'};

export default async function Cameras({searchParams}:{searchParams:Promise<{error?:string}>}){
  await requireUser('ADMIN');
  const q=await searchParams;
  const cameras=await db.camera.findMany({include:{sessions:{where:{status:{not:'STOPPED'},expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}}}});
  return <>
    <div className="page-heading"><div><p className="eyebrow">ДОБРОВОЛЬНЫЕ СЕССИИ</p><h1>Демо-камеры</h1><p className="subtle">Телефон подключается только после согласия владельца. Ссылка действует 30 минут.</p></div></div>
    {q.error&&<div className="error-banner">Не удалось отправить приглашение. Проверьте email жителя и SMTP.</div>}
    <div className="grid lg:grid-cols-2 gap-4">
      {cameras.map(c=><section className="panel panel-body" key={c.id}>
        <div className="flex justify-between"><h2 className="font-bold">{c.name}</h2><span className="badge">{c.status} · DEMO</span></div>
        <p className="subtle">{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</p>
        {c.roboflowCameraId&&<p className="subtle">Roboflow source: {c.roboflowCameraId}</p>}
        {c.status!=='DISABLED'&&<InviteCameraForm cameraId={c.id}/>}
        <form action={toggleCameraAction} className="mt-3"><input type="hidden" name="id" value={c.id}/><SubmitButton className="button secondary">{c.status==='DISABLED'?'Включить источник':'Отключить источник'}</SubmitButton></form>
        {c.sessions.map(s=><div key={s.id} className="flex justify-between items-center gap-2 mt-3"><span className="subtle">{stateLabels[cameraState(s)]} · до {s.expiresAt.toLocaleTimeString('ru-RU')}</span><form action={stopCameraAction}><input type="hidden" name="id" value={s.id}/><SubmitButton className="button danger">Завершить сессию</SubmitButton></form></div>)}
        {!c.sessions.length&&<p className="subtle mt-3">Активных сессий нет.</p>}
      </section>)}
    </div>
    <section className="panel panel-body mt-4"><h2 className="font-bold">Добавить камеру</h2><form action={createCameraAction} className="form-grid mt-3"><label className="field">Название<input name="name" required minLength={2}/></label><label className="field">Roboflow source ID <input name="roboflowCameraId" maxLength={200} placeholder="например, Gbk9KLXAMdLR5ZyGl9cn"/></label><label className="field">Широта<input name="lat" type="number" step="any" defaultValue="43.653" required/></label><label className="field">Долгота<input name="lng" type="number" step="any" defaultValue="51.174" required/></label><SubmitButton>Создать</SubmitButton></form></section>
  </>;
}
