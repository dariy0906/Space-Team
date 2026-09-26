import type { CSSProperties } from 'react';

// Мини-иллюстрации для карточек возможностей. Чистый SVG + CSS-анимации (классы vz-* в globals.css);
// при prefers-reduced-motion анимации отключаются.
const box = { viewBox: '0 0 240 132', className: 'vz', 'aria-hidden': true } as const;
const delay = (i: number) => ({ '--i': i }) as CSSProperties;

/** Единая карта: слои складываются в один экран. */
export function LayersVisual() {
  const colors = ['#2b7bd6', '#ef8a17', '#0a9aa8'];
  return (
    <svg {...box}>
      {colors.map((c, i) => (
        <g key={c} className="vz-layer" style={delay(i)}>
          <path d="M120 18 L206 52 L120 86 L34 52Z" transform={`translate(0 ${34 - i * 17})`} fill={c} fillOpacity={0.14 + i * 0.05} stroke={c} strokeWidth="1.5" />
        </g>
      ))}
      {[[100, 30], [136, 40], [118, 50], [150, 28]].map(([x, y], i) => (
        <g key={i} className="vz-ping" style={delay(i)} transform={`translate(${x} ${y})`}>
          <circle r="9" className="vz-ping-ring" />
          <circle r="3.2" className="vz-ping-dot" />
        </g>
      ))}
    </svg>
  );
}

/** Дорожная камера: рамка детектора вокруг ямы и сканирующая линия. */
export function RoadVisual() {
  return (
    <svg {...box}>
      <path d="M96 6 H144 L220 132 H20Z" className="vz-road" />
      <line x1="120" y1="8" x2="120" y2="132" className="vz-lane" />
      <ellipse cx="150" cy="96" rx="18" ry="7.5" className="vz-hole" />
      <rect x="124" y="80" width="52" height="31" rx="5" className="vz-box" />
      <g className="vz-tag">
        <rect x="124" y="64" width="46" height="14" rx="4" />
        <text x="147" y="74.5" textAnchor="middle">яма 98%</text>
      </g>
      <line x1="20" y1="0" x2="220" y2="0" className="vz-scan" />
    </svg>
  );
}

/** Отключение воды: зона расходится от аварии, объекты внутри подсвечиваются. */
export function WaterVisual() {
  return (
    <svg {...box}>
      <g className="vz-grid">
        {[30, 60, 90, 120].map(y => <line key={y} x1="0" y1={y} x2="240" y2={y} />)}
        {[40, 80, 120, 160, 200].map(x => <line key={x} x1={x} y1="0" x2={x} y2="132" />)}
      </g>
      <circle cx="120" cy="66" r="50" className="vz-zone" />
      <circle cx="120" cy="66" r="50" className="vz-zone-wave" />
      <circle cx="120" cy="66" r="50" className="vz-zone-wave late" />
      {[[88, 44], [150, 52], [104, 92], [146, 90]].map(([x, y], i) => (
        <rect key={i} x={x - 6} y={y - 6} width="12" height="12" rx="3" className="vz-facility" style={delay(i)} />
      ))}
      <path d="M120 50 C113 60 110 65 110 70 a10 10 0 0 0 20 0 c0-5-3-10-10-20z" className="vz-drop" />
    </svg>
  );
}

/** Воздух: шкала AQI и ветер, который уносит загрязнение. */
export function AirVisual() {
  return (
    <svg {...box}>
      <path d="M52 112 A68 68 0 0 1 188 112" className="vz-gauge-bg" />
      <path d="M52 112 A68 68 0 0 1 188 112" pathLength={100} className="vz-gauge" />
      <g className="vz-needle"><line x1="120" y1="112" x2="120" y2="62" /><circle cx="120" cy="112" r="6" /></g>
      <text x="120" y="96" textAnchor="middle" className="vz-aqi">AQI</text>
      {[0, 1, 2].map(i => (
        <path key={i} d={`M${14 + i * 22} ${10 + i * 10} q 30 -7 60 0 t 60 0 t 60 0`} pathLength={100} className="vz-wind" style={delay(i)} />
      ))}
    </svg>
  );
}

/** Антифрод: сообщение проверяется, опасная фраза подсвечивается, появляется вердикт. */
export function FraudVisual() {
  return (
    <svg {...box}>
      <rect x="22" y="16" width="150" height="86" rx="14" className="vz-bubble" />
      <path d="M40 102 L34 118 L58 102Z" className="vz-bubble" />
      {[34, 52, 70].map((y, i) => <rect key={y} x="38" y={y} width={[110, 96, 70][i]} height="8" rx="4" className={`vz-line ${i === 1 ? 'danger' : ''}`} />)}
      <rect x="30" y="26" width="134" height="18" rx="6" className="vz-sweep" />
      <g transform="translate(186 70)">
        <g className="vz-shield">
          <path d="M0 -30 L24 -20 V2 C24 18 12 26 0 32 C-12 26 -24 18 -24 2 V-20Z" />
          <path d="M-9 1 L-2 8 L11 -7" className="vz-shield-mark" />
        </g>
      </g>
    </svg>
  );
}

/** Обращение жителя: метка падает на карту, расходится круг. */
export function ReportVisual() {
  return (
    <svg {...box}>
      <rect x="78" y="4" width="84" height="124" rx="16" className="vz-phone" />
      <g className="vz-phone-map">
        <path d="M84 40 H156 M84 70 H156 M100 12 V124 M140 12 V124" />
        <path d="M84 96 C104 84 122 104 156 88" className="vz-phone-road" />
      </g>
      <ellipse cx="120" cy="86" rx="14" ry="4.5" className="vz-pin-shadow" />
      <circle cx="120" cy="86" r="6" className="vz-pin-wave" />
      <g className="vz-pin">
        <path d="M120 86 C110 72 106 66 106 58 a14 14 0 0 1 28 0 c0 8-4 14-14 28z" />
        <circle cx="120" cy="58" r="5" />
      </g>
    </svg>
  );
}

/** Диспетчеризация: бригада едет по маршруту к месту работ. */
export function DispatchVisual() {
  const route = 'M26 104 C62 104 58 44 102 48 S150 96 178 70 S206 30 214 28';
  return (
    <svg {...box}>
      <path d={route} className="vz-route-bg" />
      <path d={route} pathLength={100} className="vz-route" />
      <circle cx="26" cy="104" r="6" className="vz-start" />
      <g transform="translate(214 28)" className="vz-target">
        <circle r="12" className="vz-target-ring" />
        <circle r="5" />
      </g>
      <circle r="7" className="vz-car">
        <animateMotion dur="4.8s" repeatCount="indefinite" path={route} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
      </circle>
      <g className="vz-eta" transform="translate(122 112)">
        <rect x="-38" y="-11" width="76" height="20" rx="10" />
        <text textAnchor="middle" y="3.5">ETA 12 мин</text>
      </g>
    </svg>
  );
}

/** Камера по согласию: запись идёт, пока владелец не нажмёт «Стоп». */
export function CameraVisual() {
  return (
    <svg {...box}>
      <rect x="60" y="30" width="120" height="76" rx="14" className="vz-cam" />
      <rect x="92" y="20" width="36" height="14" rx="5" className="vz-cam" />
      <circle cx="120" cy="68" r="25" className="vz-lens" />
      <circle cx="120" cy="68" r="13" className="vz-lens-inner" />
      <circle cx="113" cy="61" r="4" className="vz-lens-glint" />
      <g className="vz-rec" transform="translate(162 44)"><circle r="5" /></g>
      <g className="vz-consent" transform="translate(120 122)">
        <rect x="-44" y="-10" width="88" height="18" rx="9" />
        <text textAnchor="middle" y="3">по согласию</text>
      </g>
    </svg>
  );
}
