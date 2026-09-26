// Схема водопровода Актау для первого экрана лендинга: реальные координаты сети, спроецированные в SVG.
import { PIPE_NETWORK, type PipeCondition, type PipeKind } from './pipe-network';

export type LandingPipe = { id: string; d: string; kind: PipeKind; condition: PipeCondition; flow: boolean };
export type LandingMap = { width: number; height: number; pipes: LandingPipe[]; hotspots: { x: number; y: number }[] };

export function landingMap(width = 560): LandingMap {
  const points = PIPE_NETWORK.flatMap(p => p.coords);
  // Границы по 3–97 перцентилям: несколько дальних магистралей не сжимают плотную часть города,
  // а просто уходят за край рамки.
  const lngs = points.map(p => p[0]).sort((a, b) => a - b);
  const lats = points.map(p => p[1]).sort((a, b) => a - b);
  const at = (list: number[], q: number) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
  const minLng = at(lngs, 0.03), maxLng = at(lngs, 0.97);
  const minLat = at(lats, 0.03), maxLat = at(lats, 0.97);
  // Равнопромежуточная проекция с поправкой на широту: на масштабе города искажения не видны.
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const pad = 26;
  const scale = (width - pad * 2) / ((maxLng - minLng) * k);
  const height = Math.round((maxLat - minLat) * scale + pad * 2);
  const xy = ([lng, lat]: [number, number]) => [pad + (lng - minLng) * k * scale, pad + (maxLat - lat) * scale];

  const pipes = PIPE_NETWORK.map((p, i) => ({
    id: p.id,
    kind: p.type,
    condition: p.condition,
    // Бегущий поток рисуем по магистралям и части распределительных линий — иначе схема рябит.
    flow: p.type === 'trunk' || i % 6 === 0,
    d: p.coords.map((c, n) => {
      const [x, y] = xy(c);
      return `${n ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(''),
  }));
  const hotspots = PIPE_NETWORK.filter(p => p.condition === 'critical')
    .filter((_, i) => i % 5 === 0)
    .map(p => {
      const [x, y] = xy(p.coords[Math.floor(p.coords.length / 2)]);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    })
    .filter(h => h.x > 8 && h.x < width - 8 && h.y > 8 && h.y < height - 8);
  return { width, height, pipes, hotspots };
}
