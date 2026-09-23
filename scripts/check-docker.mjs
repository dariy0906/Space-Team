import { spawnSync } from 'node:child_process';

function check(args) {
  return spawnSync('docker', args, { encoding: 'utf8' });
}

if (check(['--version']).status !== 0) {
  console.error('Docker не найден в PATH. Установите Docker Engine и Docker Compose на вашем компьютере, затем повторите npm run dev.');
  process.exit(1);
}
if (check(['compose', 'version']).status !== 0) {
  console.error('Docker Compose не найден. Установите пакет docker-compose, затем повторите npm run dev.');
  process.exit(1);
}
const info = check(['info', '--format', '{{.ServerVersion}}']);
if (info.status !== 0) {
  console.error('Docker установлен, но подключение к движку не удалось:');
  console.error(info.stderr.trim() || info.error?.message || 'Неизвестная ошибка');
  if (info.stderr.includes('permission denied')) console.error('Проверьте членство в группе docker и войдите в систему заново.');
  else console.error('Проверьте состояние docker.service.');
  process.exit(1);
}
