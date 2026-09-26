import { PrismaClient } from '@prisma/client';
import { seedDemo } from './seed-demo';

const db = new PrismaClient();

function assertSafeTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL не задан');
  const demoMode = process.env.DEMO_MODE === 'true';
  const production = process.env.NODE_ENV === 'production';
  if (production && !demoMode) {
    throw new Error('Отказ: NODE_ENV=production без DEMO_MODE=true. Сброс demo-базы запрещён.');
  }
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error('Не удалось разобрать DATABASE_URL');
  }
  const local = ['localhost', '127.0.0.1', '::1', 'db'].includes(host);
  const allowRemote = process.env.ALLOW_REMOTE_DEMO_RESET === 'true';
  if (!local && !allowRemote) {
    throw new Error(`Отказ: DATABASE_URL указывает на удалённый хост "${host}". Для сознательного сброса задайте ALLOW_REMOTE_DEMO_RESET=true.`);
  }
  if (!demoMode) {
    console.warn('ПРЕДУПРЕЖДЕНИЕ: DEMO_MODE не равен true. Сброс разрешён только потому, что NODE_ENV не production.');
  }
  return { host, raw };
}

async function main() {
  const { host } = assertSafeTarget();
  console.log(`Очистка demo-данных на ${host} ...`);
  await db.$transaction(async (tx) => {
    // Дочерние таблицы первыми, пользователи последними. Схема не удаляется.
    await tx.cameraSignal.deleteMany();
    await tx.cameraPermission.deleteMany();
    await tx.cameraSession.deleteMany();
    await tx.routePlan.deleteMany();
    await tx.workerViolation.deleteMany();
    await tx.incidentAssignment.deleteMany();
    await tx.workerTask.deleteMany();
    await tx.incidentMedia.deleteMany();
    await tx.incidentHistory.deleteMany();
    await tx.citizenReport.deleteMany();
    await tx.notification.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.realtimeEvent.deleteMany();
    await tx.incident.deleteMany();
    await tx.workerSchedule.deleteMany();
    await tx.workerLocation.deleteMany();
    await tx.workerProfile.deleteMany();
    await tx.operatorProfile.deleteMany();
    await tx.residentProfile.deleteMany();
    await tx.sensorReading.deleteMany();
    await tx.sensor.deleteMany();
    await tx.camera.deleteMany();
    await tx.drone.deleteMany();
    await tx.publicWarning.deleteMany();
    await tx.cityFacility.deleteMany();
    await tx.user.deleteMany();
  });
  console.log('Таблицы очищены. Запуск seed ...');
  const summary = await seedDemo(db);
  console.log('Seed завершён:', JSON.stringify(summary));
  console.log('DEMO DB готова: 4 resident, 2 operator, 1 admin, 2 worker на специальность, предсказуемые инциденты, нет незавершённых WorkerTask.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
