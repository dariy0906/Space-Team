import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto('http://localhost:3100/login');
  await page.locator('button[value="operator@demo.kz"]').click();
  await page.waitForURL('**/operator');
  await page.locator('.realtime-state.online').waitFor();
  await page.screenshot({ path: 'test-results/operator-desktop.png', fullPage: true });
  const desktop = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.getByRole('button', { name: 'Открыть меню' }).getAttribute('aria-expanded'),
    'false',
  );
  await page.screenshot({ path: 'test-results/operator-mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'no horizontal page overflow',
  );
  const mobile = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await page.goto('http://localhost:3100/settings');
  await page.getByRole('combobox', { name: 'Тема', exact: true }).selectOption('dark');
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  assert.equal(
    await page.getByRole('button', { name: 'Переключить тему' }).getAttribute('aria-pressed'),
    'true',
  );
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.screenshot({ path: 'test-results/settings-dark-mobile.png', fullPage: true });
  const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const report = { desktop: desktop.violations, mobile: mobile.violations, dark: dark.violations, errors };
  await writeFile('test-results/ui-audit.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(report).map(([key, value]) => [
          key,
          key === 'errors'
            ? value
            : value.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
        ]),
      ),
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.equal(
    desktop.violations.length + mobile.violations.length + dark.violations.length,
    0,
    'WCAG A/AA violations',
  );
} finally {
  await browser.close();
}
