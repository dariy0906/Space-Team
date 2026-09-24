import { Incident, Prisma, Specialization } from '@prisma/client';
import { db } from './db';
import { demoEnabled } from './demo';
import { publishIncident } from './events';
import { distanceMeters, routing } from './routing';
export const specializationFor = (type:string):Specialization => ({WATER_LEAK:'WATER',FIRE:'FIRE',SMOKE:'FIRE',LIGHTING:'ELECTRICITY',ROAD:'ROAD',WASTE:'SANITATION',PERSON_FALL:'RESCUE',WATER_RESCUE:'RESCUE',FIGHT:'RESCUE',SAFETY:'RESCUE'} as Record<string,Specialization>)[type]||'OTHER';
export async function lockIncident(tx:Prisma.TransactionClient,id:string) {
  await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.incident.findUniqueOrThrow({where:{id}});
}
export async function assertOperator(tx:Prisma.TransactionClient,incident:Incident,operatorId:string) {
  if(incident.assignedOperatorId && incident.assignedOperatorId!==operatorId) throw new Error('Событие обрабатывает другой оператор');
  if(incident.claimExpiresAt && incident.claimExpiresAt<=new Date()) throw new Error('Время принятия истекло. Обновите событие');
  await tx.incident.update({where:{id:incident.id},data:{assignedOperatorId:operatorId,claimedAt:new Date(),claimExpiresAt:null}});
}
export async function dispatchCritical() {
  const candidates=await db.incident.findMany({where:{severity:'CRITICAL',status:{in:['NEW','WAITING_OPERATOR','REOPENED']},claimedAt:null,OR:[{assignedOperatorId:null},{claimExpiresAt:{lte:new Date()}}]},select:{id:true},take:30});
  for(const c of candidates) await db.$transaction(async tx=>{
    const i=await lockIncident(tx,c.id);
    if(i.claimedAt || !['NEW','WAITING_OPERATOR','REOPENED'].includes(i.status) || (i.claimExpiresAt && i.claimExpiresAt>new Date())) return;
    const operators=await tx.user.findMany({where:{role:'OPERATOR',isActive:true,operatorProfile:{onShift:true}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
    if(!operators.length) return;
    const next=operators[(operators.findIndex(o=>o.id===i.assignedOperatorId)+1)%operators.length];
    const seconds=demoEnabled()?20:60;
    const updated=await tx.incident.update({where:{id:i.id},data:{assignedOperatorId:next.id,claimExpiresAt:new Date(Date.now()+seconds*1000),status:'WAITING_OPERATOR',version:{increment:1}}});
    await tx.incidentAssignment.create({data:{incidentId:i.id,operatorId:next.id,action:i.assignedOperatorId?'TIMEOUT_TRANSFER':'OFFERED'}});
    await tx.auditLog.create({data:{action:'CRITICAL_OFFER',entityId:i.id,details:{operatorId:next.id,seconds}}});
    await publishIncident(tx,updated,'Критическое событие ожидает оператора');
  });
}
export async function recommendations(incident:Pick<Incident,'lat'|'lng'|'type'|'severity'>) {
  const workers=await db.user.findMany({where:{role:'WORKER',isActive:true,workerProfile:{specialization:specializationFor(incident.type),onShift:true}},include:{tasks:{where:{status:{not:'COMPLETED'}},include:{incident:true}},workerProfile:true}});
  const ranked=workers.filter(w=>w.lat!==null&&w.lng!==null).map(w=>({worker:w,distance:distanceMeters({lat:w.lat!,lng:w.lng!},incident)})).sort((a,b)=>(a.worker.tasks.length-b.worker.tasks.length)||a.distance-b.distance).slice(0,6);
  return Promise.all(ranked.map(async ({worker,distance})=>{
    const route=await routing.route({lat:worker.lat!,lng:worker.lng!},incident).catch(()=>null);
    return {worker,route,distance,reason:worker.tasks.some(t=>t.incident.severity==='CRITICAL')?'Уже есть критическая задача':worker.tasks.length?'Есть задания: новое будет добавлено в план':'Подходящая специализация, свободен'};
  }));
}
