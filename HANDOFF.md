# Smart City Aktau — HANDOFF

Актуально на: 2026-09-24. Обновляется после каждого этапа.

## PROJECT OVERVIEW
Hackathon MVP «DigitalAqtau» (ранее SU AQTAU): единая система городского мониторинга и реагирования.
Сквозной сценарий: обращение жителя → решение оператора → назначение работника → маршрут →
выполнение с AFTER-фото → RESOLVED. Второй сценарий: добровольная phone-camera (WebRTC) + CV.

## CURRENT ARCHITECTURE
- Активный продукт: монолит Next.js 15 (App Router) в корне (`src/`, `prisma/`, server actions,
  route handlers, Prisma 6 + PostgreSQL 16). Реального отдельного backend нет.
- `backend/` (NestJS-скелет), `frontend/` (пустой Vite), `nginx/` — legacy, не используются.
- Realtime: SSE `/api/events` из durable-таблицы `RealtimeEvent` (polling 1.5 c), клиент
  `src/components/realtime.tsx` (`EventSource` + `router.refresh()` + периодическая сверка раз в 10 c).
- Роли: RESIDENT / WORKER / OPERATOR / ADMIN. Auth: JWT (jose) в HttpOnly cookie.
- Разделение реального и мока — см. README (REAL / DEMO-MOCK / EXPERIMENTAL / MISSING).

## ENVIRONMENT / COMMANDS
- Docker в текущей песочнице недоступен (пользователь не в группе `docker`). Для тестов
  используется embedded-postgres на `127.0.0.1:55432` (данные в `/tmp/aqtau-runtime/pgdata`).
- Guard: `scripts/reset-demo.ts` отказывается работать при `NODE_ENV=production` без `DEMO_MODE=true`
  и при удалённом хосте БД без `ALLOW_REMOTE_DEMO_RESET=true`.
- Команды:
  - `npm run demo:reset` — очистка demo-таблиц (без drop schema) + seed. Требует `DATABASE_URL`,
    `DEMO_PASSWORD`, `DEMO_MODE`.
  - `npm run db:deploy` — миграции; `npm run db:seed` — только seed (идемпотентный).
  - `npm run build` / `npm run start`; `npm run lint`; `npx tsc --noEmit`.
  - Backend-тесты: `DATABASE_URL=<...aqtau_test> DEMO_MODE=true node_modules/.bin/tsx --test tests/workflow.test.ts tests/worker-queue.test.ts`.
  - Browser E2E: `DATABASE_URL=<..._test> E2E_URL=http://localhost:3100 CHROMIUM_PATH=/usr/bin/chromium node tests/browser-workflow.mjs`.
- Env: DATABASE_URL, SESSION_SECRET, DEMO_PASSWORD, DEMO_MODE, APP_PUBLIC_URL, ROUTING_URL, CV_SERVICE_URL,
  CV_SERVICE_KEY, POSE_MODEL_PATH, DEMO_FALL_TIMEOUT/FALL_TIMEOUT, STUN_URL, TURN_URL, TURN_USERNAME,
  TURN_PASSWORD, SMTP_URL, SMTP_FROM. Секреты не печатать.

## STAGE LOG

### STAGE 1 — СТАБИЛИЗАЦИЯ ДЕМО (DONE, verified)
Изменено:
- `scripts/seed-demo.ts` — единая функция `seedDemo(db)`: 4 resident, 2 operator, 1 admin,
  2 worker на каждую специальность (7×2=14), предсказуемые demo-инциденты, **нет незавершённых
  WorkerTask** (для RESOLVED создаются только COMPLETED-задачи). `prisma/seed.ts` теперь тонкая обёртка.
- `scripts/reset-demo.ts` + `npm run demo:reset` — безопасная очистка demo-таблиц (без DROP) + seed,
  с guard по NODE_ENV/DEMO_MODE/хосту.
- `src/lib/workflow.ts` — `assignIncident`: «заброшенные» задачи (плановое окно в прошлом и статус
  не ON_SITE/ON_THE_WAY) получают позицию после новой задачи и не перепланируются; `advanceTask`
  блокирует только по задачам текущего дня (`plannedStart >= startOfToday` или сама задача).
  Правило последовательного порядка сохранено.
- `src/components/realtime.tsx` — добавлена периодическая сверка раз в 10 c (стабильность live-refresh).
- `tests/worker-queue.test.ts` — новый регрессионный тест.
- `package.json` — скрипт `demo:reset`.

Проверено:
- `npm run demo:reset` → 4 resident / 2 operator / 1 admin / 14 worker / 14 инцидентов / 0 незавершённых задач.
- `tests/workflow.test.ts` + `tests/worker-queue.test.ts` → 2/2 PASS.
- `tests/browser-workflow.mjs` → PASS (полный сценарий), прогнан 4 раза суммарно, стабильно.
- `npm run lint` → PASS; `npx tsc --noEmit` → PASS; `npm run build` → PASS (route list без ошибок).

Известные проблемы:
- Main `.env` указывает на `localhost:5432`, который в этой среде не поднят (Docker недоступен).
  Для тестов использовалась изолированная БД на 55432. Это не влияет на код, влияет на способ запуска.
- E2E-скрипты требуют `DATABASE_URL`, оканчивающийся на `_test`.

### STAGE 2 — ДВА ОПЕРАТОРА (DONE, verified)
Изменено:
- `src/components/realtime.tsx` — периодическая сверка ускорена до 4 c и больше не блокируется
  признаком «есть отправляющаяся форма» (только печать в поле). Устранила редкое зависание
  UI при передаче CRITICAL второму оператору.

Проверено:
- `tests/browser-operators.mjs` → PASS 4/4 прогонов: OFFERED оператору #1 → реальный timeout 20 c
  → TIMEOUT_TRANSFER оператору #2 → operator #2 получает кнопку без refresh → эксклюзивный
  claim/confirm, у operator #1 кнопки нет.
- `tests/workflow.test.ts` → PASS: конкурентный `Promise.allSettled([claim,claim])` даёт ровно
  одного победителя (DB-level row lock), плюс timeout transfer.
- `npm run lint` → PASS; `npx tsc --noEmit` → PASS; `npm run build` → PASS.

Известные проблемы:
- `dispatchCritical` при старте отдаёт ВСЕ новые CRITICAL первому оператору (round-robin крутится
  только после timeout). Для демо это нормально, но оба оператора не получают новые алерты
  одновременно.

### STAGE 3 — PHONE CAMERA / WEBRTC (DONE, verified)
Найдено и исправлено:
- **Баг:** server-action `redirect()` на тот же pathname с другим query (`/admin/cameras?invite=...`)
  молча игнорировался клиентом Next — QR-приглашение фактически не показывалось (сессия создавалась,
  но экран приглашения не открывался). Исправлено выделением отдельного маршрута.
Изменено:
- `src/lib/cameras.ts` — добавлены `CameraState` и `cameraState()` (INVITED/CONNECTING/LIVE/
  DISCONNECTED/EXPIRED/STOPPED).
- `src/app/camera-actions.ts` — после приглашения redirect на `/admin/invite/<token>?delivery=...`.
- `src/app/(dashboard)/admin/invite/[token]/page.tsx` — новый экран: QR, ссылка, состояние сессии,
  STOP CAMERA, срок действия, последний сигнал.
- `src/app/(dashboard)/admin/cameras/page.tsx` — убрана мёртвая QR-ветка, список сессий со статусами.
- `src/components/camera-viewer.tsx` и `src/components/phone-camera.tsx` — явные состояния
  CONNECTING/LIVE/DISCONNECTED/STOPPED (data-state), статус оператора у владельца.
- `tests/browser-camera.mjs` — новый E2E (QR, owner STOP, admin STOP, email demo-inbox,
  «оператор не может включить»).

Проверено:
- `tests/browser-camera.mjs` → PASS 2/2: QR → согласие/getUserMedia → ACTIVE → WebRTC remote video
  у оператора; owner STOP → STOPPED; admin STOP → трeки ended; email-приглашение → demo-inbox.
- `npm run lint` → PASS; `npx tsc --noEmit` → PASS; `npm run build` → PASS.

Известные проблемы:
- Для телефона нужен secure context (HTTPS или localhost). LAN без HTTPS не даст камеру.
  STUN/TURN читаются из env (`STUN_URL`, `TURN_URL/USERNAME/PASSWORD`), TURN не настроен.
- E2E WebRTC выполняется на одной машине (loopback), между разными сетями TURN не проверялся.

### STAGE 4 — REAL FALL DETECTION (DONE, verified)
Изменено:
- `src/components/realtime.tsx` — переход на **автоматическую перезагрузку по SSE-событию** (guarded,
  throttled, с проверкой смены URL и лимитом попыток). Причина: `router.refresh()` в этом окружении
  периодически не применял свежий RSC (`_rsc` abort), из-за чего оператор иногда не видел алерт
  без ручного refresh. Это НЕ ручное действие пользователя. Подробно в разделе REALTIME ниже.
- `services/cv/detectors.py` — калибровка ориентации по оси «плечи→бёдра»; `require_drop` вынесен
  в конфиг (по умолчанию off, т.к. критерий зависит от кадрирования); возвращается честный
  `score` (эвристический detection score) и отдельно `poseVisibility`. Temporal state machine
  (standing→transition→lying→dwell) не переписывался, 4 unit-теста проходят.
- `services/cv/test_video.py` — интеграционный тест на РЕАЛЬНОМ MediaPipe (стоя → лёжа → dwell → событие).
- `src/app/api/camera/[token]/frame/route.ts` — принимает `score`/`poseVisibility`, пишет
  `metadata.detectionScore/poseVisibility/scoreLabel`, описание без медицинских обещаний.
- `src/app/(dashboard)/incidents/[id]/page.tsx` — для CV-падения подпись «Heuristic fall score» и
  отдельно «Pose visibility» вместо единственного «Confidence».

Проверено:
- Python: `test_detectors` 4/4 + `test_video` 2/2 (реальный MediaPipe, `POSE_MODEL_PATH`/`FALL_STAND_IMAGE`) → PASS.
- CV service `/health` ready=true, timeoutSeconds=6 (DEMO_FALL_TIMEOUT).
- `tests/browser-fall.mjs` → PASS 3/3: кадры (стоя/лёжа) → gateway → CV (MediaPipe) → temporal →
  PERSON_FALL/CRITICAL → SSE оператор без ручного refresh; negative-тест без стойки не даёт ложного срабатывания.
- Регрессия: `browser-workflow` 2/2, `browser-operators` 2/2, `browser-camera` 3/3 — PASS.
- `npm run lint`/`tsc --noEmit`/`build` → PASS.

Известные проблемы:
- «Лёжа» кадр в тесте синтезируется поворотом реального фото; реальное fall-видео не проверялось.
- pose.jpg (вне репозитория, `/tmp/aqtau-runtime`) нужен для `test_video`/`browser-fall`; в репозиторий
  бинарные сэмплы не добавлены.

### STAGE 5 — FIGHT DETECTION (DONE as EXPERIMENTAL, verified at unit level)
Изменено:
- `services/cv/detectors.py` — `FightDetector`: заменяемая implementation с интерфейсом
  `update(observations, at)`; temporal-эвристика (>=2 человека, устойчивая motion energy
  >= threshold в течение min_duration), nearest-neighbour сопоставление кадров; результат
  `POSSIBLE_FIGHT` с `score`, `peopleCount`, `durationSeconds`, `method`, `experimental:true`.
  По умолчанию **disabled** (env `ENABLE_FIGHT=true`), Fall не затронут.
- `DetectionPipeline.update_fight(...)` — отдельный путь, Fall state machine не изменён.
- `services/cv/app.py` — health отражает fight; при `ENABLE_FIGHT=true` события fight добавляются
  в ответ `/analyze`; падение по-прежнему single-person.
- `src/app/api/camera/[token]/frame/route.ts` — принимает `POSSIBLE_FIGHT` и создаёт `FIGHT`
  (HIGH, experimental, peopleCount) — срабатывает только при включённом флаге.
- `src/app/(dashboard)/incidents/[id]/page.tsx` — «Heuristic fight score» + «People count».
- `services/cv/test_detectors.py` — 5 новых тестов FightDetector.

Проверено:
- Python: `test_detectors` 9/9 + `test_video` 2/2 → PASS (11/11).
- `npm run build`, `npx tsc --noEmit`, `npm run lint` → PASS.
- Регрессия: `browser-fall` PASS после включения fight-кода (fight disabled по умолчанию).

Известные проблемы / EXPERIMENTAL:
- Реальная 2-персонная валидация Fight через MediaPipe НЕ выполнена: модель с фиксированным
  входом нестабильно детектирует двух человек в одном кадре в этом окружении. Fight остаётся
  экспериментальным и выключенным по умолчанию.
- UI-действия OBSERVE/CONFIRM/FALSE ALARM/ESCALATE маппятся на существующие действия оператора
  (Открыть/Подтвердить/Ложная тревога/Подтвердить+назначить); отдельного fight-специфичного UI нет.

### STAGE 6 — PRODUCTION DEPLOYMENT (code DONE; Docker not runnable in sandbox)
Добавлено:
- `Dockerfile` (multi-stage, production build, `prisma migrate deploy`; seed только при `DEMO_MODE=true`).
- `.dockerignore`.
- `docker-compose.prod.yml` (db + web + cv + Caddy), `Caddyfile` (автоматический HTTPS).
- Полный `.env.example` (DB, SESSION, DEMO_MODE, APP_PUBLIC_URL, ROUTING_URL, STUN/TURN,
  CV_SERVICE_*, POSE_MODEL_PATH, DEMO_FALL_TIMEOUT/FALL_TIMEOUT, ENABLE_FIGHT, SMTP, DOMAIN).
- Исправлен баг приглашения камеры: `inviteCameraAction` больше не делает redirect (в этом окружении
  второй redirect из server action иногда не выполнялся) — результат (QR/ссылка) возвращается через
  `useActionState` и показывается инлайн (`src/components/invite-camera-form.tsx`).

Проверено (что можно без Docker):
- Свежая БД `aqtau_deploy_test` → `prisma migrate deploy` → `db:seed` → `npm run start` → `/login` 200.
- На этом инстансе: `browser-workflow` PASS (полный цикл), `browser-camera` 4/4 PASS.
- `npm run lint` / `npx tsc --noEmit` / `npm run build` → PASS.
Не проверено:
- Реальная сборка/запуск Docker-контейнеров и HTTPS через Caddy: в песочнице нет доступа к docker.sock.
  Требуется проверить на машине с Docker (см. README → Production).

### STAGE 7 — DOCUMENTATION (DONE)
- `README.md` полностью переписан: REAL / DEMO-MOCK / EXPERIMENTAL / MISSING, стек, роли,
  quick start, `demo:reset`, CV-сервис, тесты, production-развёртывание, приватность, ограничения.

## ФИНАЛЬНОЕ СОСТОЯНИЕ / ИЗВЕСТНЫЕ ПРОБЛЕМЫ
- Пользовательская `.env` указывает на localhost:5432 (не поднят в песочнице); тесты шли на
  изолированных БД embedded-postgres (:55432). Это не меняет код.
- `router.refresh()` в этом окружении нестабилен → `src/components/realtime.tsx` использует
  автоматическую перезагрузку по SSE (guarded/throttled, на /admin отключено, не отменяет redirect).
- SMTP не настроен → email-приглашение падает в demo-inbox (уведомление жителя).
- CDN-тайлы карты и OSRM требуют интернета; без сети показываются состояния недоступности.
- CV fall — эвристика; Fight — экспериментальный и выключен.

## NEXT SESSION (если продолжаем)
1. Проверить Docker-развёртывание на машине с Docker (`docker compose -f docker-compose.prod.yml up -d --build`),
   HTTPS-камеру с телефона, TURN между сетями.
2. Добавить сэмпл fall-видео и прогнать `test_video` в CI.
3. При желании — UI-действия OBSERVE/CONFIRM/FALSE ALARM/ESCALATE для fight (после реальной валидации).
4. Трафик/транспорт/ветер — только после стабильного демо.

## NOT IMPLEMENTED / MOCK / EXPERIMENTAL (актуально)
- MOCK: fire/smoke/water-leak monitoring, дроны, датчики, strong wind, public warning (seed, помечено DEMO).
- EXPERIMENTAL: CV Fall Detection (temporal эвристика, confidence = pose visibility, НЕ вероятность падения).
- MISSING: real Fight Detection, traffic, buses/ETA, wind CV, resident navigation, APK, deploy/link.

## DO NOT
- Не переписывать Next/Prisma/SSE/OSRM/auth/migrations.
- Никаких друзей, рейтингов, штрафов, face recognition, авто-звонков 102/103/112, ручного генератора.
- Камера только по явному согласию; отключение владельцем/Admin; оператор не включает камеру.
