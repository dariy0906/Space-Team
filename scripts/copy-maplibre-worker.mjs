// MapLibre 6 грузит свой web worker отдельным файлом. Под Next.js этот запрос уходит в 404,
// worker не стартует, и ни один GeoJSON-слой (точки, кластеры, трубы) не отрисовывается —
// на карте остаётся только растровая подложка. Кладём worker рядом со статикой и указываем
// на него через maplibregl.setWorkerUrl (см. src/components/map.tsx).
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const target = join(process.cwd(), 'public', 'maplibre');

await mkdir(target, { recursive: true });
// worker импортирует shared по относительному пути, поэтому оба файла лежат рядом.
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(join(dist, name), join(target, name));
}
console.log('MapLibre worker скопирован в public/maplibre');
