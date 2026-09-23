import { randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

const password = randomBytes(18).toString('hex');
const demoPassword = randomBytes(10).toString('hex');
const secret = randomBytes(48).toString('hex');
const content = [
  'POSTGRES_DB=aqtau_safe',
  'POSTGRES_USER=aqtau',
  `POSTGRES_PASSWORD=${password}`,
  'POSTGRES_PORT=5432',
  'APP_PORT=3000',
  `DATABASE_URL=postgresql://aqtau:${password}@localhost:5432/aqtau_safe?schema=public`,
  `SESSION_SECRET=${secret}`,
  `DEMO_PASSWORD=${demoPassword}`,
  '',
].join('\n');

try {
  const file = await open(join(process.cwd(), '.env'), 'wx', 0o600);
  try { await file.writeFile(content); } finally { await file.close(); }
  console.log('Создан .env со случайными ключами. Демо-пароль:', demoPassword);
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
  console.log('Используется существующий .env');
}
