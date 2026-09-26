import test from 'node:test';
import assert from 'node:assert/strict';
import { aqiCategory, aqiFromPm25, circlePolygon, estimatePlume, facilitiesWithin, inPlume, windFromLabel } from '../src/lib/city';
import { distanceMeters } from '../src/lib/routing';

test('AQI по PM2.5 совпадает с опорными точками шкалы EPA', () => {
  assert.equal(aqiFromPm25(0), 0);
  assert.equal(aqiFromPm25(9.0), 50);
  assert.equal(aqiFromPm25(35.4), 100);
  assert.equal(aqiFromPm25(35.5), 101);
  assert.equal(aqiFromPm25(55.4), 150);
  assert.equal(aqiFromPm25(125.4), 200);
  assert.equal(aqiFromPm25(1000), 500);
  assert.equal(aqiCategory(42).id, 'GOOD');
  assert.equal(aqiCategory(101).id, 'UNHEALTHY_SENSITIVE');
  assert.equal(aqiCategory(180).id, 'UNHEALTHY');
});

test('ветер: направление «откуда», шлейф уходит в противоположную сторону', () => {
  assert.equal(windFromLabel(90), 'В');
  assert.equal(windFromLabel(359), 'С');
  const station = { lat: 43.66, lng: 51.2 };
  const plume = estimatePlume(station, { directionDeg: 90, speedMs: 4 });
  assert.equal(plume.towardDeg, 270);
  assert.equal(plume.method, 'geometric-estimate');
  // Восточный ветер: точка в 1,5 км к западу — в зоне, к востоку — нет.
  assert.ok(inPlume(station, plume, { lat: 43.66, lng: 51.2 - 0.0186 }));
  assert.ok(!inPlume(station, plume, { lat: 43.66, lng: 51.2 + 0.0186 }));
  // Длина шлейфа ограничена: далеко по ветру — уже вне оценки.
  assert.ok(!inPlume(station, plume, { lat: 43.66, lng: 51.2 - 0.09 }));
});

test('зона аварии: круг нужного радиуса и объекты внутри него по расстоянию', () => {
  const center = { lat: 43.65, lng: 51.16 };
  const ring = circlePolygon(center, 500);
  for (const [lng, lat] of ring) assert.ok(Math.abs(distanceMeters(center, { lat, lng }) - 500) < 2);
  const found = facilitiesWithin(center, 500, [
    { id: 'far', kind: 'SCHOOL', name: 'Далеко', lat: 43.66, lng: 51.16 },
    { id: 'near', kind: 'HOSPITAL', name: 'Рядом', lat: 43.651, lng: 51.16 },
  ]);
  assert.deepEqual(found.map(f => f.id), ['near']);
  assert.ok(found[0].distance > 100 && found[0].distance < 120);
});
