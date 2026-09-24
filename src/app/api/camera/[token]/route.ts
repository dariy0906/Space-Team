import {cameraSession,sameOrigin,stopCameraSession} from '@/lib/cameras';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 const s=await cameraSession((await params).token);if(!s)return Response.json({error:'Сессия завершена или истекла'},{status:410});
 if(s.status==='ACTIVE')await db.cameraSession.updateMany({where:{id:s.id,status:'ACTIVE'},data:{lastSeenAt:new Date()}});
 return Response.json({id:s.id,status:s.status,name:s.camera.name,expiresAt:s.expiresAt,cvEnabled:!!process.env.CV_SERVICE_URL},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 if(!sameOrigin(request))return new Response('Forbidden',{status:403});
 const s=await cameraSession((await params).token);if(!s)return new Response('Gone',{status:410});
 const {action}=await request.json();
 const u=await currentUser();
 if(action==='stop'){await stopCameraSession(s.id,u?.id);return Response.json({ok:true});}
 if(action!=='consent')return new Response('Bad request',{status:400});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "CameraSession" WHERE id=${s.id}::uuid FOR UPDATE`;
  const fresh=await tx.cameraSession.findUniqueOrThrow({where:{id:s.id}});
  if(fresh.status==='STOPPED'||fresh.expiresAt<new Date())throw new Error('Session expired');
  await tx.cameraPermission.upsert({where:{sessionId:s.id},create:{sessionId:s.id,consentText:'Разрешаю использовать камеру телефона для live demo и анализа возможного падения. Могу остановить в любой момент.'},update:{}});
  await tx.cameraSession.update({where:{id:s.id},data:{status:'ACTIVE',startedAt:new Date(),lastSeenAt:new Date(),acceptedBy:u?.id}});
  await tx.auditLog.create({data:{actorId:u?.id,action:'CAMERA_CONSENT',entityId:s.id}});
  await tx.realtimeEvent.createMany({data:[{role:'OPERATOR'},{role:'ADMIN'}]});
 });
 return Response.json({ok:true});
}
