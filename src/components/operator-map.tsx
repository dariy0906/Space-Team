'use client';
import {useState} from 'react';
import MapView from './map-view';
import type {MapPoint} from './map';
const layers={incident:'События',worker:'Работники',camera:'Камеры',sensor:'Датчики',drone:'Дроны',resident:'Обращения'};
export default function OperatorMap({points}:{points:MapPoint[]}){const [hidden,setHidden]=useState<string[]>([]);return <><div className="map-legend">{Object.entries(layers).map(([k,v])=><label key={k} className="flex items-center gap-1"><input type="checkbox" checked={!hidden.includes(k)} onChange={()=>setHidden(hidden.includes(k)?hidden.filter(x=>x!==k):[...hidden,k])}/>{v}</label>)}</div><MapView points={points.filter(p=>!hidden.includes(p.kind))}/></>;}

