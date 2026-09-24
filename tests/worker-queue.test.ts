import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/lib/db';
import {assignIncident, decideIncident, advanceTask} from '../src/lib/workflow';

test('stale unfinished demo task does not block a newly assigned task; live order still enforced', async () => {
  assert.match(process.env.DATABASE_URL || '', /aqtau_test/, 'Use isolated aqtau_test database');
  const tag = randomUUID();
  const operator = await db.user.create({data:{name:'Queue op',email:tag+'o@test.local',passwordHash:'unused',role:'OPERATOR'}});
  const worker = await db.user.create({data:{name:'Queue worker',email:tag+'w@test.local',passwordHash:'unused',role:'WORKER',workerProfile:{create:{specialization:'WATER'}}}});
  let staleId='', freshId='', thirdId='';
  try {
    const stale = await db.incident.create({data:{title:'Stale leftover',type:'WATER_LEAK',source:'RESIDENT',severity:'MEDIUM',lat:43.65,lng:51.17,address:'Актау'}});staleId=stale.id;
    await decideIncident(stale.id, operator.id, 'CONFIRMED');
    await assignIncident(stale.id, operator.id, worker.id, null);
    // Имитируем незакрытую demo-задачу прошлого запуска: окно в прошлом, статус ASSIGNED.
    const yesterday = new Date(Date.now() - 24 * 3600000);
    await db.workerTask.update({where:{incidentId:stale.id},data:{status:'ASSIGNED',plannedStart:yesterday,plannedEnd:new Date(yesterday.getTime()+45*60000)}});

    const fresh = await db.incident.create({data:{title:'Fresh task',type:'WATER_LEAK',source:'RESIDENT',severity:'MEDIUM',lat:43.65,lng:51.17,address:'Актау'}});freshId=fresh.id;
    await decideIncident(fresh.id, operator.id, 'CONFIRMED');
    await assignIncident(fresh.id, operator.id, worker.id, null);

    const staleTask = await db.workerTask.findUniqueOrThrow({where:{incidentId:stale.id}});
    const freshTask = await db.workerTask.findUniqueOrThrow({where:{incidentId:fresh.id}});
    assert.ok(freshTask.position < staleTask.position, 'new task must be ordered before the stale task');
    assert.equal(staleTask.plannedStart?.toISOString(), yesterday.toISOString(), 'stale task keeps its old schedule');

    // Новая задача не заблокирована старой.
    await advanceTask(fresh.id, worker.id, 'ACCEPTED', '');
    const accepted = await db.workerTask.findUniqueOrThrow({where:{incidentId:fresh.id}});
    assert.equal(accepted.status, 'ACCEPTED');

    // Правило порядка сохраняется для задач текущего плана.
    const third = await db.incident.create({data:{title:'Third task',type:'WATER_LEAK',source:'RESIDENT',severity:'MEDIUM',lat:43.65,lng:51.17,address:'Актау'}});thirdId=third.id;
    await decideIncident(third.id, operator.id, 'CONFIRMED');
    await assignIncident(third.id, operator.id, worker.id, null);
    await assert.rejects(advanceTask(third.id, worker.id, 'ACCEPTED', ''), /первую задачу/, 'live earlier task still blocks');
  } finally {
    const ids=[staleId, freshId, thirdId];
    await db.workerTask.deleteMany({where:{incidentId:{in:ids}}});
    await db.workerViolation.deleteMany({where:{incidentId:{in:ids}}});
    await db.incident.deleteMany({where:{id:{in:ids}}});
    await db.user.deleteMany({where:{id:{in:[operator.id, worker.id]}}});
  }
  await db.$disconnect();
});
