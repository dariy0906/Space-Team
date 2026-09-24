'use client';
import Image from 'next/image';
import {useActionState} from 'react';
import {inviteCameraAction,type InviteState} from '@/app/camera-actions';
import SubmitButton from '@/components/submit-button';
export default function InviteCameraForm({cameraId}:{cameraId:string}){
 const [state,action]=useActionState<InviteState,FormData>(inviteCameraAction,null);
 return <form action={action} className="grid gap-3 mt-3">
  <input type="hidden" name="cameraId" value={cameraId}/>
  <label className="field">Email жителя (или оставьте пустым для QR)<input name="email" type="email"/></label>
  <SubmitButton>Подключить demo camera</SubmitButton>
  {state?.error&&<p className="error-banner" role="alert">{state.error}</p>}
  {state?.url&&state.qr&&<div className="invite-result">
   <Image src={state.qr} alt="QR подключения камеры" width={240} height={240} unoptimized/>
   <a className="text-link break-all" href={state.url}>{state.url}</a>
   <p className="subtle">{state.delivery==='demo-inbox'?'SMTP не настроен: DEMO EMAIL доставлен в уведомления жителя.':state.delivery==='smtp'?'Приглашение отправлено по email.':'Держите ссылку в секрете: она управляет камерой.'}</p>
  </div>}
 </form>;
}
