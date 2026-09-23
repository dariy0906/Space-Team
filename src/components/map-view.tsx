'use client';
import dynamic from 'next/dynamic';
import type { MapPoint } from './map';
const CityMap = dynamic(() => import('./map'), { ssr: false, loading: () => <div className="map-loading skeleton">Загрузка карты…</div> });
export default function MapView(props: { points: MapPoint[]; route?: [[number, number], [number, number]]; className?: string }) { return <CityMap {...props} />; }
