import {createHash} from 'node:crypto';
import {db} from './db';
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export type CameraState='INVITED'|'CONNECTING'|'LIVE'|'DISCONNECTED'|'EXPIRED'|'STOPPED';
export function cameraState(session:{status:string;expiresAt:Date;lastSeenAt?:Date|null},now=new Date()):CameraState {
 if(session.status==='STOPPED')return 'STOPPED';
 if(session.expiresAt<=now)return 'EXPIRED';
 if(session.status==='ACTIVE')return session.lastSeenAt&&now.getTime()-session.lastSeenAt.getTime()>30000?'DISCONNECTED':'LIVE';
 return 'INVITED';
}
export async function cameraSession(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const session=await db.cameraSession.findUnique({where:{tokenHash:tokenHash(token)},include:{camera:true,permission:true}});
 if(!session||session.status==='STOPPED'||session.expiresAt<new Date()||session.camera.status==='DISABLED')return null;
 return session;
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');return !!origin&&new URL(origin).host===request.headers.get('host');
}
export async function stopCameraSession(id:string,actorId?:string){
 await db.$transaction(async tx=>{
  await tx.cameraSession.update({where:{id},data:{status:'STOPPED',disconnectedAt:new Date()}});
  await tx.cameraSignal.deleteMany({where:{sessionId:id}});
  await tx.auditLog.create({data:{actorId,action:'CAMERA_STOPPED',entityId:id}});
  await tx.realtimeEvent.createMany({data:[{role:'OPERATOR'},{role:'ADMIN'}]});
 });
}
export async function expireCameraSessions(){
 const stale=await db.cameraSession.findMany({where:{status:{not:'STOPPED'},OR:[{expiresAt:{lt:new Date()}},{status:'ACTIVE',lastSeenAt:{lt:new Date(Date.now()-30000)}}]},select:{id:true}});
 for(const s of stale)await stopCameraSession(s.id);
}
