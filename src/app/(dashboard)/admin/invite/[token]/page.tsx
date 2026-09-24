import Image from 'next/image';
import Link from 'next/link';
import QRCode from 'qrcode';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {cameraState,tokenHash} from '@/lib/cameras';
import {stopCameraAction} from '@/app/camera-actions';
import SubmitButton from '@/components/submit-button';

const stateLabels: Record<string,string> = {INVITED:'INVITED · ожидает согласия',CONNECTING:'CONNECTING',LIVE:'LIVE · камера активна',DISCONNECTED:'DISCONNECTED · нет сигнала',EXPIRED:'EXPIRED · ссылка истекла',STOPPED:'STOPPED · остановлена'};

export default async function InvitePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{delivery?:string}>}){
  const admin=await requireUser('ADMIN');
  const {token}=await params;
  const {delivery}=await searchParams;
  if(!/^[a-f0-9]{64}$/.test(token)) notFound();
  const session=await db.cameraSession.findFirst({where:{tokenHash:tokenHash(token),invitedBy:admin.id},include:{camera:true,permission:true}});
  if(!session) notFound();
  const state=cameraState(session);
  const url=(process.env.APP_PUBLIC_URL||'http://localhost:3000')+'/camera/'+token;
  const qr=state==='EXPIRED'||state==='STOPPED'?null:await QRCode.toDataURL(url,{width:260,margin:2});
  return <><div className="page-heading"><div><p className="eyebrow">ПРИГЛАШЕНИЕ КАМЕРЫ</p><h1>{session.camera.name}</h1><p className="subtle">Ссылка действует 30 минут. Подключение произойдёт только после явного согласия владельца телефона.</p></div><Link href="/admin/cameras" className="button secondary">К списку камер</Link></div>
  <div className="content-grid">
    <section className="panel panel-body">
      <div className="flex justify-between items-center mb-3"><h2 className="font-bold">Сканируйте QR на телефоне</h2><span className={`badge ${state==='LIVE'?'status-confirmed':'status-new'}`}>{stateLabels[state]}</span></div>
      {qr?<Image src={qr} alt="QR подключения камеры" width={260} height={260} unoptimized/>:<div className="empty-photo">Приглашение недоступно: {stateLabels[state]}</div>}
      <p className="mt-3"><a className="text-link break-all" href={url}>{url}</a></p>
      <p className="subtle mt-2">{delivery==='demo-inbox'?'SMTP не настроен: DEMO EMAIL доставлен в уведомления жителя.':delivery==='smtp'?'Приглашение отправлено по email.':'Держите ссылку в секрете: она управляет камерой.'}</p>
      <p className="subtle">Для телефона нужен доступный HTTPS-адрес в APP_PUBLIC_URL. localhost работает только на этом компьютере.</p>
    </section>
    <section className="panel panel-body">
      <h2 className="font-bold mb-3">Управление сессией</h2>
      <div className="detail-facts"><div><span>Состояние</span>{stateLabels[state]}</div><div><span>Камера</span>{session.camera.name}</div><div><span>Владелец</span>{session.acceptedBy?'подтвердил':'ещё не подтвердил'}</div><div><span>Действует до</span>{session.expiresAt.toLocaleString('ru-RU')}</div><div><span>Последний сигнал</span>{session.lastSeenAt?session.lastSeenAt.toLocaleString('ru-RU'):'—'}</div></div>
      {['INVITED','LIVE','DISCONNECTED'].includes(state)&&<form action={stopCameraAction} className="mt-4"><input type="hidden" name="id" value={session.id}/><SubmitButton className="button danger">STOP CAMERA · Остановить сессию</SubmitButton></form>}
    </section>
  </div></>;
}
