// E2E антифрод-помощника: правила + второе мнение Gemini, выключение ИИ, ключ не уходит в браузер.
// Запуск: E2E_URL=http://localhost:3100 [EXPECT_GEMINI=1 GEMINI_API_KEY=...] node tests/browser-antifraud.mjs
// С EXPECT_GEMINI=1 тест требует, чтобы проверка реально прошла через Gemini (нужны ключ и сеть).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.E2E_URL || 'http://localhost:3100';
const expectGemini = process.env.EXPECT_GEMINI === '1';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const errors = [];
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(u => u.origin !== new URL(url).origin, r => r.abort());
  const p = await ctx.newPage();
  p.setDefaultTimeout(40000);
  p.on('pageerror', e => errors.push(e.message));

  await p.goto(url + '/', { waitUntil: 'domcontentloaded' });
  assert.match(await p.title(), /DigitalAqtau/);
  await p.getByText('DigitalAqtau', { exact: true }).first().waitFor();
  console.log('PASS бренд DigitalAqtau на лендинге');

  await p.goto(url + '/login', { waitUntil: 'domcontentloaded' });
  const button = p.locator('button[name=email][value="resident@demo.kz"]');
  await button.evaluate(el => { const d = el.closest('details'); if (d) d.open = true; });
  await button.click();
  await p.waitForURL('**/resident', { waitUntil: 'domcontentloaded' });
  await p.goto(url + '/antifraud', { waitUntil: 'domcontentloaded' });
  if (process.env.GEMINI_API_KEY) assert.ok(!(await p.content()).includes(process.env.GEMINI_API_KEY), 'ключ Gemini не должен попадать на страницу');

  const toggle = p.getByLabel('ИИ-анализ Gemini');
  const aiAvailable = await toggle.count() > 0;
  if (expectGemini) assert.ok(aiAvailable, 'на сервере должен быть настроен Gemini');

  async function check(sample) {
    await p.getByRole('button', { name: sample, exact: true }).click();
    await p.getByRole('button', { name: 'Проверить', exact: true }).click();
    const badge = p.locator('.verdict-badge');
    await badge.waitFor();
    return { verdict: (await badge.innerText()).trim(), engine: (await p.locator('.engine-badge').innerText()).trim(), aiError: await p.locator('.ai-error').count() };
  }

  const scam = await check('Звонок «из банка»');
  assert.match(scam.verdict, /МОШЕННИКИ/);
  if (expectGemini) {
    assert.equal(scam.aiError, 0, 'Gemini должен ответить');
    assert.match(scam.engine, /Gemini/);
    await p.locator('.opinions').waitFor();
    assert.match(await p.locator('.opinions').innerText(), /ИИ \(gemini/);
  }
  console.log(`PASS мошенничество -> ${scam.verdict} (${scam.engine}${scam.aiError ? ', ИИ недоступен' : ''})`);

  const benign = await check('Обычное сообщение');
  assert.match(benign.verdict, /БЕЗОПАСНО/);
  console.log(`PASS обычное сообщение -> ${benign.verdict} (${benign.engine})`);

  if (aiAvailable) {
    await toggle.uncheck();
    await p.getByText('текст никуда не отправляется').waitFor();
    let apiCalls = 0;
    p.on('request', r => { if (r.url().includes('/api/antifraud')) apiCalls += 1; });
    const local = await check('Фишинговая ссылка');
    assert.match(local.verdict, /МОШЕННИКИ/);
    assert.match(local.engine, /Локальные правила/);
    assert.equal(apiCalls, 0, 'без ИИ текст не отправляется на сервер');
    console.log('PASS ИИ выключен -> только локальные правила, текст не покидает браузер');
  }

  // API не принимает запросы с чужого сайта (нет заголовка Origin этого приложения)
  const foreign = await p.request.post(url + '/api/antifraud', { data: { text: 'тест', country: 'KZ' } });
  assert.equal(foreign.status(), 403);
  console.log('PASS /api/antifraud отклоняет запрос без своего Origin');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
