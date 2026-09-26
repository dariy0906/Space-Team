import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('button[value="operator@demo.kz"]').click();
  await page.waitForURL('**/operator');
  await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.getByRole('combobox', { name: 'Язык навигации', exact: true }).selectOption('kk');
  await page.waitForFunction(() => document.documentElement.lang === 'kk');
  await page.goto(`${base}/operator`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Қалалық ортаға шолу' }).waitFor();
  await page.goto(`${base}/operator/incidents`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Барлық оқиғалар' }).waitFor();
  await page.getByRole('button', { name: 'Қолдану' }).waitFor();
  await page.goto(`${base}/pipes`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Ақтау су құбырының сызбасы' }).waitFor();
  await page.goto(`${base}/antifraud`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Хабарламаны тексеру' }).waitFor();
  await page.goto(`${base}/operator/incidents`, { waitUntil: 'domcontentloaded' });
  await page.reload();
  await page.getByRole('heading', { name: 'Барлық оқиғалар' }).waitFor();
  await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('combobox', { name: 'Интерфейс тілі', exact: true }).selectOption('ru');
  await page.waitForFunction(() => document.documentElement.lang === 'ru');
  await page.goto(`${base}/operator/incidents`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Все события' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Kazakh/Russian switching and persistence: OK');
} finally {
  await browser.close();
}
