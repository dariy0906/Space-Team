'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { IncidentSource, IncidentStatus, TaskStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createSession, deleteSession, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { incidentInput } from '@/lib/validation';

const field = (data: FormData, name: string) => String(data.get(name) ?? '');
const changed = () => { revalidatePath('/operator'); revalidatePath('/resident'); revalidatePath('/worker'); };
async function savePhoto(data: FormData, name: string): Promise<string | undefined> {
  const file = data.get(name);
  if (!(file instanceof File) || file.size === 0) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5_000_000) throw new Error('Фото: только JPG, PNG или WebP до 5 МБ');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const dir = path.join(process.cwd(), 'data', 'uploads');
  await mkdir(dir, { recursive: true });
  const nameOnDisk = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, nameOnDisk), Buffer.from(await file.arrayBuffer()));
  return `/api/media/${nameOnDisk}`;
}
export async function loginAction(data: FormData) {
  const email = field(data, 'email').trim().toLowerCase();
  const password = field(data, 'password');
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) redirect('/login?error=1');
  await createSession(user.id);
  redirect(`/${user.role.toLowerCase()}`);
}
export async function quickLoginAction(data: FormData) {
  if (process.env.NODE_ENV !== 'development') throw new Error('Demo quick login is disabled');
  const role = z.enum(['OPERATOR', 'WORKER', 'RESIDENT']).parse(field(data, 'role'));
  const emails = {
    OPERATOR: 'operator@demo.kz',
    WORKER: 'worker@demo.kz',
    RESIDENT: 'resident@demo.kz',
  } as const;
  const user = await db.user.findUnique({ where: { email: emails[role] } });
  if (!user || user.role !== role) redirect('/login?error=demo');
  await createSession(user.id);
  redirect(`/${role.toLowerCase()}`);
}
export async function logoutAction() { await deleteSession(); redirect('/login'); }
export async function createIncidentAction(data: FormData) {
  const user = await requireUser('OPERATOR');
  const input = incidentInput.extend({ source: z.nativeEnum(IncidentSource), confidence: z.coerce.number().min(0).max(100).optional() }).parse({
    title: field(data,'title'), description: field(data,'description'), type: field(data,'type'), severity: field(data,'severity'), source: field(data,'source'), confidence: field(data,'confidence') || undefined, address: field(data,'address'), district: field(data,'district'), lat: field(data,'lat'), lng: field(data,'lng'),
  });
  const incident = await db.incident.create({ data: { ...input, isDemo: true, history: { create: { action: 'Создано в демонстрации', actorId: user.id, newStatus: 'NEW' } } } });
  changed(); redirect(`/incidents/${incident.id}?toast=created`);
}
export async function createReportAction(data: FormData) {
  const user = await requireUser('RESIDENT');
  const input = incidentInput.omit({ title: true, severity: true }).parse({ description: field(data,'description'), type: field(data,'type'), address: field(data,'address'), district: field(data,'district'), lat: field(data,'lat'), lng: field(data,'lng') });
  const photo = await savePhoto(data, 'photo');
  const incident = await db.incident.create({ data: { ...input, title: field(data,'title').trim().slice(0,100) || `Обращение: ${input.address}`, severity: 'MEDIUM', source: 'RESIDENT', reporterId: user.id, media: photo ? { create: { type: 'IMAGE', url: photo } } : undefined, citizenReport: { create: { userId: user.id } }, history: { create: { action: 'Житель отправил обращение', actorId: user.id, newStatus: 'NEW' } } } });
  changed(); redirect(`/incidents/${incident.id}?toast=created`);
}
export async function updateIncidentAction(data: FormData) {
  const user = await requireUser('OPERATOR');
  const id = field(data,'id'); const next = z.nativeEnum(IncidentStatus).parse(field(data,'status'));
  if (!['CONFIRMED','REJECTED'].includes(next)) throw new Error('Недопустимый статус');
  const incident = await db.incident.findUniqueOrThrow({ where: { id } });
  if (incident.status !== 'NEW') throw new Error('Подтвердить или отклонить можно только новое событие');
  await db.incident.update({ where: { id }, data: { status: next, history: { create: { action: next === 'CONFIRMED' ? 'Подтверждено оператором' : 'Отклонено оператором', previousStatus: incident.status, newStatus: next, actorId: user.id } } } });
  changed(); revalidatePath(`/incidents/${id}`); redirect(`/incidents/${id}?toast=updated`);
}
export async function assignWorkerAction(data: FormData) {
  const user = await requireUser('OPERATOR');
  const id = field(data,'id'); const workerId = field(data,'workerId');
  const [incident, worker] = await Promise.all([db.incident.findUniqueOrThrow({ where: { id } }), db.user.findUniqueOrThrow({ where: { id: workerId } })]);
  if (worker.role !== 'WORKER' || !['NEW','CONFIRMED'].includes(incident.status)) throw new Error('Назначение недоступно');
  await db.incident.update({ where: { id }, data: { status: 'ASSIGNED', assignedWorkerId: workerId, task: { create: { workerId } }, history: { create: { action: `Назначен ${worker.name}`, previousStatus: incident.status, newStatus: 'ASSIGNED', actorId: user.id } } } });
  changed(); revalidatePath(`/incidents/${id}`); redirect(`/incidents/${id}?toast=assigned`);
}
export async function updateTaskAction(data: FormData) {
  const user = await requireUser('WORKER');
  const id = field(data,'id'); const next = z.nativeEnum(TaskStatus).parse(field(data,'status'));
  const task = await db.workerTask.findUniqueOrThrow({ where: { incidentId: id }, include: { incident: true } });
  if (task.workerId !== user.id) throw new Error('Задача не принадлежит работнику');
  const steps: TaskStatus[] = ['ASSIGNED','ACCEPTED','ON_THE_WAY','ON_SITE','COMPLETED'];
  if (steps.indexOf(next) !== steps.indexOf(task.status) + 1) throw new Error('Неверный переход статуса');
  const comment = field(data,'comment').trim();
  if (next === 'COMPLETED' && !comment) throw new Error('Укажите результат работы');
  const photo = next === 'COMPLETED' ? await savePhoto(data, 'photo') : undefined;
  await db.$transaction(async tx => {
    await tx.workerTask.update({ where: { id: task.id }, data: { status: next, acceptedAt: next === 'ACCEPTED' ? new Date() : undefined, completedAt: next === 'COMPLETED' ? new Date() : undefined } });
    await tx.incident.update({ where: { id }, data: { status: next === 'COMPLETED' ? 'RESOLVED' : 'IN_PROGRESS', media: photo ? { create: { type: 'IMAGE', url: photo } } : undefined, history: { create: { action: next === 'COMPLETED' ? 'Задача завершена' : `Статус задачи: ${next}`, comment: comment || undefined, actorId: user.id, previousStatus: task.incident.status, newStatus: next === 'COMPLETED' ? 'RESOLVED' : 'IN_PROGRESS' } } } });
  });
  changed(); revalidatePath(`/incidents/${id}`); redirect(`/incidents/${id}?toast=updated`);
}
export async function addCommentAction(data: FormData) {
  const user = await requireUser(); const id = field(data,'id'); const comment = field(data,'comment').trim();
  if (!comment || comment.length > 1000) throw new Error('Комментарий должен содержать от 1 до 1000 символов');
  const incident = await db.incident.findUniqueOrThrow({ where: { id } });
  if (user.role === 'RESIDENT' && incident.reporterId !== user.id) throw new Error('Нет доступа');
  if (user.role === 'WORKER' && incident.assignedWorkerId !== user.id) throw new Error('Нет доступа');
  await db.incidentHistory.create({ data: { incidentId: id, action: 'Комментарий', comment, actorId: user.id } });
  revalidatePath(`/incidents/${id}`); redirect(`/incidents/${id}?toast=commented`);
}
