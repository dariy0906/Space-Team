// Фоновые задачи сервера: передача CRITICAL-событий между операторами и истечение сессий камер.
// Вынесено из instrumentation.ts: там код компилируется и для edge-рантайма, а cameras.ts
// тянет node:crypto, которого в edge нет. Сюда попадаем только из nodejs-ветки.
import { dispatchCritical } from './lib/dispatch';
import { expireCameraSessions } from './lib/cameras';
import { evaluateAirQuality, refreshLiveAir } from './lib/air-monitor';

export function startBackgroundJobs() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const state = globalThis as typeof globalThis & { dispatchTimer?: ReturnType<typeof setInterval> };
  if (state.dispatchTimer) return;
  let running = false;
  state.dispatchTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await dispatchCritical();
      await expireCameraSessions();
    } catch (e) {
      console.error('Dispatch tick failed:', e instanceof Error ? e.message : 'unknown');
    } finally {
      running = false;
    }
  }, 2000);
  state.dispatchTimer.unref();

  // Качество воздуха: свежие модельные данные не чаще раза в 15 минут, проверка порогов у школ.
  let airRunning = false;
  const airTick = async () => {
    if (airRunning) return;
    airRunning = true;
    try {
      await refreshLiveAir().catch(() => false);
      await evaluateAirQuality();
    } catch (e) {
      console.error('Air tick failed:', e instanceof Error ? e.message : 'unknown');
    } finally {
      airRunning = false;
    }
  };
  setTimeout(airTick, 5000).unref();
  setInterval(airTick, 30000).unref();
}
