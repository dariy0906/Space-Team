'use client';
import dynamic from 'next/dynamic';
import type {MapProps} from './map';
const CityMap=dynamic(()=>import('./map'),{ssr:false,loading:()=> <div className="map-loading skeleton">Загрузка карты…</div>});
export default function MapView(props:MapProps){return <CityMap {...props}/>;}

