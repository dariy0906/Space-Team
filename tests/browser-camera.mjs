import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
assert.match(new URL(process.env.DATABASE_URL || '').pathname, /_test$/);
const db = new PrismaClient();
const origin = process.env.E2E_URL || 'http://localhost:3100';
const b = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const hash = (t) => createHash('sha256').update(t).digest('hex');
async function until(fn, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {}
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('poll timeout');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function login(email, role) {
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  const btn = p.locator('button[name=email][value="' + email + '"]');
  await btn.evaluate((el) => (el.closest('details').open = true));
  await btn.click();
  await p.waitForURL('**/' + role, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
}
async function invite(admin) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.goto(origin + '/admin/cameras', { waitUntil: 'domcontentloaded' });
    const form = admin
      .locator('form')
      .filter({ has: admin.locator('input[name=cameraId]') })
      .first();
    await form.getByRole('button', { name: 'Подключить demo camera', exact: true }).click();
    try {
      const link = admin.locator('a[href*="/camera/"]').first();
      await link.waitFor({ timeout: 8000 });
      const token = (await link.getAttribute('href')).split('/camera/')[1].split('?')[0];
      assert.match(token, /^[a-f0-9]{64}$/);
      assert.ok((await admin.getByAltText('QR подключения камеры').count()) >= 1, 'QR отображается');
      return token;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}
async function phoneFor(token) {
  const ctx = await b.newContext({ permissions: ['camera'], serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto(origin + '/camera/' + token, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
}

try {
  const { p: admin } = await login('admin@demo.kz', 'admin');
  const { p: operator } = await login('operator@demo.kz', 'operator');

  // Operator не может удалённо включить камеру.
  await operator.goto(origin + '/operator/cameras', { waitUntil: 'domcontentloaded' });
  assert.equal(
    await operator.getByRole('button', { name: /Включить|Начать|Start/i }).count(),
    0,
    'оператор не управляет включением камеры',
  );

  // --- Сценарий 1: owner STOP ---
  const token1 = await invite(admin);
  const { p: phone1 } = await phoneFor(token1);
  assert.equal(
    await phone1.locator('video').evaluate((v) => v.srcObject),
    null,
    'до согласия видео не передаётся',
  );
  let s = await db.cameraSession.findUniqueOrThrow({ where: { tokenHash: hash(token1) } });
  assert.equal(s.status, 'INVITED');
  await phone1
    .getByRole('button', { name: 'Разрешить использовать мой телефон как demo camera', exact: true })
    .click();
  await phone1
    .getByText(/камера передаёт видео/)
    .waitFor()
    .catch(async (error) => {
      console.error(await phone1.locator('body').innerText());
      throw error;
    });
  s = await db.cameraSession.findUniqueOrThrow({ where: { tokenHash: hash(token1) } });
  assert.equal(s.status, 'ACTIVE');
  assert.ok(await db.cameraPermission.count({ where: { sessionId: s.id } }), 'consent записан');

  await operator.goto(origin + '/operator/cameras', { waitUntil: 'domcontentloaded' });
  await operator.getByText('LIVE · камера активна', { exact: true }).first().waitFor({ timeout: 60000 });
  await operator
    .waitForFunction(() => document.querySelector('video')?.readyState >= 2)
    .catch(async (error) => {
      for (const [name, p] of [
        ['phone', phone1],
        ['viewer', operator],
      ])
        console.error(
          name,
          await p.locator('body').innerText(),
          JSON.stringify(
            await p
              .locator('video')
              .evaluate((v) => ({
                ready: v.readyState,
                width: v.videoWidth,
                paused: v.paused,
                tracks: v.srcObject
                  ?.getTracks()
                  .map((t) => ({ state: t.readyState, muted: t.muted, settings: t.getSettings() })),
              })),
          ),
        );
      throw error;
    });
  console.log('PASS QR → consent/getUserMedia → ACTIVE → WebRTC remote video');

  await phone1.getByRole('button', { name: /STOP CAMERA/ }).click();
  await phone1.getByText(/STOPPED · камера выключена/).waitFor();
  await until(
    async () =>
      (await db.cameraSession.findUniqueOrThrow({ where: { tokenHash: hash(token1) } })).status === 'STOPPED',
  );
  console.log('PASS owner STOP CAMERA → session STOPPED');

  // --- Сценарий 2: Admin STOP ---
  const token2 = await invite(admin);
  const { p: phone2 } = await phoneFor(token2);
  await phone2
    .getByRole('button', { name: 'Разрешить использовать мой телефон как demo camera', exact: true })
    .click();
  await phone2.getByText(/камера передаёт видео/).waitFor();
  const s2 = await db.cameraSession.findUniqueOrThrow({ where: { tokenHash: hash(token2) } });
  await admin.goto(origin + '/admin/cameras', { waitUntil: 'domcontentloaded' });
  const form = admin.locator('form').filter({ has: admin.locator('input[name=id][value="' + s2.id + '"]') });
  await form.getByRole('button', { name: 'Завершить сессию', exact: true }).click();
  await phone2.getByText(/сессия завершена администратором/).waitFor({ timeout: 20000 });
  assert.equal(
    await phone2.locator('video').evaluate((v) => v.srcObject?.getTracks()[0]?.readyState ?? 'ended'),
    'ended',
  );
  await until(
    async () => (await db.cameraSession.findUniqueOrThrow({ where: { id: s2.id } })).status === 'STOPPED',
  );
  console.log('PASS admin revocation stops phone tracks');

  // --- Сценарий 3: email-приглашение жителю (demo-inbox) ---
  await admin.goto(origin + '/admin/cameras', { waitUntil: 'domcontentloaded' });
  const inviteForm = admin
    .locator('form')
    .filter({ has: admin.locator('input[name=cameraId]') })
    .first();
  await inviteForm.locator('input[name=email]').fill('resident2@demo.kz');
  await inviteForm.getByRole('button', { name: 'Подключить demo camera', exact: true }).click();
  const resident2 = await db.user.findUniqueOrThrow({ where: { email: 'resident2@demo.kz' } });
  const note = await until(
    async () =>
      db.notification.findFirst({
        where: {
          userId: resident2.id,
          href: { startsWith: '/camera/' },
          createdAt: { gt: new Date(Date.now() - 60000) },
        },
      }),
    20000,
  );
  assert.ok(note && note.href.startsWith('/camera/'), 'ссылка на камеру в уведомлении');
  console.log('PASS email invite → demo-inbox notification');
} catch (e) {
  console.error('CAMERA E2E FAILED', e);
  throw e;
} finally {
  await b.close();
  await db.$disconnect();
}
