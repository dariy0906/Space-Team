# Аудит и обновление Space-Team

База: `origin/master`, commit `a93e5dfeccdec545ba14e1fcc0d6c8d3cb9b2bd6`.
Рабочая ветка: `codex/audit-upgrade`. Изменения находятся в файлах рабочей копии; commit/push не выполнялись.

## Область и архитектура

Поддерживаемая система — корневой Next.js 15 / React 19 / Prisma 6 и отдельный CV-сервис. `backend/`, `frontend/`, `nginx/` — архивный прототип, уже обозначенный так исходным README. Его независимые `latest`-зависимости не покрываются проверками корневого приложения. Добавлены явные предупреждения в README прототипов.

Вместо массового переноса импортов введены границы функций:

- `src/features/incidents/queue-policy.ts`: чистые правила очереди без БД и React.
- `src/features/media/storage.ts`: файловое хранилище и компенсация при откате транзакции.
- `src/features/preferences/use-preference.ts`: SSR-совместимые настройки, единая подписка между компонентами и вкладками.
- `src/features/navigation/active-navigation.ts`: выбор наиболее точного активного раздела.
- `src/lib/http.ts`: ограниченное потоковое чтение, JSON, проверка origin и типизированные ошибки.
- `src/lib/workflow.ts`: оркестрация транзакций; `src/app/actions.ts` и API остаются входными адаптерами.

Публичные маршруты и схема БД сохранены. Новые миграции для обновления не нужны. Это последовательное выделение модулей, а не завершённая миграция всего проекта в Clean Architecture.

## Исправления

| Приоритет | Проблема | Реализация |
|---|---|---|
| P1 | Realtime уничтожает состояние формы/карты/WebRTC через reload | `router.refresh()`, объединение событий, ожидание завершения редактирования, очистка таймера |
| P1 | Chunked body обходил предварительный Content-Length limit; JSON/null приводили к исключениям | Общий reader считает реальные байты; 400/413; Zod на границе API |
| P1 | Некорректный Origin вызывает исключение; TLS-прокси меняет внутренний URL | Fail-closed сравнение с `APP_PUBLIC_URL`, затем URL запроса |
| P1 | Поздний getUserMedia оставляет камеру после ухода со страницы | Проверка поколения запуска, остановка tracks, освобождение peers и видео |
| P1 | Перепланирование и шаги работника меняют очередь одновременно | Единый lock строки работника; политика очереди выделена и протестирована |
| P1 | Обычная просроченная задача считалась заброшенной демо-задачей | Пропуск допускается только для `isDemo`; движение/работа на месте сохраняют приоритет |
| P1 | Сигналы камеры могли записываться после STOP; rate limit имел count/create race | Проверка актуальной сессии и лимита под одним row lock |
| P1 | Expiration job мог остановить только что ожившую камеру | Повторная проверка heartbeat под lock; STOP идемпотентен |
| P2 | Ошибка workflow оставляет загруженное фото на диске | Компенсирующее удаление нового файла при неудачной транзакции |
| P2 | CV блокирует async event loop вычислением MediaPipe | Вычисление вынесено в threadpool; существующий lock защищает модель |
| P2 | SSE оставляет abort listener, принимает слишком большой cursor | Единая очистка; ограничение cursor; переподключение через 5 минут для повторной auth |
| P2 | Antifraud показывает результат для уже изменённого текста | Отмена отложенного анализа при смене текста/страны и размонтировании |
| P2 | Async cluster zoom завершается после удаления карты | Проверка текущего экземпляра, обработка отказа worker |
| P2 | Координаты невозможно нормально очистить и ввести заново | Отдельные черновики полей и HTML validation |
| P2 | Пароль существующего сотрудника обходил минимальную длину | Серверная проверка обновляемого пароля |
| P2 | Невалидный UUID попадал в Prisma | Проверка UUID перед запросом, 404 |
| P2 | Service worker удалял чужие caches того же origin | Удаление только своего namespace |
| P2 | Docker запускал приложение как root и скрывал ошибку seed | `USER node`; seed failure прерывает старт |

## UI/UX

Сохранён язык продукта: морская бирюза, тёмно-синий каркас и светлые панели. Усилены контраст подписей и статусов, адаптивная типографика, размеры основных кнопок от 44 px, safe-area мобильной навигации, перенос длинных текстов. Микроанимации учитывают reduced-motion.

Добавлены skip-link, `aria-current`, подписи контролов, Escape, focus trap и возврат фокуса мобильного меню. Закрытая боковая панель не попадает в клавиатурную навигацию. Настройки темы синхронизируются с оболочкой без reload; отсутствует перезапись сохранённой темы начальным светлым значением. Недоступный sharing location отключён.

Заявление «x5» не является измеримой метрикой. Подтверждённые улучшения: сохранение клиентского состояния и устранение обнаруженных axe нарушений на проверенных экранах.

## Зависимости и конфликты

Исходный корневой `npm audit`: 9 записей (6 high, 3 moderate). Обновлены PostCSS и tsx; точечные overrides фиксируют PostCSS, Effect, Sharp и DeepmergeTS для Prisma config. Итоговый audit: 0 записей на момент проверки. Override DeepmergeTS пересекает major-границу и должен пересматриваться при обновлении Prisma; совместимость проверяется CLI и тестами, а не только audit.

Не выполнялся `npm audit fix --force`. Prisma CLI и client остались на одной версии. Добавлены `engines`, LF/editorconfig и CI. Маркеры конфликтов не обнаружены; remote master при повторной проверке оставался на исходном commit. Отсутствие конфликтов с будущими изменениями других веток гарантировать нельзя.

## Ограничения и оставшиеся риски

- Полное отсутствие ошибок, утечек и race conditions не доказуемо конечным набором тестов. Длительный нагрузочный/heap-профиль не проводился.
- Docker отсутствует в среде: контейнерная сборка и права существующего volume после перехода на `USER node` требуют проверки. Новые volumes создаются с владельцем node; старый root-owned volume может требовать изменения владельца.
- Полный CV runtime с MediaPipe-моделью, реальным видео и TURN через разные сети не проверен. Проверены детекторные unit-тесты; это не подтверждение точности распознавания падений.
- Python dependency security audit и отдельные dependency trees архивных прототипов не входят в результат `npm audit = 0`.
- Для production ещё нужны согласованные distributed login throttling, политика хранения outbox/фото, наблюдаемость и нагрузочные лимиты. Серверные ошибки Prisma местами продолжают попадать в сообщения форм; нужна единая классификация публичных ошибок.
- Email SMTP не проверен реальной отправкой. Карты и OSRM зависят от внешних провайдеров; офлайн-доступ не реализован.
- Локализация kk затрагивает навигацию, а не весь продукт. Юридическое содержание антифрода не проверялось этим техническим аудитом.
- Архивный backend не предназначен для запуска: в частности, bcrypt для длинного refresh JWT требует отдельного исправления и миграции при возобновлении разработки.

## Применение и Git

Изменённые файлы уже лежат по своим путям. Для другой копии репозитория распакуйте архив обновления поверх того же базового commit. Не переносите `node_modules`, `.env`, `.next` или тестовую БД.

```powershell
# Остановить dev/start перед prisma generate на Windows: DLL клиента блокируется процессом.
npm ci
# Заполнить .env: DATABASE_URL, SESSION_SECRET, APP_PUBLIC_URL и настройки среды.
npx prisma generate
npm run check
npm run build
npm run db:deploy
npm run dev:next
```

Интеграционные тесты запускать только на отдельной базе с именем `aqtau_test`:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/aqtau_test'
npm run db:deploy
npm run test:integration
python -m unittest discover -s services/cv -p test_detectors.py
```

Для браузерных тестов отдельная demo test DB, seed и сервер `localhost:3100`; `DEMO_MODE=true`, `DEMO_PASSWORD` и случайный `SESSION_SECRET`. Не использовать production DB. `browser-workflow` требует свободных demo-работников. `npm run demo:reset` удаляет все данные выбранной БД — допустим только для этой одноразовой тестовой базы.

```powershell
npx playwright install chromium
npm run test:workflow
npm run test:ui
npm run test:camera
```

Можно задать `CHROMIUM_PATH` для установленного Chromium/Edge. Git-команды для уже созданной ветки:

```powershell
git status --short
git diff --check
git diff --stat
git add .
git diff --cached --stat
git commit -m "fix: harden realtime and camera lifecycle; improve accessible UI"
git push -u origin codex/audit-upgrade
```

Перед merge обновить `origin/master` и проверить diff. CI-конфигурация добавлена, но её удалённый запуск произойдёт только после push.

## Проверки

- `npm run check`: ESLint, TypeScript, 5 новых unit-тестов — PASS.
- `npm run build`: production compilation, type checking и генерация страниц — PASS; повторяется после финальных правок.
- `prisma migrate deploy`: все 3 исходные миграции применились на изолированной PostgreSQL 18.4; production Compose использует PostgreSQL 16, в CI проверяется 16.
- `npm run test:integration`: 2/2 — PASS (lifecycle/conflict/photo/reopen, worker queue).
- Python `unittest`: 9/9 — PASS (fall/fight detector policies без MediaPipe runtime).
- `tests/browser-workflow.mjs`: PASS — resident BEFORE photo → operator SSE → assignment → worker SSE → OSRM → AFTER → resident RESOLVED; чужое фото получает 403.
- `tests/browser-operators.mjs`: PASS — реальный timeout 20 секунд, передача второму оператору, exclusive claim/confirm.
- `tests/browser-ui-audit.mjs`: desktop 1440×1000, mobile 390×844, dark settings — 0 axe WCAG A/AA violations, 0 pageerror; проверены Escape, отсутствие горизонтального overflow и сохранение темы.
- `npm audit`: 0 vulnerabilities для root dependency tree. Это результат базы advisories, не доказательство отсутствия уязвимостей приложения.

Скриншоты и JSON проверки доступны в `test-results/` (исключены из Git). Все браузерные проверки выполнялись локально с одноразовыми demo-данными. Живые письма и внешние уведомления не отправлялись.


Архивный `backend/` при отдельном `npm audit --package-lock-only` дал 13 advisory-записей (8 high, 5 moderate); `frontend/` — 0. Эти деревья не устанавливаются и не развёртываются корневым Dockerfile. Для повторного использования backend потребуется отдельное обновление Nest/зависимостей, исправление refresh JWT и прогон его собственной сборки/тестов.

Браузерный `tests/browser-camera.mjs` окончательно прошёл в Playwright Chromium: QR → согласие/getUserMedia → ACTIVE → реальное WebRTC-видео → STOP владельца → отзыв администратором → demo-inbox. Edge со встроенным fake media показывал LIVE соединение без видеокадра; это ограничение проверочной среды, поэтому проверка кадров выполнена в Chromium.

## Исправление dev runtime после локального запуска

Скриншоты от 2026-09-25 показали `Runtime TypeError: __webpack_require__.n is not a function`
при входе в панель. Production-сборка и dev-сервер использовали `.next`; после
переключения сборок открытая вкладка могла загрузить несовместимый webpack chunk.
В `next.config.ts` dev-вывод вынесен в `.next-dev`, production остаётся `.next`.
Добавлены исключения каталога в `.gitignore` и `.dockerignore`, а также типы
в `tsconfig.json`. После перезапуска dev-сервера новая вкладка оператора
открылась без `pageerror` и выдержала повторную загрузку. Для ранее открытой
вкладки требуется принудительное обновление (Ctrl+Shift+R).

## Пересечения с существующими ветками

Это совпадения путей относительно master, а не доказанные текстовые конфликты. Merge не выполнялся.

- `feature/map-pipes-antifraud`: 31 совпадающих изменённых путей: `.dockerignore`, `.gitignore`, `Dockerfile`, `README.md`, `next.config.ts`, `package-lock.json`, `package.json`, `public/sw.js`, `services/cv/app.py`, `src/app/(dashboard)/incidents/[id]/page.tsx`, `src/app/(dashboard)/worker/page.tsx`, `src/app/(dashboard)/worker/route/[id]/page.tsx`, `src/app/actions.ts`, `src/app/api/camera-signal/route.ts`, `src/app/api/camera/[token]/frame/route.ts`, `src/app/api/camera/[token]/route.ts`, `src/app/api/events/route.ts`, `src/app/api/media/[name]/route.ts`, `src/app/api/rtc/route.ts`, `src/app/globals.css`, `src/components/camera-viewer.tsx`, `src/components/location-fields.tsx`, `src/components/map.tsx`, `src/components/phone-camera.tsx`, `src/components/realtime.tsx`, `src/components/shell.tsx`, `src/lib/cameras.ts`, `src/lib/workflow.ts`, `tests/browser-camera.mjs`, `tests/worker-queue.test.ts`, `tests/workflow.test.ts`.
- `feature/smart-city-layers`: 10 совпадающих изменённых путей: `README.md`, `package.json`, `services/cv/app.py`, `src/app/(dashboard)/incidents/[id]/page.tsx`, `src/app/actions.ts`, `src/app/api/media/[name]/route.ts`, `src/app/globals.css`, `src/components/map.tsx`, `src/components/realtime.tsx`, `src/components/shell.tsx`.
- `integrate/camera-and-map`: 0 совпадающих изменённых путей.

## Файлы обновления

Полные версии всех перечисленных файлов находятся в рабочей копии и архиве `test-results/space-team-upgrade.zip`.

| Путь | Группа |
|---|---|
| `.dockerignore` | Документация / конфигурация |
| `.editorconfig` | Документация / конфигурация |
| `.gitattributes` | Документация / конфигурация |
| `.github/workflows/quality.yml` | Регрессионные проверки / CI |
| `.gitignore` | Документация / конфигурация |
| `AUDIT.md` | Документация / конфигурация |
| `Dockerfile` | Документация / конфигурация |
| `README.md` | Документация / конфигурация |
| `backend/README.md` | Документация / конфигурация |
| `frontend/README.md` | Документация / конфигурация |
| `next-env.d.ts` | Документация / конфигурация |
| `next.config.ts` | Документация / конфигурация |
| `package-lock.json` | Документация / конфигурация |
| `package.json` | Документация / конфигурация |
| `public/sw.js` | Документация / конфигурация |
| `services/cv/app.py` | CV service |
| `src/app/(dashboard)/incidents/[id]/page.tsx` | Страницы / server actions |
| `src/app/(dashboard)/worker/page.tsx` | Страницы / server actions |
| `src/app/(dashboard)/worker/route/[id]/page.tsx` | Страницы / server actions |
| `src/app/actions.ts` | Страницы / server actions |
| `src/app/api/camera-signal/route.ts` | API / бизнес-логика |
| `src/app/api/camera/[token]/frame/route.ts` | API / бизнес-логика |
| `src/app/api/camera/[token]/route.ts` | API / бизнес-логика |
| `src/app/api/events/route.ts` | API / бизнес-логика |
| `src/app/api/media/[name]/route.ts` | API / бизнес-логика |
| `src/app/api/rtc/route.ts` | API / бизнес-логика |
| `src/app/globals.css` | UI / lifecycle / accessibility |
| `src/components/antifraud-scanner.tsx` | UI / lifecycle / accessibility |
| `src/components/camera-viewer.tsx` | UI / lifecycle / accessibility |
| `src/components/location-fields.tsx` | UI / lifecycle / accessibility |
| `src/components/map.tsx` | UI / lifecycle / accessibility |
| `src/components/phone-camera.tsx` | UI / lifecycle / accessibility |
| `src/components/realtime.tsx` | UI / lifecycle / accessibility |
| `src/components/settings-controls.tsx` | UI / lifecycle / accessibility |
| `src/components/shell.tsx` | UI / lifecycle / accessibility |
| `src/features/incidents/queue-policy.ts` | Выделенный модуль |
| `src/features/media/storage.ts` | Выделенный модуль |
| `src/features/navigation/active-navigation.ts` | Выделенный модуль |
| `src/features/preferences/use-preference.ts` | Выделенный модуль |
| `src/lib/cameras.ts` | API / бизнес-логика |
| `src/lib/http.ts` | API / бизнес-логика |
| `src/lib/workflow.ts` | API / бизнес-логика |
| `tests/browser-camera.mjs` | Регрессионные проверки / CI |
| `tests/browser-ui-audit.mjs` | Регрессионные проверки / CI |
| `tests/unit/boundaries.test.ts` | Регрессионные проверки / CI |
| `tests/worker-queue.test.ts` | Регрессионные проверки / CI |
| `tests/workflow.test.ts` | Регрессионные проверки / CI |
| `tsconfig.json` | Документация / конфигурация |
