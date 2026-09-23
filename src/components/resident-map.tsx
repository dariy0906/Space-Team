'use client';
import { useMemo, useState } from 'react';
import { Crosshair, Loader2 } from 'lucide-react';
import type { MapPoint } from './map';
import MapView from './map-view';

export default function ResidentMap({ points }: { points: MapPoint[] }) {
  const [position, setPosition] = useState<MapPoint | null>(null);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  // Своя точка добавляется к событиям одним списком: карта сама подстроит область показа под неё.
  const shown = useMemo(
    () => (position ? [...points.filter(point => point.kind !== 'resident'), position] : points),
    [points, position],
  );

  function locate() {
    if (!navigator.geolocation) {
      setMessage('Геолокация не поддерживается этим браузером');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      result => {
        setLocating(false);
        setPosition({ id: 'my-current-location', title: 'Моё текущее местоположение', subtitle: `Точность ±${Math.round(result.coords.accuracy)} м`, lat: result.coords.latitude, lng: result.coords.longitude, kind: 'resident' });
        setMessage('Ваша позиция показана на карте');
      },
      error => {
        setLocating(false);
        setMessage(error.code === error.PERMISSION_DENIED ? 'Доступ к геолокации запрещён в настройках браузера' : 'Не удалось получить местоположение');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>Карта Актау</h2>
          <span>{points.filter(point => point.kind === 'incident').length} событий в выборке</span>
        </div>
        <button className="text-link" type="button" onClick={locate} disabled={locating}>
          {locating ? <Loader2 size={14} className="spin" /> : <Crosshair size={14} />}
          {locating ? 'Определяем…' : 'Моё местоположение'}
        </button>
      </div>
      {message && <p className="subtle px-4">{message}</p>}
      <MapView points={shown} />
    </>
  );
}
