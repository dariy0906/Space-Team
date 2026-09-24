// Собирает геометрию иконок из lucide-react в src/lib/icon-paths.ts.
// Один и тот же контур нужен и React-разметке, и отрисовке маркеров на canvas карты,
// поэтому геометрия хранится данными, а не компонентами.
// Запуск: node scripts/gen-icon-paths.mjs   (после добавления имени в WANTED)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'node_modules/lucide-react/dist/esm/icons';
const WANTED = [
  // категории происшествий
  'flame', 'cloud-fog', 'swords', 'wind', 'droplets', 'triangle-alert', 'waves', 'mail',
  'construction', 'lightbulb', 'shield-alert', 'trash-2', 'circle-dot',
  // объекты карты
  'hard-hat', 'cctv', 'radio', 'plane', 'locate-fixed', 'map-pin', 'circle-alert',
  'school', 'gauge', 'droplet-off', 'traffic-cone', 'hospital', 'baby', 'users-round', 'navigation-2',
  // интерфейс
  'sun', 'moon',
];

const out = {};
for (const name of WANTED) {
  const src = readFileSync(join(DIR, `${name}.js`), 'utf8');
  const start = src.indexOf('[', src.indexOf('createLucideIcon('));
  const end = src.lastIndexOf(']);');
  // Файл lucide содержит литерал массива с объектами без кавычек у ключей — это валидный JS.
  const node = (0, eval)(`(${src.slice(start, end + 1)})`);
  out[name] = node.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs;
    return [tag, rest];
  });
}

const body = Object.entries(out).map(([name, node]) => `  '${name}': ${JSON.stringify(node)},`).join('\n');
writeFileSync('src/lib/icon-paths.ts', `// Геометрия иконок из lucide-react (ISC). Вынесена в отдельный модуль, потому что одни и те же
// контуры нужны и React-компонентам, и отрисовке маркеров на canvas карты (см. src/components/icons.tsx).
// Файл собран скриптом scripts/gen-icon-paths.mjs и повторяет lucide 1:1 — вручную его не правят.

export type IconShape = [tag: string, attrs: Record<string, string | number>];
export type IconNode = IconShape[];

export const ICONS = {
${body}
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;
`);
console.log(`иконок: ${Object.keys(out).length}`);
