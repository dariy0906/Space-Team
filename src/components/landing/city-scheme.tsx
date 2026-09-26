import type { CSSProperties } from 'react';
import type { LandingMap } from '@/lib/landing-map';

// Анимированная схема сети: линии «прорисовываются» при загрузке, по магистралям бежит поток,
// аварийные участки пульсируют. Только SVG и CSS, без скриптов.
export default function CityScheme({ map }: { map: LandingMap }) {
  return (
    <svg className="scheme" viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Схема водопровода Актау: аварийные участки отмечены пульсирующими точками">
      <defs>
        <linearGradient id="scheme-trunk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <g className="scheme-pipes">
        {map.pipes.map((p, i) => (
          <path key={p.id} d={p.d} pathLength={1} className={`pipe ${p.kind} c-${p.condition}`} style={{ '--i': i % 24 } as CSSProperties} />
        ))}
      </g>
      <g className="scheme-flow">
        {map.pipes.filter(p => p.flow).map((p, i) => (
          <path key={p.id} d={p.d} pathLength={100} className={`flow ${p.kind}`} style={{ '--i': i % 8 } as CSSProperties} />
        ))}
      </g>
      {map.hotspots.map((h, i) => (
        <g key={`${h.x}-${h.y}`} className="hotspot" transform={`translate(${h.x} ${h.y})`} style={{ '--i': i } as CSSProperties}>
          <circle r="14" className="hotspot-ring" />
          <circle r="14" className="hotspot-ring late" />
          <circle r="3.6" className="hotspot-dot" />
        </g>
      ))}
    </svg>
  );
}
