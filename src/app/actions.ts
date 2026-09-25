'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TaskStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { savePhoto, discardPhoto } from '@/features/media/storage';
import { z } from 'zod';
import { createSession, deleteSession, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { incidentInput } from '@/lib/validation';
import { demoAccounts, demoEnabled } from '@/lib/demo';
import { publishIncident } from '@/lib/events';
import { advanceTask, assignIncident, claimIncident, decideIncident } from '@/lib/workflow';
import { routing } from '@/lib/routing';
const field = (data: FormData, name: string) => String(data.get(name) ?? '');
const uuid = (data: FormData, name = 'id') => z.string().uuid().parse(field(data, name));
const changed = () => revalidatePath('/', 'layout');
async function mutate(id: string, fn: () => Promise<unknown>) {
  let error = '';
  try {
    await fn();
  } catch (e) {
    console.error('Workflow:', e);
    error = e instanceof Error ? e.message : 'Не удалось сохранить';
  }
  revalidatePath('/incidents/' + id);
  changed();
  redirect(
    '/incidents/' +
      id +
      '?' +
      (error ? 'error=' + encodeURIComponent(error) : 'toast=updated') +
      '&revision=' +
      Date.now(),
  );
}
export async function loginAction(data: FormData) {
  const user = await db.user.findUnique({ where: { email: field(data, 'email').trim().toLowerCase() } });
  if (!user || !user.isActive || !(await compare(field(data, 'password'), user.passwordHash)))
    redirect('/login?error=1');
  await createSession(user.id);
  redirect('/' + user.role.toLowerCase());
}
export async function quickLoginAction(data: FormData) {
  if (!demoEnabled()) throw new Error('Демо-вход отключён');
  const email = field(data, 'email');
  if (!demoAccounts.some((a) => a.email === email)) redirect('/login?error=demo');
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.isDemo || !user.isActive) redirect('/login?error=demo');
  await createSession(user.id);
  redirect('/' + user.role.toLowerCase());
}
export async function logoutAction() {
  await deleteSession();
  redirect('/login');
}
export async function createReportAction(data: FormData) {
  const user = await requireUser('RESIDENT');
  let id = '',
    error = '';
  let photo: string | undefined;
  try {
    const input = incidentInput
      .omit({ severity: true })
      .parse(
        Object.fromEntries(
          ['title', 'description', 'type', 'address', 'district', 'lat', 'lng'].map((k) => [
            k,
            field(data, k),
          ]),
        ),
      );
    photo = await savePhoto(data, 'photo', true);
    const incident = await db.$transaction(async (tx) => {
      const i = await tx.incident.create({
        data: {
          ...input,
          severity: input.type === 'FIRE' ? 'HIGH' : 'MEDIUM',
          source: 'RESIDENT',
          reporterId: user.id,
          media: { create: { type: 'IMAGE', stage: 'BEFORE', url: photo! } },
          citizenReport: { create: { userId: user.id } },
          history: {
            create: { action: 'Обращение отправлено', actorId: user.id, newStatus: 'NEW', isPublic: true },
          },
        },
      });
      await publishIncident(tx, i, 'Новое обращение жителя');
      return i;
    });
    id = incident.id;
  } catch (e) {
    await discardPhoto(photo);
    error = e instanceof Error ? e.message : 'Не удалось отправить';
  }
  changed();
  if (error) redirect('/resident/report?error=' + encodeURIComponent(error));
  redirect('/incidents/' + id + '?toast=created');
}
export async function claimIncidentAction(data: FormData) {
  const u = await requireUser('OPERATOR');
  const id = uuid(data);
  await mutate(id, () => claimIncident(id, u.id));
}
export async function updateIncidentAction(data: FormData) {
  const u = await requireUser('OPERATOR');
  const id = uuid(data);
  const next = z.enum(['CONFIRMED', 'REJECTED', 'REOPENED']).parse(field(data, 'status'));
  await mutate(id, () => decideIncident(id, u.id, next, field(data, 'comment').slice(0, 1000)));
}
export async function assignWorkerAction(data: FormData) {
  const u = await requireUser('OPERATOR');
  const id = uuid(data);
  const workerId = uuid(data, 'workerId');
  await mutate(id, async () => {
    const [i, w] = await Promise.all([
      db.incident.findUniqueOrThrow({ where: { id } }),
      db.user.findUniqueOrThrow({ where: { id: workerId } }),
    ]);
    const route =
      w.lat !== null && w.lng !== null
        ? await routing.route({ lat: w.lat, lng: w.lng }, i).catch(() => null)
        : null;
    return assignIncident(id, u.id, workerId, route);
  });
}
export async function updateTaskAction(data: FormData) {
  const u = await requireUser('WORKER');
  const id = uuid(data);
  const next = z.nativeEnum(TaskStatus).parse(field(data, 'status'));
  await mutate(id, async () => {
    const photo = next === 'COMPLETED' ? await savePhoto(data, 'photo', true) : undefined;
    try {
      return await advanceTask(id, u.id, next, field(data, 'comment').trim().slice(0, 2000), photo);
    } catch (error) {
      await discardPhoto(photo);
      throw error;
    }
  });
}
export async function addCommentAction(data: FormData) {
  const u = await requireUser();
  const id = uuid(data);
  await mutate(id, async () => {
    const comment = z.string().trim().min(1).max(1000).parse(field(data, 'comment'));
    const i = await db.incident.findUniqueOrThrow({ where: { id } });
    if (u.role === 'RESIDENT' || (u.role === 'WORKER' && i.assignedWorkerId !== u.id))
      throw new Error('Нет доступа');
    await db.$transaction(async (tx) => {
      await tx.incidentHistory.create({
        data: { incidentId: id, action: 'Внутренний комментарий', comment, actorId: u.id },
      });
      await tx.auditLog.create({ data: { actorId: u.id, action: 'COMMENT', entityId: id } });
      await tx.realtimeEvent.createMany({
        data: [
          { role: 'OPERATOR' },
          { role: 'ADMIN' },
          ...(i.assignedWorkerId ? [{ userId: i.assignedWorkerId }] : []),
        ],
      });
    });
  });
}
export async function readNotificationsAction() {
  const u = await requireUser();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  changed();
}
export async function saveStaffAction(data: FormData) {
  const u = await requireUser('ADMIN');
  const role = z.enum(['WORKER', 'OPERATOR']).parse(field(data, 'role'));
  const email = z.string().email().parse(field(data, 'email').trim().toLowerCase());
  const name = z.string().trim().min(2).max(100).parse(field(data, 'name'));
  const spec = z
    .enum(['WATER', 'FIRE', 'ELECTRICITY', 'ROAD', 'RESCUE', 'SANITATION', 'OTHER'])
    .parse(field(data, 'specialization') || 'OTHER');
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role !== role) throw new Error('Нельзя менять роль существующего пользователя');
  const password = field(data, 'password');
  if ((!existing || password) && password.length < 8)
    throw new Error('Для нового аккаунта нужен пароль от 8 символов');
  const passwordHash = await hash(password || randomBytes(20).toString('hex'), 12);
  await db.$transaction(async (tx) => {
    const staff = await tx.user.upsert({
      where: { email },
      create: { email, name, role, passwordHash, lat: 43.653, lng: 51.174 },
      update: { name, ...(password ? { passwordHash } : {}) },
    });
    const onShift = field(data, 'onShift') === 'on';
    if (role === 'WORKER')
      await tx.workerProfile.upsert({
        where: { userId: staff.id },
        create: { userId: staff.id, specialization: spec, onShift },
        update: { specialization: spec, onShift },
      });
    else
      await tx.operatorProfile.upsert({
        where: { userId: staff.id },
        create: { userId: staff.id, onShift },
        update: { onShift },
      });
    await tx.auditLog.create({ data: { actorId: u.id, action: 'STAFF_UPDATED', entityId: staff.id } });
    await tx.realtimeEvent.createMany({
      data: [{ role: 'ADMIN' }, { role: 'OPERATOR' }, { userId: staff.id }],
    });
  });
  changed();
  redirect('/admin?toast=saved');
}
