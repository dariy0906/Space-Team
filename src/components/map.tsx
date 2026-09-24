'use client';
import {useEffect,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource,Map as MlMap} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {severityColor} from '@/lib/labels';
import type {Severity,IncidentType} from '@prisma/client';
export type MapPoint={id:string;title:string;lat:number;lng:number;severity?:Severity;type?:IncidentType;kind:'incident'|'worker'|'camera'|'sensor'|'drone'|'resident';subtitle?:string};
export type MapProps={points:MapPoint[];route?:[number,number][];className?:string;onPick?:(lat:number,lng:number)=>void};
const collection=(points:MapPoint[]):GeoJSON.FeatureCollection=>({type:'FeatureCollection',features:points.map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{...p,color:p.severity?severityColor[p.severity]:p.kind==='worker'?'#10b981':'#0ea5e9'}}))});
export default function CityMap({points,route,className='',onPick}:MapProps){
 const el=useRef<HTMLDivElement>(null),ref=useRef<MlMap|null>(null),latest=useRef({points,route,onPick});latest.current={points,route,onPick};
 const [dark,setDark]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const update=()=>setDark(document.documentElement.classList.contains('dark'));update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!el.current)return;
  let map:MlMap;
  try {map=new maplibregl.Map({container:el.current,center:[51.174,43.653],zoom:12,pitch:0,maxBounds:[[51.04,43.54],[51.34,43.81]],style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:{base:{type:'raster',tiles:[dark?'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png':'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors · © CARTO'}},layers:[{id:'base',type:'raster',source:'base'}]}});}catch{setError('Карта недоступна: браузер не поддерживает WebGL');return;}
  ref.current=map;map.addControl(new maplibregl.NavigationControl({visualizePitch:true}));
  map.on('error',()=>setError('Не удалось загрузить часть карты. Проверьте интернет.'));
  map.on('load',()=>{
   setError('');
   map.addSource('points',{type:'geojson',data:collection(latest.current.points),cluster:true,clusterRadius:40});
   map.addLayer({id:'clusters',type:'circle',source:'points',filter:['has','point_count'],paint:{'circle-color':'#0e7490','circle-radius':22,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   map.addLayer({id:'count',type:'symbol',source:'points',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':13,'text-font':['Open Sans Regular']},paint:{'text-color':'#fff'}});
   map.addLayer({id:'markers',type:'circle',source:'points',filter:['!',['has','point_count']],paint:{'circle-color':['get','color'],'circle-radius':9,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:latest.current.route||[]}}});
   map.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#06b6d4','line-width':5}});
   map.on('click','markers',e=>{const f=e.features?.[0];if(!f||f.geometry.type!=='Point')return;const p=f.properties;const div=document.createElement('div');div.className='map-popup';const title=document.createElement('strong');title.textContent=p.title;div.append(title,document.createElement('br'),document.createTextNode(p.subtitle||''));if(p.kind==='incident'){const a=document.createElement('a');a.href='/incidents/'+p.id;a.textContent='Открыть событие →';div.append(document.createElement('br'),a);}new maplibregl.Popup().setLngLat(f.geometry.coordinates as [number,number]).setDOMContent(div).addTo(map);map.easeTo({center:f.geometry.coordinates as [number,number]});});
   map.on('click','clusters',async e=>{const f=e.features?.[0];if(!f||f.geometry.type!=='Point')return;const zoom=await (map.getSource('points') as GeoJSONSource).getClusterExpansionZoom(Number(f.properties?.cluster_id));map.easeTo({center:f.geometry.coordinates as [number,number],zoom});});
   map.on('click',e=>latest.current.onPick?.(e.lngLat.lat,e.lngLat.lng));
  });
  return()=>{ref.current=null;map.remove();};
 },[dark]);
 useEffect(()=>{const map=ref.current;if(!map?.isStyleLoaded())return;(map.getSource('points') as GeoJSONSource)?.setData(collection(points));},[points]);
 useEffect(()=>{const map=ref.current;if(!map?.isStyleLoaded())return;(map.getSource('route') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:route||[]}});if(route?.length){const b=new maplibregl.LngLatBounds();route.forEach(p=>b.extend(p));map.fitBounds(b,{padding:50,maxZoom:15});}},[route]);
 return <div className="map-wrap">{error&&<p className="map-error" role="status">{error}</p>}<div ref={el} className={'city-map '+className} aria-label="Карта Актау"/></div>;
}

