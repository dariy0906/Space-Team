import { PrismaClient, IncidentSource, IncidentType, Severity } from '@prisma/client';
import { hash } from 'bcryptjs';
const db = new PrismaClient();
const center = { lat:43.653,lng:51.174 };
const base = [
  ['Possible person fall','PERSON_FALL','CAMERA','CRITICAL','12 мкр.',43.661,51.164],
  ['Water leak detected','WATER_LEAK','SENSOR','HIGH','7 мкр.',43.646,51.177],
  ['Smoke reported','FIRE','CAMERA','HIGH','15 мкр.',43.672,51.151],
  ['Person near coastline','WATER_RESCUE','DRONE','CRITICAL','Набережная',43.638,51.154],
  ['Утечка воды во дворе','WATER_LEAK','RESIDENT','MEDIUM','4 мкр.',43.65,51.189],
  ['Повреждён люк','CITIZEN_REPORT','RESIDENT','LOW','9 мкр.',43.658,51.198],
  ['Smoke reported','FIRE','CAMERA','MEDIUM','13 мкр.',43.668,51.178],
  ['Possible person fall','PERSON_FALL','CAMERA','HIGH','11 мкр.',43.655,51.154],
  ['Water leak detected','WATER_LEAK','SENSOR','MEDIUM','17 мкр.',43.68,51.192],
  ['Обрыв освещения','OTHER','MANUAL','LOW','3 мкр.',43.643,51.201],
  ['Person near coastline','WATER_RESCUE','DRONE','HIGH','Скальная тропа',43.632,51.14],
  ['Possible person fall','PERSON_FALL','CAMERA','MEDIUM','20 мкр.',43.684,51.161],
  ['Water leak detected','WATER_LEAK','SENSOR','HIGH','26 мкр.',43.694,51.175],
  ['Задымление','FIRE','CAMERA','CRITICAL','5 мкр.',43.651,51.17],
  ['Повреждён тротуар','CITIZEN_REPORT','RESIDENT','LOW','14 мкр.',43.673,51.207],
] as const;
async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (at least 8 characters) in .env');
  const passwordHash = await hash(password,12);
  const operator = await db.user.upsert({where:{email:'operator@demo.kz'},update:{passwordHash},create:{name:'Алия Омарова',email:'operator@demo.kz',passwordHash,role:'OPERATOR',...center,isOnline:true}});
  const resident = await db.user.upsert({where:{email:'resident@demo.kz'},update:{passwordHash},create:{name:'Данияр Ермеков',email:'resident@demo.kz',passwordHash,role:'RESIDENT',lat:43.659,lng:51.17}});
  const workers = await Promise.all(['Марат Сагындыков','Асель Ким','Руслан Ахметов','Айжан Сеитова'].map(async(name,i)=>db.user.upsert({where:{email:i===0?'worker@demo.kz':`worker${i+1}@demo.kz`},update:{passwordHash},create:{name,email:i===0?'worker@demo.kz':`worker${i+1}@demo.kz`,passwordHash,role:'WORKER',lat:43.65+i*.007,lng:51.16+i*.008,isOnline:true}})));
  if (await db.camera.count()===0) for(let i=0;i<8;i++) await db.camera.create({data:{name:`Camera #${11+i}`,lat:43.64+i*.006,lng:51.15+(i%4)*.014}});
  if (await db.sensor.count()===0) for(let i=0;i<5;i++) await db.sensor.create({data:{name:`Water Sensor #${i+1}`,type:'WATER',lat:43.645+i*.009,lng:51.16+(i%3)*.018}});
  if (await db.drone.count()===0) for(let i=0;i<2;i++) await db.drone.create({data:{name:`Drone #${i+1}`,lat:43.637+i*.035,lng:51.15+i*.025}});
  if (await db.incident.count()===0) for (const [i,row] of base.entries()) {
    const [title,type,source,severity,district,lat,lng] = row;
    const isResident = source==='RESIDENT';
    const incident = await db.incident.create({data:{title,description:'Демонстрационное событие для показа рабочего процесса. Данные не связаны с реальными камерами или датчиками.',type:type as IncidentType,source:source as IncidentSource,severity:severity as Severity,confidence:isResident?null:Math.round(76+(i%5)*4),lat,lng,address:`${district}, Актау`,district,isDemo:true,reporterId:isResident?resident.id:null,status:i<3?'NEW':i<6?'CONFIRMED':i<8?'ASSIGNED':i<10?'IN_PROGRESS':i<12?'RESOLVED':'NEW',history:{create:{action:'Создано демо-событие',newStatus:'NEW',actorId:operator.id}}}});
    if (incident.status !== 'NEW') await db.incidentHistory.create({data:{incidentId:incident.id,action:`Демо-статус: ${incident.status}`,previousStatus:'NEW',newStatus:incident.status,actorId:operator.id}});
    if(isResident) await db.citizenReport.create({data:{userId:resident.id,incidentId:incident.id}});
    if(i>=6&&i<12){const worker=workers[i%workers.length];await db.incident.update({where:{id:incident.id},data:{assignedWorkerId:worker.id}});await db.workerTask.create({data:{incidentId:incident.id,workerId:worker.id,status:i<8?'ASSIGNED':i<10?'ON_SITE':'COMPLETED',completedAt:i>=10?new Date():null}});}
  }
  console.log('Seed complete: operator, resident, 4 workers, 8 cameras, 5 sensors, 2 drones, 15 incidents');
}
main().finally(()=>db.$disconnect());
