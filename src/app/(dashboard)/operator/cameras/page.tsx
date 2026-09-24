import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import CameraViewer from '@/components/camera-viewer';
export default async function Cameras(){await requireUser('OPERATOR');const sessions=await db.cameraSession.findMany({where:{status:'ACTIVE',expiresAt:{gt:new Date()},camera:{status:{not:'DISABLED'}}},include:{camera:true}});return <><div className="page-heading"><div><p className="eyebrow">LIVE · WEBRTC</p><h1>Добровольно подключённые камеры</h1><p className="subtle">Оператор может смотреть активный поток. Включить чужую камеру удалённо нельзя.</p></div></div><div className="grid lg:grid-cols-2 gap-4">{sessions.map(s=><section className="panel panel-body" key={s.id}><h2 className="font-bold mb-3">{s.camera.name}</h2><CameraViewer sessionId={s.id}/></section>)}</div>{!sessions.length&&<section className="panel empty-state">Нет активных камер. Администратор может отправить приглашение владельцу телефона.</section>}</>;}

