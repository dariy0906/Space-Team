'use server';
import {randomBytes} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import QRCode from 'qrcode';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {tokenHash,stopCameraSession} from '@/lib/cameras';
import {CameraEmailProvider} from '@/lib/email';
import {location} from '@/lib/validation';
export async function createCameraAction(data:FormData){
 const u=await requireUser('ADMIN');const name=z.string().trim().min(2).max(100).parse(data.get('name'));
 const pos=location.parse({lat:data.get('lat'),lng:data.get('lng')});
 await db.$transaction(async tx=>{const c=await tx.camera.create({data:{name,...pos,status:'OFFLINE'}});await tx.auditLog.create({data:{actorId:u.id,action:'CAMERA_CREATED',entityId:c.id}});await tx.realtimeEvent.createMany({data:[{role:'ADMIN'},{role:'OPERATOR'}]});});
 revalidatePath('/','layout');redirect('/admin/cameras');
}
export type InviteState={token?:string;url?:string;qr?:string;delivery?:string;error?:string}|null;
// Возвращает результат вместо redirect(): redirect из server action на этом окружении
// периодически не выполнялся клиентом, из-за чего QR не показывался. Инлайн-результат надёжнее.
export async function inviteCameraAction(_prev:InviteState,data:FormData):Promise<InviteState>{
 const u=await requireUser('ADMIN');
 const cameraId=z.string().uuid().parse(data.get('cameraId'));
 const c=await db.camera.findUniqueOrThrow({where:{id:cameraId}});if(c.status==='DISABLED')return {error:'Камера отключена'};
 const email=String(data.get('email')||'').trim().toLowerCase();if(email)z.string().email().parse(email);
 const token=randomBytes(32).toString('hex');
 const session=await db.$transaction(async tx=>{const s=await tx.cameraSession.create({data:{cameraId,tokenHash:tokenHash(token),invitedBy:u.id,invitedEmail:email||null,expiresAt:new Date(Date.now()+30*60000)}});await tx.auditLog.create({data:{actorId:u.id,action:'CAMERA_INVITED',entityId:s.id}});return s;});
 let delivery='qr';
 if(email){try{delivery=await new CameraEmailProvider().invite(email,(process.env.APP_PUBLIC_URL||'http://localhost:3000')+'/camera/'+token);}catch{await stopCameraSession(session.id,u.id);return {error:'Не удалось отправить приглашение. Проверьте email и SMTP.'};}}
 const url=(process.env.APP_PUBLIC_URL||'http://localhost:3000')+'/camera/'+token;
 const qr=await QRCode.toDataURL(url,{width:240,margin:2});
 revalidatePath('/admin/cameras');
 return {token,url,qr,delivery};
}
export async function stopCameraAction(data:FormData){const u=await requireUser('ADMIN');await stopCameraSession(z.string().uuid().parse(data.get('id')),u.id);revalidatePath('/','layout');}
export async function toggleCameraAction(data:FormData){
 const u=await requireUser('ADMIN');const id=z.string().uuid().parse(data.get('id'));
 await db.$transaction(async tx=>{const c=await tx.camera.findUniqueOrThrow({where:{id}});const status=c.status==='DISABLED'?'OFFLINE':'DISABLED';await tx.camera.update({where:{id},data:{status}});if(status==='DISABLED')await tx.cameraSession.updateMany({where:{cameraId:id,status:{not:'STOPPED'}},data:{status:'STOPPED',disconnectedAt:new Date()}});await tx.auditLog.create({data:{actorId:u.id,action:'CAMERA_'+status,entityId:id}});await tx.realtimeEvent.createMany({data:[{role:'ADMIN'},{role:'OPERATOR'}]});});
 revalidatePath('/','layout');
}
