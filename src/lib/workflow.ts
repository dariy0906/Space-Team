import { IncidentStatus, TaskStatus } from '@prisma/client';
import { db } from './db';
import { assertOperator, lockIncident, specializationFor } from './dispatch';
import { publishIncident } from './events';
import { prioritizeTasks, isStaleTask } from '@/features/incidents/queue-policy';
import type { RouteResult } from './routing';
export async function decideIncident(id: string, operatorId: string, next: IncidentStatus, comment = '') {
  return db.$transaction(async (tx) => {
    const i = await lockIncident(tx, id);
    await assertOperator(tx, i, operatorId);
    if (next === 'REOPENED') {
      if (i.status !== 'RESOLVED' || !i.assignedWorkerId || comment.trim().length < 5)
        throw new Error('Нужна завершённая задача и причина возврата');
      await tx.workerViolation.create({
        data: { incidentId: id, workerId: i.assignedWorkerId, operatorId, reason: comment },
      });
      await tx.workerTask.update({
        where: { incidentId: id },
        data: { status: 'ASSIGNED', completedAt: null, startedAt: null, acceptedAt: null },
      });
    } else if (
      !['NEW', 'WAITING_OPERATOR', 'REOPENED'].includes(i.status) ||
      !['CONFIRMED', 'REJECTED'].includes(next)
    )
      throw new Error('Недопустимый переход');
    const result = await tx.incident.update({
      where: { id },
      data: {
        status: next,
        version: { increment: 1 },
        history: {
          create: {
            action:
              next === 'REOPENED'
                ? 'Заявка возвращена на доработку'
                : next === 'CONFIRMED'
                  ? 'Обращение принято'
                  : 'Обращение отклонено',
            previousStatus: i.status,
            newStatus: next,
            actorId: operatorId,
            isPublic: true,
            comment: next === 'REOPENED' ? null : comment || null,
          },
        },
      },
    });
    await tx.auditLog.create({
      data: { actorId: operatorId, action: next, entityId: id, details: { comment } },
    });
    await publishIncident(
      tx,
      result,
      next === 'REOPENED' ? 'Задача возвращена на доработку' : 'Статус обращения обновлён',
    );
    return result;
  });
}
export async function claimIncident(id: string, operatorId: string) {
  return db.$transaction(async (tx) => {
    const i = await lockIncident(tx, id);
    if (['RESOLVED', 'REJECTED'].includes(i.status)) throw new Error('Событие закрыто');
    await assertOperator(tx, i, operatorId);
    await tx.incidentAssignment.create({ data: { incidentId: id, operatorId, action: 'CLAIMED' } });
    await tx.auditLog.create({ data: { actorId: operatorId, action: 'CLAIMED', entityId: id } });
    await publishIncident(tx, i, 'Оператор принял событие');
  });
}
export async function assignIncident(
  id: string,
  operatorId: string,
  workerId: string,
  route: RouteResult | null,
) {
  return db.$transaction(async (tx) => {
    const i = await lockIncident(tx, id);
    await assertOperator(tx, i, operatorId);
    if (!['CONFIRMED', 'REOPENED'].includes(i.status)) throw new Error('Сначала подтвердите событие');
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${workerId}::uuid FOR UPDATE`;
    const worker = await tx.user.findUniqueOrThrow({
      where: { id: workerId },
      include: { workerProfile: true },
    });
    if (
      worker.role !== 'WORKER' ||
      !worker.isActive ||
      !worker.workerProfile?.onShift ||
      worker.workerProfile.specialization !== specializationFor(i.type)
    )
      throw new Error('Работник недоступен или не подходит по специализации');
    const tasks = await tx.workerTask.findMany({
      where: {
        workerId,
        status: { not: 'COMPLETED' },
        incidentId: { not: id },
        incident: { status: { notIn: ['RESOLVED', 'REJECTED'] } },
      },
      include: { incident: true },
      orderBy: { position: 'asc' },
    });
    const task = await tx.workerTask.upsert({
      where: { incidentId: id },
      create: { incidentId: id, workerId },
      update: {
        workerId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        acceptedAt: null,
        startedAt: null,
        completedAt: null,
      },
    });
    const { queue, stale } = prioritizeTasks(tasks, task, i.severity === 'CRITICAL', Date.now());
    let at = Date.now();
    for (const [position, t] of queue.entries()) {
      const travel = t.id === task.id && route ? route.durationSeconds * 1000 : 15 * 60000;
      const start = new Date(at + travel),
        end = new Date(start.getTime() + 45 * 60000);
      await tx.workerTask.update({
        where: { id: t.id },
        data: { position, plannedStart: start, plannedEnd: end },
      });
      at = end.getTime();
    }
    let stalePosition = queue.length;
    for (const t of stale)
      await tx.workerTask.update({ where: { id: t.id }, data: { position: stalePosition++ } });
    if (route)
      await tx.routePlan.upsert({
        where: { taskId: task.id },
        create: {
          taskId: task.id,
          provider: route.provider,
          geometry: route.coordinates,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
        },
        update: {
          provider: route.provider,
          geometry: route.coordinates,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
        },
      });
    else await tx.routePlan.deleteMany({ where: { taskId: task.id } });
    const result = await tx.incident.update({
      where: { id },
      data: {
        assignedWorkerId: workerId,
        status: 'ASSIGNED',
        version: { increment: 1 },
        history: {
          create: {
            action: 'Назначен исполнитель',
            isPublic: true,
            actorId: operatorId,
            previousStatus: i.status,
            newStatus: 'ASSIGNED',
          },
        },
      },
    });
    await tx.incidentAssignment.create({
      data: { incidentId: id, operatorId, workerId, action: 'WORKER_ASSIGNED' },
    });
    await tx.auditLog.create({
      data: {
        actorId: operatorId,
        action: 'WORKER_ASSIGNED',
        entityId: id,
        details: { workerId, criticalReplan: i.severity === 'CRITICAL' },
      },
    });
    await publishIncident(tx, result, 'Назначен исполнитель, рабочий план обновлён');
    if (i.assignedWorkerId && i.assignedWorkerId !== workerId)
      await tx.realtimeEvent.create({ data: { userId: i.assignedWorkerId } });
    return result;
  });
}
export async function advanceTask(
  id: string,
  workerId: string,
  next: TaskStatus,
  comment: string,
  photo?: string,
) {
  return db.$transaction(async (tx) => {
    const i = await lockIncident(tx, id);
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${workerId}::uuid FOR UPDATE`;
    const task = await tx.workerTask.findUniqueOrThrow({ where: { incidentId: id } });
    if (task.workerId !== workerId || i.assignedWorkerId !== workerId)
      throw new Error('Нет доступа к задаче');
    const steps: TaskStatus[] = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE', 'COMPLETED'];
    if (steps.indexOf(next) !== steps.indexOf(task.status) + 1 || ['RESOLVED', 'REJECTED'].includes(i.status))
      throw new Error('Недопустимый переход задачи');
    if (next === 'COMPLETED' && (!comment.trim() || !photo))
      throw new Error('Обязательны комментарий и фото после');
    const queue = await tx.workerTask.findMany({
      where: {
        workerId,
        status: { not: 'COMPLETED' },
        incident: { status: { notIn: ['RESOLVED', 'REJECTED'] } },
      },
      include: { incident: true },
      orderBy: [{ position: 'asc' }, { assignedAt: 'asc' }],
    });
    const first = queue.find((candidate) => candidate.id === task.id || !isStaleTask(candidate, Date.now()));
    if (first?.id !== task.id) throw new Error('Сначала выполните первую задачу рабочего плана');
    await tx.workerTask.update({
      where: { id: task.id },
      data: {
        status: next,
        acceptedAt: next === 'ACCEPTED' ? new Date() : undefined,
        startedAt: next === 'ON_SITE' ? new Date() : undefined,
        completedAt: next === 'COMPLETED' ? new Date() : undefined,
        completionComment: next === 'COMPLETED' ? comment : undefined,
      },
    });
    const status = next === 'COMPLETED' ? 'RESOLVED' : 'IN_PROGRESS';
    const result = await tx.incident.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
        media: photo ? { create: { type: 'IMAGE', stage: 'AFTER', url: photo } } : undefined,
        history: {
          create: {
            action:
              next === 'COMPLETED'
                ? 'Работа выполнена'
                : next === 'ON_SITE'
                  ? 'Исполнитель на месте'
                  : 'Обращение в работе',
            isPublic: true,
            actorId: workerId,
            previousStatus: i.status,
            newStatus: status,
          },
        },
      },
    });
    await publishIncident(
      tx,
      result,
      next === 'COMPLETED' ? 'Работа выполнена — доступно фото результата' : 'Исполнитель обновил статус',
    );
    return result;
  });
}
