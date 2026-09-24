// E2E дорожного конвейера: кадр камеры -> CV-сервис -> событие POTHOLE -> проверка оператором,
// и связывание с жалобой жителя рядом с камерой. Нужны запущенные приложение и CV-сервис.
// Запуск: DATABASE_URL=<..._test> E2E_URL=http://localhost:3100 ROAD_FRAME=<jpg с ямой> node tests/browser-road.mjs
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const url = process.env.E2E_URL || 'http://localhost:3100';
assert.match(new URL(process.env.DATABASE_URL || '').pathname, /_test$/, 'E2E требует базу *_test');
assert.ok(process.env.ROAD_FRAME, 'ROAD_FRAME: путь к кадру дороги с ямой');
const frame = { name: 'frame.jpg', mimeType: 'image/jpeg', buffer: readFileSync(process.env.ROAD_FRAME) };
const db = new PrismaClient();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  await ctx.route(u => u.origin !== new URL(url).origin, r => r.abort());
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(url + '/login', { waitUntil: 'domcontentloaded' });
  const button = p.locator('button[name=email][value="operator@demo.kz"]');
  await button.evaluate(el => { const d = el.closest('details'); if (d) d.open = true; });
  await button.click();
  await p.waitForURL('**/operator', { waitUntil: 'domcontentloaded' });

  // 1. Новая камера: кадр с ямой -> событие «ожидает проверки»
  await p.goto(url + '/operator/road', { waitUntil: 'domcontentloaded' });
  const fresh = await db.camera.findFirstOrThrow({ where: { name: 'AKT-011' } });
  await p.locator('select[name=cameraId]').selectOption(fresh.id);
  await p.locator('input[name=frame]').setInputFiles(frame);
  await p.getByRole('button', { name: 'Проанализировать кадр' }).click();
  await p.getByText('Создано событие: ожидает проверки').waitFor();
  await p.locator('.road-box').first().waitFor();
  const created = await db.incident.findFirstOrThrow({ where: { type: 'POTHOLE', cameraId: fresh.id }, include: { media: true } });
  assert.equal(created.source, 'CAMERA');
  assert.equal(created.status, 'NEW');
  assert.equal(created.lat, fresh.lat, 'координаты события — место установки камеры');
  assert.ok(created.confidence >= 55);
  assert.equal(created.media.length, 1, 'кадр сохранён как фото BEFORE');
  assert.equal(created.metadata.locationPrecision, 'camera');
  await p.screenshot({ path: 'test-results/road-detection.png' });
  console.log('PASS кадр -> CV -> POTHOLE (ожидает проверки) с рамкой и оценкой');

  // 2. Та же проблема: кадр с AKT-014, где житель уже пожаловался, — без дубля
  const linkCam = await db.camera.findFirstOrThrow({ where: { name: 'AKT-014' } });
  const citizen = await db.incident.findFirstOrThrow({ where: { type: 'POTHOLE', source: 'RESIDENT' } });
  const before = await db.incident.count({ where: { type: 'POTHOLE' } });
  await p.goto(url + '/operator/road', { waitUntil: 'domcontentloaded' });
  await p.locator('select[name=cameraId]').selectOption(linkCam.id);
  await p.locator('input[name=frame]').setInputFiles(frame);
  await p.getByRole('button', { name: 'Проанализировать кадр' }).click();
  await p.getByText('Добавлено к уже открытой проблеме').waitFor();
  assert.equal(await db.incident.count({ where: { type: 'POTHOLE' } }), before, 'нового события не создано');
  const linked = await db.incident.findUniqueOrThrow({ where: { id: citizen.id }, include: { media: true, history: true } });
  assert.equal(linked.media.length, 1, 'кадр камеры добавлен к жалобе');
  assert.ok(linked.history.some(h => h.action.includes('AKT-014')));
  console.log('PASS обнаружение камерой связано с жалобой жителя, дубля нет');

  // 3. Подтверждение оператором -> событие уходит в общий workflow ремонта
  await p.goto(url + '/incidents/' + created.id, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: 'Принять в обработку', exact: true }).click();
  await p.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await p.getByText('Принято', { exact: true }).first().waitFor();
  assert.equal((await db.incident.findUniqueOrThrow({ where: { id: created.id } })).status, 'CONFIRMED');
  console.log('PASS оператор подтвердил -> CONFIRMED, доступно назначение бригады');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await db.$disconnect();
}
