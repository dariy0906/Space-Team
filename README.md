# DigitalAqtau — Smart City Aktau

Единая цифровая система городского мониторинга и реагирования для Актау.
Сквозной сценарий: **обращение жителя → оператор → назначение работника → маршрут → работа с
AFTER-фото → RESOLVED**. Второй сценарий: добровольная **phone-camera** (WebRTC) с реальным
компьютерным зрением (CV) для возможного падения.

Проект — работающий MVP хакатона: реальный сервер, PostgreSQL, realtime, маршрутизация и AI-Vision.
Ниже честно разделено, что реально, что демо-мок, что экспериментально и чего пока нет.

## Стек и архитектура

- **Next.js 15** (App Router) — UI + server actions + API route handlers (единый сервер).
- **PostgreSQL 16 + Prisma 6** — вся бизнес-логика и данные.
- **SSE** `/api/events` поверх durable-таблицы `RealtimeEvent` (outbox) — обновления без ручного refresh.
- **MapLibre GL JS** — карта Актау (OpenStreetMap/CARTO тайлы).
- **OSRM** — реальный дорожный маршрутинг (без LLM).
- **FastAPI + MediaPipe Pose Landmarker** — отдельный CV-сервис (`services/cv`).
- **WebRTC** — телефон как demo-камера (signaling через PostgreSQL, STUN/TURN из env).
- **Caddy** — автоматический HTTPS в production.

```text
src/app/          страницы, server actions, API-роуты
src/components/   карта, карточки, WebRTC-компоненты, оболочка
src/lib/          auth, Prisma, workflow, dispatch, routing, cameras, events
prisma/           схема, миграции, seed
services/cv/      FastAPI + MediaPipe (fall/experimental fight)
tests/            backend-тесты и браузерные E2E (Playwright)
scripts/          reset-demo, seed-demo, prepare-env
Dockerfile        production-образ
docker-compose.prod.yml + Caddyfile  production-развёртывание
```

> `backend/`, `frontend/`, `nginx/` — заброшенный каркас раннего этапа, не используются.

## Роли

- **RESIDENT** — карта, создание обращения с обязательным фото, свои заявки и статусы, уведомления,
  публичные предупреждения.
- **WORKER** — назначенные задачи, последовательный план дня, маршрут OSRM, обязательный комментарий
  и AFTER-фото.
- **OPERATOR** (2 диспетчера, равные права) — события, подтверждение/отклонение, рекомендации
  исполнителя, назначение, доработка (REOPEN + WorkerViolation), подтверждение решения.
- **ADMIN** — пользователи, смены, специализации, demo-камеры, QR/email-приглашения, аудит.

## Что реально (REAL)

- PostgreSQL как единственный источник истины; миграции и идемпотентный seed.
- Роли и серверная авторизация (`requireUser`, scoping по ролям), загрузка фото (MIME + magic bytes + ACL).
- Сквозной цикл обращения: создание → подтверждение → recommendation по специализации/загрузке →
  назначение → шаги работника → RESOLVED.
- Realtime без ручного refresh (SSE outbox).
- Блокировка события за оператором и **timeout** CRITICAL: demo 20 c / production 60 c, передача
  второму оператору; конкурентный claim сериализуется на уровне БД (`SELECT ... FOR UPDATE`).
- План работника с порядком задач; задача не блокируется «зависшими» задачами прошлых запусков.
- Реальный дорожный маршрут и ETA через OSRM (при недоступности — честное «маршрутизатор недоступен»).
- Before/After фото результата.
- Admin: пользователи/смены/камеры, QR и email-приглашения, STOP камеры.
- **Phone camera (WebRTC)**: QR → consent → getUserMedia → CameraSession ACTIVE → live video у оператора;
  STOP владельцем и Admin; оператор не может включить камеру удалённо.
- **Fall Detection (end-to-end)**: phone → кадры → CV (реальный MediaPipe Pose) → temporal-эвристика
  (стоя → переход → лёжа → выдержка) → `PERSON_FALL` CRITICAL → SSE → оператор. Это **возможное**
  падение, решение принимает оператор.

## DEMO / MOCK (явно помечено в интерфейсе)

Seed-данные, не реальные детекторы (помечены DEMO/MOCK):
пожар, дым, утечка воды, происшествие на воде, дрон-спасение, сильный ветер, датчики, публичные
предупреждения. Реальные детекторы этих классов пока не подключены.

## EXPERIMENTAL

- **Fall Detection** — temporal-эвристика, не обучаемый классификатор и не медицинский вывод.
  В карточке показываются «Heuristic fall score» и отдельно «Pose visibility». Confidence — это
  эвристический detection score, НЕ вероятность падения.
- **Fight Detection** — реализован как экспериментальная temporal-эвристика (движение 2+ человек с
  выдержкой), но **выключен по умолчанию** (`ENABLE_FIGHT=true`). Реальная 2-персонная валидация на
  MediaPipe не завершена.

## MISSING / FUTURE

Пробки (traffic), общественный транспорт и ETA автобуса, оценка ветра по видео, навигация жителя,
push-уведомления, offline-PWA, APK (Capacitor), реальные детекторы fire/smoke/water.

## Антифрод-помощник

Проверка SMS, писем и договоров (`/antifraud`). Локальные правила (порт QuickCheck) работают всегда и
без сети. Если на сервере задан `GEMINI_API_KEY`, текст дополнительно оценивает **Google Gemini**
(`GEMINI_MODEL`, по умолчанию `gemini-3.5-flash-lite`, запасная — `gemini-3.1-flash-lite`):

- итог — более осторожная из двух оценок; в интерфейсе видны обе и подпись «Gemini + правила»;
- ключ используется только на сервере (`/api/antifraud`), в браузер не попадает;
- номера карт и ИИН маскируются до отправки, текст передаётся модели как данные (защита от
  подмены инструкций); статья закона выбирается только из списка УК/КоАП выбранной страны;
- не больше 10 ИИ-проверок в минуту на пользователя; при сбое API показывается вердикт правил
  и причина;
- житель может выключить «ИИ-анализ Gemini» — тогда текст не покидает браузер.

## Умный город: вода, дороги, воздух

Единая карта слоёв у оператора (`/operator`) и жителя (`/resident`): критические события, дороги и ямы,
обращения, вода, воздух (AQI), школы/сады/больницы, камеры, бригады. Клик по объекту открывает карточку
справа, не уходя с карты. Житель видит только публичные события и свои обращения.

| Что | Статус данных |
|---|---|
| Школы, сады, больницы (97 объектов) | **REAL** — OpenStreetMap (ODbL), `scripts/data/aktau-facilities.json` |
| Воздух «Модель CAMS · центр Актау» | **LIVE** — Open-Meteo (модель CAMS, не датчик), обновление раз в 15 мин |
| Станции AQ-01…AQ-03 | **SIMULATED** — показания смоделированы, помечены в интерфейсе |
| AQI | расчёт по PM2.5, шкала US EPA (2024) |
| Зона переноса загрязнения | **оценка** — геометрический сектор по ветру, не модель рассеивания |
| Отключения воды, камеры AKT-011…018 | **DEMO DATA** — размещение и события демонстрационные |
| Детектор ям (`/operator/road`) | **EXPERIMENTAL** — классическая CV-эвристика `road-damage-heuristic-v1`, не нейросеть |

Дорожный конвейер: кадр камеры → CV-сервис `/detect-road` → событие `POTHOLE` «ожидает проверки»
(координаты камеры, рамка, оценка, кадр) → оператор подтверждает → бригада → фото «после». Повторные
обнаружения и жалобы жителей в радиусе 30 м связываются с уже открытой проблемой без дубля. Кадры
городских камер видят только сотрудники, даже если кадр прикреплён к обращению жителя.

Воздух у школ: при AQI ≥ 101 и детских учреждениях в зоне переноса создаётся публичное предупреждение
(с пометкой SIMULATED/LIVE), событие `AIR_QUALITY` и уведомление операторам. SMS/push не отправляются.

### Демо-сценарии

1. **Яма с камеры.** Оператор → «Дороги» → камера AKT-011 → перетащить кадр дороги с ямой →
   «Проанализировать кадр»: рамка на кадре и «Создано событие: ожидает проверки». Кадр с AKT-014
   добавляется к уже открытой жалобе жителя («Добавлено к уже открытой проблеме»).
2. **Воздух у школ.** `npm run demo:air` поднимает PM2.5 на станции AQ-03: на карте растёт зона переноса,
   у жителя появляется предупреждение со списком школ. `npm run demo:air -- --calm` возвращает норму.
3. **Отключение воды.** Слой «Вода»: зона 12 мкр. → карточка со стадией, причиной, сроком
   восстановления и затронутыми школами и больницами.

## Быстрый старт (локально, с Docker)

Нужны Docker с Compose. При первом запуске создастся `.env` со случайными ключами.

```bash
npm run dev        # db + web, миграции, seed, dev-сервер на http://localhost:3000
npm run dev:down   # остановить
```

Без Docker: поднять PostgreSQL, затем

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev:next
```

Демо-вход (пароль из `DEMO_PASSWORD`) либо кнопки быстрого входа при `DEMO_MODE=true`:

| Роль | Email |
| --- | --- |
| Оператор | `operator@demo.kz`, `operator2@demo.kz` |
| Работник | `worker@demo.kz` (+ `worker-<spec>-<n>@demo.kz`) |
| Житель | `resident@demo.kz` … `resident4@demo.kz` |
| Админ | `admin@demo.kz` |

### Сброс демо-базы

Одна команда для предсказуемого старта (4 жителя, 2 оператора, 1 админ, по 2 работника на
специальность, демо-события, без незавершённых задач):

```bash
DEMO_MODE=true npm run demo:reset
```

Guard: команда откажется работать при `NODE_ENV=production` без `DEMO_MODE=true` и на удалённом
хосте БД без `ALLOW_REMOTE_DEMO_RESET=true`. Схема не удаляется, сбрасываются только данные.

## CV-сервис (память/безопасность)

```bash
cd services/cv
python -m pip install -r requirements.txt
POSE_MODEL_PATH=/models/pose_landmarker_lite.task CV_SERVICE_KEY=<shared> DEMO_MODE=true \
  DEMO_FALL_TIMEOUT=8 python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Приложение обращается к сервису по `CV_SERVICE_URL` с `Authorization: Bearer CV_SERVICE_KEY`.
Если CV выключен, видеозвонок работает, а кадры не анализируются (в UI явно написано).

## Тесты

```bash
npm run lint
npx tsc --noEmit
npm run build

# backend (нужна изолированная БД, имя содержит aqtau_test)
DATABASE_URL=<...aqtau_test> DEMO_MODE=true node_modules/.bin/tsx --test tests/workflow.test.ts tests/worker-queue.test.ts

# браузерные E2E (Playwright + Chromium), приложение должно быть запущено
DATABASE_URL=<..._test> E2E_URL=http://localhost:3000 CHROMIUM_PATH=/usr/bin/chromium node tests/browser-workflow.mjs
DATABASE_URL=<..._test> E2E_URL=http://localhost:3000 CHROMIUM_PATH=/usr/bin/chromium node tests/browser-operators.mjs
DATABASE_URL=<..._test> E2E_URL=http://localhost:3000 APP_PUBLIC_URL=http://localhost:3000 CHROMIUM_PATH=/usr/bin/chromium node tests/browser-camera.mjs
DATABASE_URL=<..._test> E2E_URL=http://localhost:3000 CHROMIUM_PATH=/usr/bin/chromium FALL_STAND_IMAGE=/path/person.jpg node tests/browser-fall.mjs
# нужен запущенный CV-сервис (CV_SERVICE_URL у приложения) и кадр дороги с ямой
DATABASE_URL=<..._test> E2E_URL=http://localhost:3000 CHROMIUM_PATH=/usr/bin/chromium ROAD_FRAME=/path/road.jpg node tests/browser-road.mjs

# CV
cd services/cv && python -m unittest test_detectors test_video test_road -v
```

## Production-развёртывание

```bash
cp .env.example .env      # заполнить секреты, APP_PUBLIC_URL и DOMAIN
docker compose -f docker-compose.prod.yml up -d --build
# открыть https://$DOMAIN
```

Компоненты: PostgreSQL, Next.js (production build + `prisma migrate deploy`), Caddy
(автоматический HTTPS). CV для Roboflow webhook выполняется в Roboflow Cloud, не на сервере. Загруженные фото — в named-volume `uploads_data`.

Для камеры телефона обязателен HTTPS-домен в `APP_PUBLIC_URL` (браузер требует secure context;
localhost — исключение). Между разными сетями настройте `TURN_URL/USERNAME/PASSWORD`.

## Конфиденциальность и безопасность

- Камера включается только после явного согласия владельца (`CameraPermission` до статуса ACTIVE);
  владелец и Admin могут остановить; оператор не включает камеру удалённо.
- Роли проверяются на сервере; житель не видит служебные поля, confidence, внутренние комментарии,
  чужие обращения и закрытые камеры.
- Загрузки: тип, размер и magic bytes, отдача через проверку роли; `nosniff`.
- Секреты только в env (`.env` в `.gitignore`); хардкод-секретов нет.
- Нет автоматических вызовов 102/103/112, нет face recognition, друзей и рейтингов.

## Известные ограничения

- CV fall использует эвристику; реальное fall-видео в CI не проверяется (нужен сэмпл).
- Fight detection экспериментальный и выключен.
- Realtime — SSE-поллинг по outbox; при недоступности события страница перезагружается автоматически.
- `dispatchCritical` при старте отдаёт новые CRITICAL первому оператору (ротация — после timeout).
- Единый сервер предполагает один инстанс приложения (in-process таймеры dispatching/expiry).

## Обновление после технического аудита

См. [AUDIT.md](AUDIT.md): архитектурные границы, исправления по файлам,
проверки, ограничения и команды применения. Для быстрой проверки:
`npm run check`, `npm run build`; интеграционные тесты требуют отдельной
`aqtau_test` базы. Старые `backend/` и `frontend/` не относятся к активному приложению.
