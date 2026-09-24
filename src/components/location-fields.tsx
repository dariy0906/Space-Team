'use client';
import {useState} from 'react';
import MapView from './map-view';
import {inAktau} from '@/lib/routing';
export default function LocationFields(){
 const [lat,setLat]=useState('43.653'),[lng,setLng]=useState('51.174'),[message,setMessage]=useState('');
 function pick(a:number,b:number){if(!inAktau({lat:a,lng:b})){setMessage('Выберите точку в Актау');return;}setLat(a.toFixed(6));setLng(b.toFixed(6));setMessage('Точка выбрана');}
 function locate(){if(!navigator.geolocation){setMessage('Геолокация недоступна');return;}navigator.geolocation.getCurrentPosition(p=>pick(p.coords.latitude,p.coords.longitude),()=>setMessage('Не удалось определить координаты. Выберите точку на карте.'));}
 return <><div className="wide"><p className="subtle">Нажмите на карту, чтобы выбрать место</p><MapView className="picker-map" onPick={pick} points={[{id:'selected',title:'Место обращения',lat:Number(lat),lng:Number(lng),kind:'resident'}]}/></div><label className="field">Широта<input name="lat" type="number" min="43.57" max="43.78" step="any" value={lat} onChange={e=>setLat(e.target.value)} required/></label><label className="field">Долгота<input name="lng" type="number" min="51.08" max="51.30" step="any" value={lng} onChange={e=>setLng(e.target.value)} required/></label><div className="wide"><button className="button secondary" type="button" onClick={locate}>◎ Моё местоположение</button><span className="subtle ml-2" role="status">{message}</span></div></>;
}

