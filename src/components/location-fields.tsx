'use client';
import { useCallback, useMemo, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import MapView from './map-view';
import type { MapPoint } from './map';
import { inAktau } from '@/lib/routing';

const DEFAULT = { lat: 43.653, lng: 51.174 };

export default function LocationFields() {
  const [lat, setLat] = useState(DEFAULT.lat);
  const [lng, setLng] = useState(DEFAULT.lng);
  const [latDraft, setLatDraft] = useState(String(DEFAULT.lat));
  const [lngDraft, setLngDraft] = useState(String(DEFAULT.lng));
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState(false);
  const [locating, setLocating] = useState(false);
  // Клик по карте не должен её перецентрировать — иначе точка «убегает» из-под курсора.
  const [follow, setFollow] = useState(true);

  // Точка передаётся карте как обычный маркер, поэтому она и подсвечивается, и попадает в fitBounds.
  const points = useMemo<MapPoint[]>(
    () => [{ id: 'picked', title: 'Место происшествия', subtitle: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, kind: 'picked' }],
    [lat, lng],
  );

  // Границы — те же, что проверяет сервер (src/lib/validation.ts), поэтому точку за пределами
  // Актау не принимаем: форма всегда отправляет координаты, которые пройдут валидацию.
  const apply = useCallback((nextLat: number, nextLng: number, note: string, recenter = true) => {
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !inAktau({ lat: nextLat, lng: nextLng })) {
      setWarning(true);
      setMessage('Точка за пределами Актау — выберите место в городе.');
      return;
    }
    setFollow(recenter);
    setLat(nextLat);
    setLng(nextLng);
    setLatDraft(String(nextLat));
    setLngDraft(String(nextLng));
    setWarning(false);
    setMessage(note);
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setWarning(true);
      setMessage('Геолокация не поддерживается этим браузером — укажите место на карте');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        apply(Number(position.coords.latitude.toFixed(6)), Number(position.coords.longitude.toFixed(6)), `Позиция определена с точностью ±${Math.round(position.coords.accuracy)} м`);
      },
      error => {
        setLocating(false);
        setWarning(true);
        setMessage(error.code === error.PERMISSION_DENIED ? 'Доступ к геолокации запрещён — укажите место на карте' : 'Не удалось определить координаты — укажите место на карте');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <>
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <div className="wide location-picker">
        <div className="location-picker-head">
          <div>
            <strong><MapPin size={14} /> Место происшествия</strong>
            <span className="subtle">Нажмите на карту или используйте геолокацию</span>
          </div>
          <button className="button secondary" type="button" onClick={locate} disabled={locating}>
            {locating ? <Loader2 size={15} className="spin" /> : <Crosshair size={15} />}
            {locating ? 'Определяем…' : 'Моё местоположение'}
          </button>
        </div>
        <MapView points={points} onPick={(nextLat, nextLng) => apply(nextLat, nextLng, 'Место выбрано на карте', false)} controls={false} cluster={false} autoFit={follow} className="picker-map" />
        <div className="location-picker-foot">
          <label className="field">Широта<input type="number" min="43.57" max="43.78" step="any" required value={latDraft} onChange={event => { setLatDraft(event.target.value); if(event.target.validity.valid && event.target.value) setLat(Number(event.target.value)); }} onBlur={() => { if(latDraft) apply(Number(latDraft), lng, 'Координаты введены вручную'); }} /></label>
          <label className="field">Долгота<input type="number" min="51.08" max="51.30" step="any" required value={lngDraft} onChange={event => { setLngDraft(event.target.value); if(event.target.validity.valid && event.target.value) setLng(Number(event.target.value)); }} onBlur={() => { if(lngDraft) apply(lat, Number(lngDraft), 'Координаты введены вручную'); }} /></label>
        </div>
        {message && <p className={warning ? 'location-warning' : 'subtle'} role="status">{message}</p>}
      </div>
    </>
  );
}
