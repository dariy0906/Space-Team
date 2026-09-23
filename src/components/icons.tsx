import { createElement, type SVGProps } from 'react';
import { ICONS, type IconName, type IconNode } from '@/lib/icon-paths';
import type { IncidentType } from '@prisma/client';
import type { MapPointKind } from '@/lib/map-kinds';

/** Иконка происшествия и иконка объекта на карте — одна и та же геометрия для интерфейса и для карты. */
export const typeGlyph: Record<IncidentType, IconName> = {
  FIRE: 'flame',
  WATER_LEAK: 'droplets',
  PERSON_FALL: 'triangle-alert',
  WATER_RESCUE: 'waves',
  CITIZEN_REPORT: 'mail',
  OTHER: 'circle-dot',
};

export const kindGlyph: Record<MapPointKind, IconName> = {
  incident: 'circle-alert',
  worker: 'hard-hat',
  camera: 'cctv',
  sensor: 'radio',
  drone: 'plane',
  resident: 'locate-fixed',
  picked: 'map-pin',
};

/** Мягкая анимация контура: у каждой иконки своя, поэтому оживает именно то, что имеет смысл двигать. */
const motion: Partial<Record<IconName, string>> = {
  flame: 'glyph-flicker',
  droplets: 'glyph-drip',
  waves: 'glyph-flow',
  'triangle-alert': 'glyph-alert',
  'circle-alert': 'glyph-alert',
  radio: 'glyph-ping',
  plane: 'glyph-hover',
  'locate-fixed': 'glyph-ping',
  'map-pin': 'glyph-drop',
  cctv: 'glyph-scan',
};

function shapes(node: IconNode) {
  return node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }));
}

export type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number;
  /** Включить собственную анимацию иконки. */
  animate?: boolean;
};

export function Glyph({ name, size = 20, animate = false, className = '', ...rest }: GlyphProps) {
  const node = ICONS[name];
  const animation = animate ? motion[name] : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`glyph ${animation ?? ''} ${className}`.trim()}
      {...rest}
    >
      {shapes(node)}
    </svg>
  );
}

export function TypeGlyph({ type, ...rest }: { type: IncidentType } & Omit<GlyphProps, 'name'>) {
  return <Glyph name={typeGlyph[type]} {...rest} />;
}

export function KindGlyph({ kind, ...rest }: { kind: MapPointKind } & Omit<GlyphProps, 'name'>) {
  return <Glyph name={kindGlyph[kind]} {...rest} />;
}
