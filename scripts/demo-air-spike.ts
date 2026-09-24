// Сценарий живого демо: ухудшение качества воздуха у промзоны. Показание явно смоделировано
// (isDemo = true, в интерфейсе — SIMULATED); дальше система реагирует сама: зона переноса по ветру,
// школы в зоне, предупреждение жителям и уведомления операторам.
// Запуск: npm run demo:air            — резкий рост PM2.5
//         npm run demo:air -- --calm  — вернуть умеренный уровень
import { db } from '../src/lib/db';
import { AIR_SENSOR_TYPE, evaluateAirQuality } from '../src/lib/air-monitor';

const calm = process.argv.includes('--calm');
async function main() {
  const station = await db.sensor.findFirst({ where: { type: AIR_SENSOR_TYPE, name: { contains: 'Промзона' } } });
  if (!station) throw new Error('Станция «Промзона» не найдена: выполните npm run demo:reset');
  const values = calm
    ? { pm25: 18, pm10: 55, no2: 20, windDirDeg: 100, windSpeedMs: 4.5, source: 'demo-simulation' }
    : { pm25: 96, pm10: 310, no2: 74, windDirDeg: 100, windSpeedMs: 5.2, source: 'demo-simulation' };
  await db.sensorReading.create({ data: { sensorId: station.id, isDemo: true, values } });
  const result = await evaluateAirQuality();
  console.log(`${station.name}: PM2.5 ${values.pm25} мкг/м³ [SIMULATED]. Предупреждений: ${result.warnings}, новых событий: ${result.created}`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
