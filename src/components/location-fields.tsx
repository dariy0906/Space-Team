'use client';
import { useCallback, useMemo, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import MapView from './map-view';
import type { MapPoint } from './map';

const DEFAULT: { lat: number; lng: number } = { lat: 43.653, lng: 51.174 };
// Границы совпадают с проверкой на сервере (src/lib/validation.ts) — предупреждаем до отправки формы.
const LIMITS = { lat: [42.5, 45], lng: [49, 53] } as const;

function inAktau(lat: number, lng: number): boolean {
  return lat >= LIMITS.lat[0] && lat <= LIMITS.lat[1] && lng >= LIMITS.lng[0] && lng <= LIMITS.lng[1];
}

export default function LocationFields() {
  const [lat, setLat] = useState(DEFAULT.lat);
  const [lng, setLng] = useState(DEFAULT.lng);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  // Точка передаётся карте как обычный маркер, поэтому она и подсвечивается, и попадает в fitBounds.
  const points = useMemo<MapPoint[]>(
    () => [{ id: 'picked', title: 'Место происшествия', subtitle: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, kind: 'picked' }],
    [lat, lng],
  );

  const apply = useCallback((nextLat: number, nextLng: number, note: string) => {
    setLat(nextLat);
    setLng(nextLng);
    setMessage(inAktau(nextLat, nextLng) ? note : 'Точка за пределами Актау — обращение не будет принято. Выберите место в городе.');
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setMessage('Геолокация не поддерживается этим браузером');
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
        setMessage(error.code === error.PERMISSION_DENIED ? 'Доступ к геолокации запрещён — укажите место на карте' : 'Не удалось определить местоположение — укажите место на карте');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const outside = !inAktau(lat, lng);

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
        <MapView points={points} onPick={(nextLat, nextLng) => apply(nextLat, nextLng, 'Место выбрано на карте')} controls={false} cluster={false} className="picker-map" />
        <div className="location-picker-foot">
          <label className="field">Широта<input type="number" step="any" value={lat} onChange={event => apply(Number(event.target.value), lng, 'Координаты введены вручную')} required /></label>
          <label className="field">Долгота<input type="number" step="any" value={lng} onChange={event => apply(lat, Number(event.target.value), 'Координаты введены вручную')} required /></label>
        </div>
        {message && <p className={outside ? 'location-warning' : 'subtle'}>{message}</p>}
      </div>
    </>
  );
}
