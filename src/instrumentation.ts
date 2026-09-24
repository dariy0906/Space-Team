export async function register() {
  // Условие должно стоять прямо вокруг импорта: webpack подставляет NEXT_RUNTIME при сборке
  // и выбрасывает ветку для edge. При раннем return он этого не делает, и модуль с node:crypto
  // попадал в edge-сборку — в next dev это роняло все страницы с ошибкой 500.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundJobs } = await import('./instrumentation-node');
    startBackgroundJobs();
  }
}
