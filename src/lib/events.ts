import type { Prisma, Incident } from '@prisma/client';
export async function publishIncident(tx: Prisma.TransactionClient, incident: Pick<Incident,'id'|'reporterId'|'assignedWorkerId'>, title: string) {
  const operators = await tx.user.findMany({where:{role:{in:['OPERATOR','ADMIN']},isActive:true},select:{id:true}});
  const ids = [...new Set([...operators.map(u=>u.id),incident.reporterId,incident.assignedWorkerId].filter((x):x is string=>!!x))];
  await tx.notification.createMany({data:ids.map(userId=>({userId,title,href:`/incidents/${incident.id}`}))});
  await tx.realtimeEvent.createMany({data:ids.map(userId=>({userId}))});
}

