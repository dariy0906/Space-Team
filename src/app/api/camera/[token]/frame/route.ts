import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {cameraSession,sameOrigin} from '@/lib/cameras';
import {db} from '@/lib/db';
import {publishIncident} from '@/lib/events';
import {dispatchCritical} from '@/lib/dispatch';
export const runtime='nodejs';
const resultSchema=z.object({events:z.array(z.object({type:z.enum(['PERSON_FALL','POSSIBLE_FIGHT']),confidence:z.number().min(0).max(100),score:z.number().min(0).max(100).optional(),poseVisibility:z.number().min(0).max(100).optional(),peopleCount:z.number().int().nonnegative().optional(),durationSeconds:z.number().nonnegative(),method:z.string()})),message:z.string()});
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 if(!sameOrigin(request))return Response.json({message:'Forbidden'},{status:403});
 const s=await cameraSession((await params).token);
 if(!s||s.status!=='ACTIVE'||!s.permission)return Response.json({message:'Сессия завершена'},{status:403});
 if(!process.env.CV_SERVICE_URL)return Response.json({message:'CV не подключён'},{status:503});
 if(Number(request.headers.get('content-length')||0)>500000)return Response.json({message:'Кадр слишком большой'},{status:413});
 const bytes=Buffer.from(await request.arrayBuffer());if(bytes.length>500000||bytes[0]!==255||bytes[1]!==216)return Response.json({message:'Нужен JPEG до 500 КБ'},{status:400});
 try{
  const r=await fetch(process.env.CV_SERVICE_URL+'/analyze?session='+s.id,{method:'POST',headers:{'Content-Type':'image/jpeg','Authorization':'Bearer '+(process.env.CV_SERVICE_KEY||process.env.SESSION_SECRET)},body:bytes,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('CV temporarily unavailable');const result=resultSchema.parse(await r.json());
  for(const event of result.events) await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CameraSession" WHERE id=${s.id}::uuid FOR UPDATE`;
   const fresh=await tx.cameraSession.findUniqueOrThrow({where:{id:s.id}});if(fresh.status!=='ACTIVE'||fresh.expiresAt<new Date())return;
   const incidentType:'PERSON_FALL'|'FIGHT'=event.type==='PERSON_FALL'?'PERSON_FALL':'FIGHT';
   if(await tx.incident.findFirst({where:{cameraId:s.cameraId,type:incidentType,createdAt:{gt:new Date(Date.now()-60000)}}}))return;
   const filename=randomUUID()+'.jpg',dir=path.join(process.cwd(),'data','uploads');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,filename),bytes);
   const fall=event.type==='PERSON_FALL';
   const title=fall?'Возможное падение человека':'Возможная драка';
   const description=fall?'Экспериментальная эвристика зафиксировала переход из вертикальной позы в горизонтальную с последующей неподвижностью. Это НЕ медицински достоверное определение состояния — требуется проверка оператором.':'Экспериментальная эвристика зафиксировала устойчивое движение двух и более человек. Это НЕ доказательство драки — требуется проверка оператором.';
   const i=await tx.incident.create({data:{title,description,type:incidentType,source:'CAMERA',severity:fall?'CRITICAL':'HIGH',confidence:event.score??event.confidence,lat:s.camera.lat,lng:s.camera.lng,address:s.camera.name,cameraId:s.cameraId,isDemo:false,metadata:{sessionId:s.id,durationSeconds:event.durationSeconds,detector:event.method,detectionScore:event.score??event.confidence,poseVisibility:event.poseVisibility??null,peopleCount:event.peopleCount??null,scoreLabel:'heuristic',experimental:true},media:{create:{type:'IMAGE',stage:'BEFORE',url:'/api/media/'+filename}},history:{create:{action:fall?'CV: возможное падение (эвристика)':'CV: возможная драка (эвристика)',newStatus:'NEW'}}}});
   await publishIncident(tx,i,fall?'Критическое событие: возможное падение человека':'Событие: возможная драка');
  });
  if(result.events.length)await dispatchCritical();
  return Response.json({message:result.message});
 }catch{return Response.json({message:'CV недоступен; видеопоток продолжает работать'},{status:503});}
}

