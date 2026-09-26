/** Decorative schematic, intentionally not presented as a geographic map. */
export default function CityIllustration() {
  return <div className="city-illustration" aria-hidden="true">
    <svg viewBox="0 0 640 360" fill="none">
      <defs><pattern id="city-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" stroke="currentColor" strokeOpacity=".09"/></pattern></defs>
      <rect width="640" height="360" fill="url(#city-grid)"/>
      <path d="M0 330C110 350 100 210 190 230S240 90 310 100 330 10 410 0H0Z" fill="#19b4b0" fillOpacity=".09"/>
      <path d="M0 330C110 350 100 210 190 230S240 90 310 100 330 10 410 0" stroke="#5de5ce" strokeOpacity=".6" strokeWidth="2"/>
      <g stroke="currentColor" strokeOpacity=".17" strokeWidth="12"><path d="M170 360 460 70 640 250M300 360 560 100M250 200 430 360M350 100 600 350M400 0 640 240"/></g>
      <g fill="#153d4c" stroke="#45818a"><rect x="310" y="203" width="43" height="43" rx="8" transform="rotate(-45 310 203)"/><rect x="400" y="240" width="58" height="58" rx="8" transform="rotate(-45 400 240)"/><rect x="459" y="151" width="38" height="38" rx="6" transform="rotate(-45 459 151)"/></g>
      <path d="m230 290 125-125 110 110 90-90" stroke="#69e3c3" strokeWidth="3" strokeDasharray="7 7"/>
      {[{x:230,y:290},{x:355,y:165},{x:465,y:275},{x:555,y:185}].map(({x,y})=><g key={x}><circle cx={x} cy={y} r="20" fill="#6be3c3" fillOpacity=".12"/><circle cx={x} cy={y} r="7" fill="#81f4d7" stroke="#0b2632" strokeWidth="3"/></g>)}
      <text x="55" y="130" fill="#88b8c2" fontSize="11" letterSpacing="4">CASPIAN SEA</text>
      <text x="415" y="60" fill="#a7d8dd" fontSize="12" letterSpacing="5">AQTAU</text>
    </svg>
    <div className="city-caption"><span className="live-dot"/> SMART CITY · 43.65° N / 51.20° E</div>
  </div>;
}
