// Фоновые задачи сервера: передача CRITICAL-событий между операторами и истечение сессий камер.
// Вынесено из instrumentation.ts: там код компилируется и для edge-рантайма, а cameras.ts
// тянет node:crypto, которого в edge нет. Сюда попадаем только из nodejs-ветки.
import { dispatchCritical } from './lib/dispatch';
import { expireCameraSessions } from './lib/cameras';

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
}
