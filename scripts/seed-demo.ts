import { PrismaClient, IncidentSource, IncidentType, Severity, IncidentStatus, Role, Specialization } from '@prisma/client';
import { demoAccounts } from '../src/lib/demo';
import { hash } from 'bcryptjs';
import { seedCity } from './seed-city';

const center = { lat: 43.653, lng: 51.174 };

type SeedIncident = {
  title: string;
  type: IncidentType;
  source: IncidentSource;
  severity: Severity;
  status?: IncidentStatus;
  district: string;
  lat: number;
  lng: number;
  confidence?: number;
  reporterEmail?: string;
  resolvedSpec?: Specialization;
  completion?: string;
};

// Координаты микрорайонов взяты из OpenStreetMap, чтобы подпись адреса совпадала с точкой на карте.
const incidents: SeedIncident[] = [
  { title: 'Возможное падение человека', type: 'PERSON_FALL', source: 'CAMERA', severity: 'CRITICAL', district: '12 мкр.', lat: 43.66105, lng: 51.15033, confidence: 88 },
  { title: 'Утечка воды · датчик W-014', type: 'WATER_LEAK', source: 'SENSOR', severity: 'HIGH', district: '7 мкр.', lat: 43.64381, lng: 51.15625 },
  { title: 'Задымление в районе 15 мкр.', type: 'SMOKE', source: 'CAMERA', severity: 'HIGH', district: '15 мкр.', lat: 43.65915, lng: 51.1384, confidence: 84 },
  { title: 'Человек в опасности у берега', type: 'WATER_RESCUE', source: 'DRONE', severity: 'CRITICAL', district: 'Набережная', lat: 43.641, lng: 51.15455, confidence: 81 },
  { title: 'Возможное возгорание · 5 мкр.', type: 'FIRE', source: 'CAMERA', severity: 'CRITICAL', district: '5 мкр.', lat: 43.63823, lng: 51.15886, confidence: 92, status: 'CONFIRMED' },
  { title: 'Утечка воды · датчик W-021', type: 'WATER_LEAK', source: 'SENSOR', severity: 'MEDIUM', district: '17 мкр.', lat: 43.67102, lng: 51.14397, status: 'CONFIRMED' },
  { title: 'Обрыв освещения', type: 'OTHER', source: 'MANUAL', severity: 'LOW', district: '3 мкр.', lat: 43.63718, lng: 51.17873 },
  { title: 'Возможное падение · камера C-08', type: 'PERSON_FALL', source: 'CAMERA', severity: 'MEDIUM', district: '20 мкр.', lat: 43.68342, lng: 51.14311, confidence: 79 },
  { title: 'Утечка воды устранена · 26 мкр.', type: 'WATER_LEAK', source: 'SENSOR', severity: 'HIGH', district: '26 мкр.', lat: 43.66224, lng: 51.16547, status: 'RESOLVED', resolvedSpec: 'WATER', completion: 'Течь устранена, соединение проверено' },
  { title: 'Спасение у скальной тропы', type: 'WATER_RESCUE', source: 'DRONE', severity: 'HIGH', district: 'Скальная тропа', lat: 43.62612, lng: 51.16652, confidence: 83, status: 'RESOLVED', resolvedSpec: 'RESCUE', completion: 'Человек доставлен на берег, медицинская помощь не требуется' },
  { title: 'Течь во дворе', type: 'WATER_LEAK', source: 'RESIDENT', severity: 'MEDIUM', district: '4 мкр.', lat: 43.63432, lng: 51.16471, reporterEmail: 'resident@demo.kz' },
  { title: 'Повреждён люк', type: 'CITIZEN_REPORT', source: 'RESIDENT', severity: 'LOW', district: '9 мкр.', lat: 43.64641, lng: 51.15336, reporterEmail: 'resident@demo.kz', status: 'CONFIRMED' },
  { title: 'Не горит фонарь', type: 'LIGHTING', source: 'RESIDENT', severity: 'MEDIUM', district: '14 мкр.', lat: 43.65119, lng: 51.146, reporterEmail: 'resident2@demo.kz' },
  { title: 'Мусор у подъезда', type: 'WASTE', source: 'RESIDENT', severity: 'LOW', district: '11 мкр.', lat: 43.65547, lng: 51.15522, reporterEmail: 'resident2@demo.kz', status: 'RESOLVED', resolvedSpec: 'SANITATION', completion: 'Территория убрана, контейнер вывезен' },
];

export async function seedDemo(db: PrismaClient) {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (at least 8 characters) in .env');
  const passwordHash = await hash(password, 12);

  const byEmail = new Map<string, string>();
  for (const [index, account] of demoAccounts.entries()) {
    const user = await db.user.upsert({
      where: { email: account.email },
      update: { passwordHash, isDemo: true, isActive: true },
      create: {
        email: account.email,
        name: account.name,
        role: account.role as Role,
        passwordHash,
        isDemo: true,
        isActive: true,
        isOnline: account.role === 'RESIDENT' ? false : true,
        ...(account.role === 'OPERATOR' ? center : {}),
        ...(account.role === 'WORKER' ? { lat: 43.65 + (index % 8) * 0.004, lng: 51.16 + (index % 6) * 0.006 } : {}),
      },
    });
    byEmail.set(account.email, user.id);
    if (account.role === 'RESIDENT') await db.residentProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    if (account.role === 'OPERATOR') await db.operatorProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, onShift: true }, update: { onShift: true } });
    if (account.role === 'WORKER' && 'specialization' in account) {
      await db.workerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, specialization: account.specialization as Specialization, onShift: true },
        update: { specialization: account.specialization as Specialization, onShift: true },
      });
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      await db.workerSchedule.upsert({
        where: { workerId_day: { workerId: user.id, day } },
        update: {},
        create: { workerId: user.id, day, startsAt: new Date(day.getTime() + 8 * 3600000), endsAt: new Date(day.getTime() + 18 * 3600000) },
      });
    }
  }

  const workersBySpec = new Map<Specialization, string[]>();
  for (const account of demoAccounts) {
    if (account.role === 'WORKER' && 'specialization' in account) {
      const list = workersBySpec.get(account.specialization as Specialization) ?? [];
      list.push(byEmail.get(account.email)!);
      workersBySpec.set(account.specialization as Specialization, list);
    }
  }

  if ((await db.sensor.count()) === 0) for (let i = 0; i < 5; i++) await db.sensor.create({ data: { name: `Water Sensor W-0${14 + i}`, type: 'WATER', lat: 43.645 + i * 0.009, lng: 51.16 + (i % 3) * 0.018 } });
  if ((await db.drone.count()) === 0) for (let i = 0; i < 2; i++) await db.drone.create({ data: { name: `Coast Drone D-0${i + 2}`, lat: 43.637 + i * 0.035, lng: 51.15 + i * 0.025 } });

  if ((await db.incident.count()) === 0) {
    for (const row of incidents) {
      const status: IncidentStatus = row.status ?? 'NEW';
      const reporterId = row.reporterEmail ? byEmail.get(row.reporterEmail) ?? null : null;
      const incident = await db.incident.create({
        data: {
          title: row.title,
          description: 'Демонстрационное событие для показа рабочего процесса. Не связано с реальными камерами или датчиками.',
          type: row.type,
          source: row.source,
          severity: row.severity,
          confidence: row.confidence ?? null,
          lat: row.lat,
          lng: row.lng,
          address: `${row.district}, Актау`,
          district: row.district,
          isDemo: true,
          reporterId,
          status,
          history: { create: { action: 'Создано демо-событие', newStatus: 'NEW', actorId: byEmail.get('operator@demo.kz') } },
        },
      });
      if (reporterId) await db.citizenReport.create({ data: { userId: reporterId, incidentId: incident.id } });
      if (status === 'RESOLVED' && row.resolvedSpec) {
        const pool = workersBySpec.get(row.resolvedSpec) ?? [];
        const workerId = pool[0];
        if (workerId) {
          const started = new Date(Date.now() - 3 * 3600000);
          const completed = new Date(Date.now() - 2 * 3600000);
          await db.workerTask.create({
            data: {
              incidentId: incident.id,
              workerId,
              status: 'COMPLETED',
              position: 0,
              assignedAt: new Date(started.getTime() - 15 * 60000),
              acceptedAt: started,
              startedAt: started,
              completedAt: completed,
              completionComment: row.completion,
              plannedStart: started,
              plannedEnd: completed,
            },
          });
          await db.incident.update({ where: { id: incident.id }, data: { assignedWorkerId: workerId } });
        }
      }
      if (status !== 'NEW') await db.incidentHistory.create({ data: { incidentId: incident.id, action: `Демо-статус: ${status}`, previousStatus: 'NEW', newStatus: status, actorId: byEmail.get('operator@demo.kz') } });
    }
  }

  // Городские слои: объекты, дорожные камеры, станции воздуха, аварии водоснабжения, ямы.
  await seedCity(db, byEmail);

  if ((await db.publicWarning.count()) === 0) await db.publicWarning.create({ data: { title: 'Сильный ветер на побережье', description: 'Демонстрационное предупреждение: избегайте открытых участков у воды. Не является текущим прогнозом.', severity: 'HIGH', lat: 43.638, lng: 51.154, expiresAt: new Date(Date.now() + 7 * 86400000), isDemo: true } });
  // Показания давления — только у датчиков воды; у станций воздуха свои показания.
  for (const sensor of await db.sensor.findMany({ where: { type: 'WATER' } })) if ((await db.sensorReading.count({ where: { sensorId: sensor.id } })) === 0) await db.sensorReading.create({ data: { sensorId: sensor.id, values: { pressurePreviousBar: 2.9, pressureBar: 1.1, flowAnomalyPercent: 73 }, isDemo: true } });

  return {
    residents: demoAccounts.filter((a) => a.role === 'RESIDENT').length,
    operators: demoAccounts.filter((a) => a.role === 'OPERATOR').length,
    admins: demoAccounts.filter((a) => a.role === 'ADMIN').length,
    workers: demoAccounts.filter((a) => a.role === 'WORKER').length,
    incidents: incidents.length,
  };
}
