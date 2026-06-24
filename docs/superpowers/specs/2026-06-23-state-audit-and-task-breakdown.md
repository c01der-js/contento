# Contento — аудит состояния, обновлённый roadmap и разбивка задач (2026-06-23)

> Источник правды — **код**, проверенный по файлам и строкам (6 параллельных аудитов: docs, db/migrations, apps/api, apps/web, воркеры+ai+platforms, python+infra+CI). `progress.txt` (последняя запись 2026-05-18) и `reconciled-roadmap.md` (2026-06-15) **устарели** и не отражают реального состояния. Самый свежий сигнал — git-история (HEAD `a565678`) и сам код.
> Легенда оценок (человеко-время): **S** ≤1 день · **M** 2–4 дня · **L** 1–2 недели. CC = с Claude Code время кратно меньше.

---

## 0. TL;DR — что изменилось относительно плана

**Главный вывод: весь продуктовый roadmap из `reconciled-roadmap.md` уже построен в коде, кроме Remotion Lambda.** Документ описывал последовательность «P0 → Plan A → Plan B → QA-гейт → PostAnalytics → feedback loop → Lambda» как *план*. По факту в коде:

| Этап плана | Статус по коду | Доказательство |
|---|---|---|
| P0 — публикация видео end-to-end | ✅ построено | `posting-service/worker.ts:113-235`, presign `:171-177`, VK удалён (`platforms/factory.ts:44`) |
| Plan A — per-platform | ✅ построено (но как статические профили, без DB-модели/UI) | `shared/platform-profiles.ts:18`, фан-аут `api/routes/campaigns.ts:235-243` |
| Plan B — multi-format (avatar/broll/screencast) | ✅ построено | `video-worker/worker.ts:160-202`, split по `formatMix` `ai/agents/video-storyboard.ts:67-81` |
| Plan B2 — screencast (синтетические Remotion-экраны) | ✅ построено | `video-worker/stitch-props.ts:142` |
| QA-гейт (QaCheck PASS/WARN/BLOCK) | ✅ построено | `qa/checks.ts:29`, BLOCK → 400 `routes/campaigns.ts:303-309`, бейдж `web/components/qa/QaBadge.tsx` |
| PostAnalytics (PublicationMetric, 24ч poll) | ✅ построено, но данные только по YouTube | `analytics-ingester.ts:48-90`, метрики null для IG/TikTok/TG/LI |
| Feedback loop (golden examples + pgvector) | ✅ построено | embed скриптов/голденов на создании, авто-промоушн `analytics-ingester.ts:101-135`, инъекция `scriptwriter.ts:59-68` + `idea-generator.ts:19-30` |
| Remotion Lambda | ❌ **не построено** (только план + runbook, кода нет) | 0 совпадений `@remotion/lambda`/`renderMediaOnLambda` в репо |

**Что это значит для приоритетов.** Старый roadmap был отсортирован по «что строить». Раз фичи построены, связывающее ограничение сместилось с разработки на **эксплуатацию и данные**:

1. 🔴 **Прод УЖЕ задеплоен — и сейчас небезопасен.** Деплой на живой VPS работает (push в main → деплой), но compose публикует БД и **неаутентифицированный Redis** на `0.0.0.0` → они **прямо сейчас открыты в интернет**. Это не будущий гейт, а активная уязвимость (INFRA-1, срочно). Образ video-worker не провалидирован.
2. **Вэдж слепой** — feedback loop построен, но реальные метрики приходят только из YouTube. Для целевого рынка (диаспора+СНГ на IG/TikTok) нужен app-audit, иначе петля учится «на пустоте».
3. **Долг по миграциям/CI** — baseline-сквош сделан и провалидирован вручную, но CI не гоняет миграции/дрейф и не блокирует деплой; HNSW-индексы pgvector отложены.
4. **Продуктовый лоск под рынок** — UI преимущественно на английском (рынок русскоязычный), нет UI для PlatformProfile, QA-бейдж виден только в campaign-флоу.
5. **Код-долг** — 4 «осиротевших» AI-агента, `whisper-py`/`ml-py` — заглушки, `mentions` Kafka-топик в тупике.

**Новая последовательность (обоснование ниже): Сделать запускаемым (деплой+безопасность) → Дать вэджу зрение (решение по метрикам/app-audit) → Закалить (CI/миграции) → Локализовать под рынок (i18n/UI) → Подчистить долг → Lambda когда объём оправдает.**

---

## 1. Текущее состояние

### 1.1 Что работает (построено и провязано)
Полный цикл **Trend → Idea → Script → Brand Check → QA → Publish** реализован сквозняком, не каркас:
- **Backend (apps/api):** все роут-группы живые (trends/ideas/scripts/review/social/schedule/render/video/campaigns/analytics/library/…). Публикация: атомарный claim → `createPublisher().publish()` → переходы PENDING→PUBLISHING→PUBLISHED/FAILED, захват `platformPostId`, presign приватных S3-URL.
- **Воркеры:** `posting-service`, `render-worker` (локальный Remotion still), `video-worker` (storyboard→shots→stitch, **profile-gated**, реальные вызовы Higgsfield/ElevenLabs + Remotion-монтаж с субтитрами), `scheduler` (scheduled-publish + OAuth-refresh + дайджест), `trend-analyzer` + `trend-fetcher` (8 источников, реальные API).
- **AI-агенты:** все живые делают реальные вызовы Anthropic; инъекция golden-примеров в scriptwriter и idea-generator подтверждена.
- **Платформы:** 5 реальных адаптеров `publish()` — telegram/instagram/tiktok/youtube/linkedin. **VK полностью удалён** (P0 Task 5 ✅).
- **Web (apps/web):** все экраны провязаны на реальный API (`NEXT_PUBLIC_API_URL`), заглушек/моков нет: dashboard, trends, create (полный цикл ~1600 строк), create/manual, brand (11 вкладок), review + review/campaigns/[id] (QA-бейдж), calendar (drag&drop), analytics, library, studio (campaigns + onboarding), settings.
- **DB:** 48 моделей. Все ключевые под roadmap присутствуют: `QaCheck`, `PublicationMetric`, `Script.embedding vector(1536)`, `GoldenExample.sourceScriptId/promotedAt/embedding`, `VideoJob`/`VideoShot`, `Campaign.targetPlatforms`, `Approval`, `Notification`, `Integration`.
- **Миграции:** история сквошнута в один валидированный baseline (`20260623000000_baseline_squash/migration.sql`, 48 таблиц / 30 enum / 89 индексов / 69 FK); старые 18 миграций (были нереплейабельны из-за db:push-дрейфа) архивированы. Закоммичено в `a565678`, рабочее дерево чистое.

### 1.2 Построено, но с ограничением / частично
- **Plan A per-platform** — реализован как статические профили в `packages/shared/platform-profiles.ts`, **DB-модели `PlatformProfile` нет** и **нет UI** для пер-платформенного тона/формата/времени. (DB-агент подтвердил: модели `PlatformProfile` в схеме нет.)
- **PostAnalytics** — инфраструктура полная, но `fetchMetrics()` возвращает реальные данные **только для YouTube**; IG/TikTok/Telegram/LinkedIn → `null` (по дизайну, нужен app-audit/Business-аккаунт; TG Bot API скрывает просмотры).
- **Feedback loop** — построен, но (а) питается метриками только из YouTube; (б) cold-start порог авто-промоушена в коде `MIN_PUBLICATIONS_FOR_PROMOTION=5` (`analytics-ingester.ts:92`), а стратегия говорит ~20 — расхождение; (в) в UI только *ввод* golden/anti-примеров, *выход* петли (как метрики возвращаются в генерацию) не визуализирован.
- **QA-гейт** — проверки lip-sync confidence и visual-clipping намеренно `skip` (`qa/checks.ts:74-75`) — нет источника сигнала. QA-бейдж показывается только на campaign-review, не в основном create/review.

### 1.3 Не построено
- **Remotion Lambda** — только план (`plans/2026-06-19-remotion-lambda.md`) + runbook; кода нет (`renderStitchOnLambda`, `scripts/deploy-lambda.ts`, dep `@remotion/lambda` отсутствуют).
- **whisper-py** — пустой стаб (только README + пустой requirements.txt; нет src/Dockerfile/compose-сервиса). Субтитры реально делает ElevenLabs `/with-timestamps`, не whisper.

### 1.4 Техдолг и блокеры (сгруппировано)

**Инфра / деплой / безопасность (деплой УЖЕ живой → риски активны, не гипотетичны):**
- 🔴🔴 **АКТИВНАЯ уязвимость:** деплой на VPS работает, но `infra/docker-compose.yml` публикует postgres/redis/kafka/minio/clickhouse на `0.0.0.0` → БД и **неаутентифицированный Redis открыты в интернет на работающем сервере прямо сейчас**. Закрыть немедленно (INFRA-1).
- 🟢 SSH deploy-ключ + GitHub-секреты + VPS — **сделано** (подтверждено: push в main деплоится). Остаётся аудит: дефолтные ли пароли Postgres/MinIO, корректно ли заполнен `infra/.env` (INFRA-2 → аудит, не настройка с нуля).
- 🟠 Docker-образ `video-worker` не провалидирован (риск Remotion chrome-headless-shell на Alpine) + tsconfig-paths хак форсит нестандартный entrypoint `dist/apps/video-worker/src/index.js`. Проверить, поднят ли вообще `video`-профиль на проде.

**CI / миграции:**
- 🟠 `deploy.yml` и `ci.yml` оба триггерятся на push в main **независимо и параллельно** — красный CI **не блокирует** деплой.
- 🟠 CI не поднимает Postgres, не гоняет `migrate deploy`, нет drift-гейта (`migrate diff --exit-code`) → db:push-дрейф (тот, что сломал старую историю) может тихо вернуться. Docker-образы в CI не собираются.
- 🟡 HNSW-индексы pgvector на `GoldenExample.embedding`/`Script.embedding` отложены (Prisma не моделирует индексы на `Unsupported()`); два дока (`migrations/README.md` и `deploy-setup.md`) расходятся в именах/полях индексов. Норм при beta-объёме (<10k векторов), но надо согласовать и применить raw-SQL при росте.

**Данные вэджа:**
- 🔴 (стратегически) feedback loop слепой вне YouTube — см. 1.2. Это решает судьбу всего вэджа на целевом рынке.

**Код-долг (мелкий):**
- 🟡 4 осиротевших AI-агента: `cover-concept` и `storyboard` (заменены `variant-generator`/`video-storyboard`), `music-suggester`, `viral-analyzer` — экспортируются, но не вызываются.
- 🟡 `trend-fetcher` tiktok/x не workspace-scoped (глобальные тренды во все воркспейсы).
- 🟡 `ml-py` — обучение мок-онли (`NotImplementedError` без `LORA_MOCK_TRAINING`; compose дефолтит на фейковые веса).
- 🟡 `mentions` Kafka-топик — тупик (нет TS-консьюмера; единственный сток — строка в Postgres).
- 🟡 `scrapers-py` README устарел (заявляет TikTok/X-источники, которых нет в коде).
- 🟡 Publication хранит только `platformPostId`, не полный `publication_url` (URL только в Kafka-событии).
- 🟡 Web: нет общего API-клиента (`apiFetch` скопирован в ~20 файлов).

**Документация:**
- 🟡 `reconciled-roadmap.md`, `progress.txt`, `CLAUDE.md` устарели (не упоминают `video-worker`, `packages/notifications`, `whisper-py`; описывают как «план» уже построенное).

---

## 2. Обновлённый roadmap (и почему он изменился)

**Почему меняем.** Старый roadmap вёл от «построить вэдж» к «построить per-platform/multi-format». Это сделано. Теперь система не запускается безопасно и петля не получает данные — значит приоритет смещается с *фич* на *эксплуатацию + топливо для петли*.

```
Фаза R0 — Сделать запускаемым и безопасным   (P0)
  INFRA-1 firewall/rebind портов + пароли  →  INFRA-2 VPS+secrets+.env  →  INFRA-3 валидация video-worker образа
        ↓
Фаза R1 — Дать вэджу зрение + закалить        (P1)
  BE-3 IG/TikTok метрики (✅ app-audit — заявки СЕЙЧАС)        CI: INFRA-4 gate деплоя, INFRA-5 migrate+drift
  BE-1 HNSW-индексы   BE-2 cold-start порог   QA-1 lip-sync/clipping   QA-2 QA-бейдж в основном флоу
        ↓
Фаза R2 — Лоск под рынок                        (P1/P2)
  FE-1 двуязычный RU+EN (✅)   FE-2 PlatformProfile UI   FE-3 feedback-loop surface   DESIGN-1/2
        ↓
Фаза R3 — Подчистить долг                        (P2)
  BE-4 publication_url   BE-5 ws-scoping трендов   BE-6 orphaned-агенты   BE-7 mentions
  QA-3 интеграционные тесты   QA-4 E2E   FE-4 API-клиент   ML-1/2/3   DOC-1
        ↓
Фаза R4 — Масштаб рендера                        (P2, по необходимости)
  RENDER-SCALE горизонтальные реплики self-hosted воркеров (БЕЗ AWS) — Lambda отклонён
```

**Что именно изменилось vs `reconciled-roadmap.md`:**
- Lambda остаётся последней — без изменений.
- Всё, что док считал «впереди» (QA-гейт, PostAnalytics, feedback loop, Plan A/B), **переехало в «сделано»**.
- Новые фазы R0 (запуск/безопасность) и R3 (долг) в старом доке отсутствовали — они всплыли потому, что фичи опередили эксплуатацию.
- Решение по метрикам app-audit (док пометил «revisit») стало **блокером ценности вэджа**, а не отложенной заметкой.

---

## 3. Задачи по областям (готовы к раздаче)

> Внутри каждой области отсортировано по приоритету. «Кому подходит» = требуемый профиль исполнителя (выводится из задачи, не из предположений о команде).

### ИНФРА / DevOps

**INFRA-1 — Закрыть сетевую экспозицию инфраструктуры**
- Область: Инфра/безопасность
- Описание: compose публикует postgres/redis/kafka/minio/clickhouse на `0.0.0.0` — БД и неаутентифицированный Redis открыты в интернет. Зафаерволить (ufw allow только 22/3000/3001) или перебиндить data-порты на `127.0.0.1`; сменить дефолтные пароли Postgres/MinIO.
- Критерии приёмки: ☐ внешний `nmap`/`telnet` на 5432/6379/9092/9000/8123 с другого хоста — отказ ☐ web:3000 и api:3001 доступны ☐ пароли не дефолтные ☐ задокументировано в runbook
- Приоритет: **P0 — СРОЧНО** (деплой живой → порты открыты сейчас, это активная уязвимость) · Оценка: **S** (CC: ~1ч) · Зависимости: доступ к VPS уже есть (деплой работает)
- Кому подходит: middle+ DevOps/backend, базовый Linux-firewall

**INFRA-2 — Аудит существующего деплоя (пароли / .env / S3)**
- Область: Инфра/деплой
- Описание: деплой уже живой, поэтому это **аудит, не настройка с нуля**. Проверить: не дефолтные ли пароли Postgres/MinIO; корректно ли заполнен `infra/.env` (S3_BUCKET, ANTHROPIC_API_KEY, OPENAI_API_KEY для эмбеддингов — иначе мок, Clerk, Higgsfield/ElevenLabs/YouTube); реальный ли S3/CDN или localhost MinIO (важно для внешней доступности медиа); запущены ли нужные профили (`video`, scrapers/analytics/mentions).
- Критерии приёмки: ☐ пароли не дефолтные ☐ `infra/.env` полон и валиден ☐ медиа доступно платформам (presign резолвится извне) ☐ нужные профили подняты ☐ `docker compose ps` healthy
- Приоритет: **P0** · Оценка: **S** · Зависимости: INFRA-1 (вместе закрывают безопасность)
- Кому подходит: middle+ DevOps

**INFRA-3 — Провалидировать сборку Docker-образа video-worker**
- Область: Инфра/backend
- Описание: образ собран в коде, но не запускался. `docker compose --profile video build video-worker`, прогнать реальный stitch (можно `HIGGSFIELD_MOCK=1`), проверить Remotion chrome-headless-shell на Alpine. Заодно убрать tsconfig-paths хак, выравнив на sibling `dist` (как `@contento/brand-kit`), чтобы entrypoint стал стандартным `dist/index.js`.
- Критерии приёмки: ☐ образ собирается ☐ мок-стич рендерит mp4 ☐ entrypoint стандартизован ИЛИ задокументирован осознанно ☐ профиль `video` поднимается в compose
- Приоритет: **P0** · Оценка: **M** · Зависимости: INFRA-2 (Docker на сервере) для прод-валидации; локально — нет
- Кому подходит: senior backend, опыт Remotion/Docker/ffmpeg

### CI / надёжность пайплайна

**INFRA-4 — CI должен гейтить деплой**
- Область: Инфра/CI
- Описание: сейчас `ci.yml` и `deploy.yml` независимы на push в main → красный CI не останавливает деплой. Сделать `deploy.yml` зависимым от зелёного CI (через `workflow_run` или объединить в один pipeline с job-зависимостями).
- Критерии приёмки: ☐ при упавшем lint/typecheck/test деплой не стартует ☐ при зелёном — стартует ☐ проверено на тестовом PR
- Приоритет: **P1** · Оценка: **S** · Зависимости: —
- Кому подходит: middle DevOps, GitHub Actions

**INFRA-5 — Drift-гейт миграций в CI**
- Область: Инфра/backend/CI
- Описание: добавить в CI postgres-сервис + `prisma migrate deploy` на чистой БД + `prisma migrate diff --exit-code` (схема vs baseline). Ловит повтор db:push-дрейфа, который сломал старую историю.
- Критерии приёмки: ☐ CI поднимает postgres ☐ baseline реплеится начисто ☐ дрейф схемы валит CI ☐ green на текущем main
- Приоритет: **P1** · Оценка: **M** · Зависимости: —
- Кому подходит: middle+ backend, Prisma+Postgres в CI

**INFRA-6 — Сборка Docker-образов в CI**
- Область: Инфра/CI
- Описание: собирать хотя бы api/web/video-runner в CI, чтобы ловить build-регрессии до деплоя.
- Критерии приёмки: ☐ образы собираются в CI ☐ падение сборки валит pipeline
- Приоритет: **P2** · Оценка: **M** · Зависимости: INFRA-4
- Кому подходит: middle DevOps

### BACKEND / DB

**BE-3 — Раскрыть реальные метрики IG/TikTok (топливо вэджа)** ✅ *РЕШЕНО: идём на app-audit*
- Область: Backend/platform APIs
- Описание: feedback loop слеп вне YouTube. Реализовать `fetchMetrics()` для IG (Insights, Business + app review) и TikTok (audited app). **Подать заявки на app-review СЕЙЧАС** — ревью занимает недели календарно и идёт параллельно остальной работе; иначе вэдж останется слепым к запуску. Код-часть (`fetchMetrics`) делается после получения доступа.
- Критерии приёмки: ☐ заявки IG Business + TikTok audited app поданы ☐ `fetchMetrics` возвращает реальные views/likes для IG/TikTok ☐ авто-промоушн ранжирует по этим метрикам ☐ задокументирован источник сигнала на платформу
- Приоритет: **P1** (старт заявок — немедленно) · Оценка: **L** (app review недели календарно) · Зависимости: Business-аккаунты IG/TikTok; узкая экспертиза app-review (при команде 2–4 — возможно внешняя помощь)
- Кому подходит: senior backend, опыт Meta Graph / TikTok API + прохождение app-review

**BE-1 — Применить отложенные HNSW-индексы pgvector**
- Область: Backend/DB
- Описание: добавить ANN-индексы на `GoldenExample.embedding` и `Script.embedding` как raw-SQL (`--create-only` миграция). Сначала согласовать расхождение имён/полей между `migrations/README.md` и `deploy-setup.md`.
- Критерии приёмки: ☐ имена/поля индексов согласованы в одном доке ☐ миграция применяется ☐ `EXPLAIN` cosine-поиска использует индекс ☐ retrieval golden-примеров работает как раньше
- Приоритет: **P1** · Оценка: **S** · Зависимости: —
- Кому подходит: middle+ backend, pgvector/Postgres

**BE-2 — Выровнять cold-start порог авто-промоушена** *(нужно решение)*
- Область: Backend
- Описание: код `MIN_PUBLICATIONS_FOR_PROMOTION=5`, стратегия ~20. Определить правильное число и привести код+док в соответствие.
- Критерии приёмки: ☐ число подтверждено ☐ константа обновлена ☐ док синхронизирован
- Приоритет: **P1** · Оценка: **XS** · Зависимости: решение (§5.5)
- Кому подходит: junior+ backend

**BE-4 — Персистить publication_url**
- Область: Backend/DB
- Описание: сейчас сохраняется только `platformPostId`; полный URL поста только в Kafka-событии `publish.completed`. Добавить колонку/поле и заполнять при успехе.
- Критерии приёмки: ☐ поле в схеме+миграция ☐ posting-service пишет URL ☐ доступно в API/UI публикаций
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: junior+ backend

**BE-5 — Workspace-scoping для trend-fetcher tiktok/x**
- Область: Backend
- Описание: `fetchTikTokTrends`/`fetchXTrends` игнорируют workspace (глобальные тренды во все воркспейсы). Прокинуть и учитывать workspaceId.
- Критерии приёмки: ☐ тренды скоупятся по воркспейсу ☐ нет регрессии у rss/reddit/google/youtube
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: middle backend

**BE-6 — Убрать/подключить осиротевшие AI-агенты**
- Область: Backend/AI
- Описание: `cover-concept` и `storyboard` заменены новыми агентами (мёртвый код) → удалить; `music-suggester`, `viral-analyzer` — решить: подключить (фича) или удалить.
- Критерии приёмки: ☐ мёртвые экспорты удалены ☐ оставленные либо вызываются, либо помечены как осознанно отложенные ☐ сборка зелёная
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: middle backend/AI

**BE-7 — Решить судьбу mentions Kafka-топика**
- Область: Backend
- Описание: `mention-py` пишет в Postgres `Mention` И продьюсит в Kafka `mentions`, но TS-консьюмера нет (тупик). Либо добавить консьюмер (realtime-уведомления о упоминаниях), либо убрать Kafka-продьюс.
- Критерии приёмки: ☐ либо есть консьюмер с эффектом, либо продьюс удалён ☐ нет «мёртвых» событий
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: middle backend

### QA / надёжность контента

**QA-2 — QA-бейдж в основном create/review-флоу**
- Область: Frontend (QA UX)
- Описание: QaBadge показывается только на `review/campaigns/[id]`. Вынести индикатор PASS/WARN/BLOCK в основной путь одобрения скрипта (там, где есть готовый VideoJob).
- Критерии приёмки: ☐ статус QA виден в create/review ☐ BLOCK так же дизейблит approve ☐ findings раскрываются
- Приоритет: **P1** · Оценка: **S** · Зависимости: —
- Кому подходит: middle frontend

**QA-1 — Реальные проверки lip-sync confidence и visual-clipping** *(частично блокируется)*
- Область: Backend + video/ML
- Описание: в QA-гейте эти проверки `skip` — нет источника сигнала. Подключить, если видеопровайдер отдаёт confidence; для clipping — анализ кадров.
- Критерии приёмки: ☐ доступен источник confidence (или зафиксировано, что нет) ☐ проверки дают реальный verdict вместо skip ☐ покрыты unit-тестами как `qa/checks.test.ts`
- Приоритет: **P1** (частично BLOCKED — нет сигнала от провайдера) · Оценка: **M** · Зависимости: BE-3/выбор видеопровайдера, lipsync-решение (§5)
- Кому подходит: senior backend, видео/ML

**QA-3 — Интеграционные тесты API на ядро**
- Область: Backend/QA
- Описание: глубокий тест только у `qa/checks`; интеграционные мокают RBAC и слои с логикой. Добавить тесты на publishing-транзишены, feedback-loop промоушн, producer-loop.
- Критерии приёмки: ☐ тесты на PENDING→PUBLISHED/FAILED ☐ тест авто-промоушена golden ☐ RBAC проверяется реально хотя бы в одном тесте ☐ зелёные в CI
- Приоритет: **P2** · Оценка: **M** · Зависимости: —
- Кому подходит: middle+ backend/QA

**QA-4 — E2E полного цикла на стейджинге (мок-режим)**
- Область: QA/backend
- Описание: автопрогон trend→idea→script→video(HIGGSFIELD_MOCK)→QA→publish на стейджинге.
- Критерии приёмки: ☐ скрипт проходит цикл до PUBLISHED в мок-режиме ☐ запускается из CI или вручную по кнопке
- Приоритет: **P2** · Оценка: **M** · Зависимости: INFRA-2 (стейджинг)
- Кому подходит: middle QA/backend

### FRONTEND / продукт

**FE-1 — Двуязычный UI (RU+EN) с переключателем** ✅ *РЕШЕНО: двуязычный сразу*
- Область: Frontend
- Описание: каталоги `en.json`/`ru.json` синхронны (167 ключей), но покрывают малую долю UI — большинство страниц захардкожено на английском. Прогнать **все видимые строки** через `next-intl` и заполнить оба каталога (RU+EN), сделать рабочий переключатель локали. Покрывает диаспору и СНГ. Объём больше, чем просто RU-перевод (нужно вынести все строки + поддерживать оба языка в синхроне).
- Критерии приёмки: ☐ все ключевые экраны (dashboard/create/calendar/analytics/review/brand/studio/settings) через message-ключи ☐ нет захардкоженного текста ☐ en.json и ru.json синхронны и полны ☐ переключатель локали работает на всех страницах
- Приоритет: **P1** · Оценка: **L** (объёмная: ~весь UI) · Зависимости: —
- Кому подходит: middle frontend, аккуратность с i18n

**FE-2 — UI для PlatformProfile (настройки per-platform)**
- Область: Frontend (+ backend endpoint)
- Описание: per-platform поведение есть только как captions в create/manual; нет экрана для тона/формата/времени постинга по платформам.
- Критерии приёмки: ☐ экран настроек per-platform ☐ значения влияют на генерацию (через профиль) ☐ дефолты из `shared/platform-profiles.ts`
- Приоритет: **P1** · Оценка: **M** · Зависимости: возможно DB-модель PlatformProfile (решить — расширять статические профили или вводить модель)
- Кому подходит: middle frontend + backend

**FE-3 — Surface feedback loop в UI**
- Область: Frontend + backend
- Описание: сейчас UI только *вводит* golden/anti-примеры. Показать *выход* петли: какие golden используются в генерации, «почему этот пример».
- Критерии приёмки: ☐ endpoint отдаёт использованные golden для скрипта ☐ UI показывает их при генерации ☐ понятно, что петля влияет на результат
- Приоритет: **P2** · Оценка: **M** · Зависимости: —
- Кому подходит: middle frontend + backend

**FE-4 — Общий API-клиент**
- Область: Frontend
- Описание: `apiFetch` + `NEXT_PUBLIC_API_URL ?? localhost:3001` скопирован в ~20 файлов. Вынести в один модуль (токен, воркспейс-скоуп, обработка ошибок).
- Критерии приёмки: ☐ единый клиент ☐ страницы переведены на него ☐ нет дублей fetch-логики
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: middle frontend

### ДИЗАЙН

**DESIGN-1 — Дизайн-ревью основных экранов**
- Область: Дизайн
- Описание: ревью create/calendar/analytics/campaign-review на единообразие, иерархию, состояния загрузки/ошибок/пустые. (Можно через `/design-review`.)
- Критерии приёмки: ☐ список несоответствий с приоритетами ☐ исправлены P0/P1 визуальные баги ☐ есть состояния loading/empty/error
- Приоритет: **P2** · Оценка: **M** · Зависимости: —
- Кому подходит: designer / design-eng

**DESIGN-2 — Дизайн PlatformProfile и feedback-loop экранов**
- Область: Дизайн
- Описание: макеты под FE-2 и FE-3.
- Критерии приёмки: ☐ макеты согласованы ☐ покрывают пустые/ошибочные состояния
- Приоритет: **P2** · Оценка: **S** · Зависимости: FE-2/FE-3 (параллельно)
- Кому подходит: designer

### PYTHON-ВОРКЕРЫ / ML

**ML-1 — Решить судьбу whisper-py** *(нужно решение)*
- Область: Python/ML
- Описание: пустой стаб без src/Dockerfile/wiring; субтитры реально делает ElevenLabs. Удалить (vestigial) или реализовать как fallback-транскрайбер.
- Критерии приёмки: ☐ либо воркер удалён из репо/доков, либо реализован и провязан с явным потребителем
- Приоритет: **P2** · Оценка: **S** (удалить) / **L** (реализовать) · Зависимости: решение (§5.6)
- Кому подходит: python/ML

**ML-2 — Решить судьбу ml-py (LoRA-обучение)** *(нужно решение)*
- Область: Python/ML/GPU
- Описание: обучение мок-онли (`NotImplementedError` без `LORA_MOCK_TRAINING`; compose дефолтит на фейковые веса). Реализовать реальный трейн или явно пометить отложенным и убрать из дефолтного compose-профиля.
- Критерии приёмки: ☐ либо реальный LoRA-трейн на GPU, либо честный «отложено» (не дефолтит на фейк-веса в проде)
- Приоритет: **P2** · Оценка: **L** · Зависимости: решение (§5.6), GPU-инфра
- Кому подходит: ML-инженер, LoRA/PyTorch/GPU

**ML-3 — Обновить stale README scrapers-py**
- Область: Docs/Python
- Описание: README заявляет TikTok/X-источники, которых нет в коде (реально: google_trends/youtube/reddit/rss).
- Критерии приёмки: ☐ README соответствует коду
- Приоритет: **P2** · Оценка: **XS** · Зависимости: —
- Кому подходит: junior

### ПРОЧЕЕ

**DOC-1 — Актуализировать stale-документацию**
- Область: Docs
- Описание: `reconciled-roadmap.md` (всё кроме Lambda построено), `progress.txt` (застрял 2026-05-18), `CLAUDE.md` (нет `video-worker`/`packages/notifications`/`whisper-py`). Привести в соответствие коду (этот документ — отправная точка).
- Критерии приёмки: ☐ roadmap отражает реальный статус ☐ CLAUDE.md перечисляет актуальные apps/packages/workers
- Приоритет: **P2** · Оценка: **S** · Зависимости: —
- Кому подходит: any

**RENDER-SCALE — Горизонтальное масштабирование self-hosted рендера (замена Lambda)** ✅ *РЕШЕНО: без AWS*
- Область: Инфра/backend
- Описание: рендер — это BullMQ-воркеры (`video-worker`, `render-worker`) с атомарным claim'ом задач, уже concurrency-safe. Масштабируется без AWS/serverless: (1) вынести хардкод `concurrency: 2` (`video-worker/src/worker.ts:51`, `render-worker/src/worker.ts:141`) в env `WORKER_CONCURRENCY`; (2) гонять N реплик контейнера (`docker compose up --scale video-worker=N` / k8s / +VPS-ноды на тот же Redis/Postgres/MinIO). Воркеры внутри сети → MinIO доступен напрямую, presign наружу для рендера НЕ нужен (только для паблиша). Опционально (задача B): оптимизировать `renderMedia` (`remotion-stitch.ts:62`) — передать `concurrency`/`scale`; при GPU — NVENC вместо `libx264` (`stitch.ts:29,69`).
- Критерии приёмки: ☐ concurrency через env ☐ N реплик разбирают очередь без дублей ☐ способ масштабирования задокументирован ☐ замерена пропускная способность 1 воркера (видео/час) для планирования
- Приоритет: **P2** (делать при упоре в пропускную способность; подготовка `WORKER_CONCURRENCY` — сейчас, это S) · Оценка: **S** (env+доки) / **M** (с GPU-энкодингом) · Зависимости: —
- Кому подходит: middle backend/DevOps (узкий AWS НЕ нужен)
- Отклонено: **Remotion Lambda (AWS)** и **`@remotion/cloudrun` (GCP)** — оба требуют публично-доступных медиа (наш MinIO/RU-хостинг недоступен извне) + Remotion Company License. Self-hosted снимает оба AWS/cloud-специфичных блокера. План `2026-06-19-remotion-lambda.md` и runbook `remotion-lambda-setup.md` — в архив/неактуальны. Лицензия Remotion — отдельный вопрос (зависит от размера компании, не от способа рендера; при команде 2–4 вероятно под бесплатным порогом — проверить актуальные условия).

---

## 4. Сводная таблица

| Задача | Область | Приоритет | Оценка | Зависимости |
|---|---|---|---|---|
| INFRA-1 Закрыть экспозицию портов + пароли | Инфра | **P0 СРОЧНО** | S | доступ к VPS есть |
| INFRA-2 Аудит живого деплоя (.env/пароли/S3) | Инфра | **P0** | S | INFRA-1 |
| INFRA-3 Валидация образа video-worker | Инфра | **P0** | M | INFRA-2 (для прод) |
| INFRA-4 CI гейтит деплой | CI | P1 | S | — |
| INFRA-5 Drift-гейт миграций в CI | CI | P1 | M | — |
| INFRA-6 Сборка Docker-образов в CI | CI | P2 | M | INFRA-4 |
| BE-3 Реальные IG/TikTok метрики (app-audit ✅) | Backend | P1 | L | заявки app-review (старт сейчас) |
| BE-1 HNSW-индексы pgvector | Backend | P1 | S | — |
| BE-2 Cold-start порог промоушена | Backend | P1 | XS | решение |
| BE-4 Персистить publication_url | Backend | P2 | S | — |
| BE-5 WS-scoping трендов tiktok/x | Backend | P2 | S | — |
| BE-6 Убрать/подключить orphaned-агенты | Backend | P2 | S | — |
| BE-7 Судьба mentions Kafka-топика | Backend | P2 | S | — |
| QA-2 QA-бейдж в основном флоу | Frontend | P1 | S | — |
| QA-1 lip-sync/clipping проверки | Backend/ML | P1 🔒 | M | сигнал провайдера |
| QA-3 Интеграционные тесты API | Backend/QA | P2 | M | — |
| QA-4 E2E цикла (мок) | QA | P2 | M | INFRA-2 |
| FE-1 Двуязычный UI RU+EN (✅) | Frontend | P1 | L | — |
| FE-2 PlatformProfile UI | Frontend | P1 | M | — |
| FE-3 Feedback-loop surface | Frontend | P2 | M | — |
| FE-4 Общий API-клиент | Frontend | P2 | S | — |
| DESIGN-1 Дизайн-ревью экранов | Дизайн | P2 | M | — |
| DESIGN-2 Макеты PlatformProfile/feedback | Дизайн | P2 | S | FE-2/FE-3 |
| ML-1 Судьба whisper-py | Python/ML | P2 | S/L | решение |
| ML-2 Судьба ml-py (LoRA) | Python/ML | P2 | L | решение, GPU |
| ML-3 README scrapers-py | Docs | P2 | XS | — |
| DOC-1 Актуализировать доки | Docs | P2 | S | — |
| RENDER-SCALE Горизонт. реплики рендера (без AWS, ✅) | Инфра/backend | P2 | S/M | — |

🔒 = заблокировано решением/внешним фактором (см. §5).

---

## 5. Требует твоего решения / уточнения

> Решения от 2026-06-23 учтены ниже. Остаются открытыми 5.4–5.6, 5.8.

**5.1 Команда — ✅ РЕШЕНО: маленькая команда 2–4, роли размыты.** Можно параллелить инфра/backend/frontend, но узких спецов (DevOps/ML/AWS/app-review) нет. Следствие для раздачи: задачи с узкой экспертизой (BE-3 app-review, ML-2 LoRA/GPU, LAMBDA-1 AWS) вероятно потребуют внешней помощи или растянутся — закладывай в сроки. Реалистично в работе одновременно 2–3 потока, не 5.

**5.2 App-audit для IG/TikTok метрик — ✅ РЕШЕНО: идём на app-audit.** BE-3 разблокирован, P1. Важно: app-review занимает **недели календарно** — подавать заявки IG Business + TikTok audited app нужно **сейчас**, параллельно с R0/R1, иначе вэдж останется слепым к запуску. Влияет и на QA-1 (lip-sync остаётся отдельно заблокированным — app-audit его не раскрывает).

**5.3 Язык UI — ✅ РЕШЕНО: двуязычный RU+EN сразу.** FE-1 = P1, расширен до полного RU+EN с переключателем (объём больше простого RU-перевода — выносим весь UI и держим оба каталога в синхроне).

**5.4 Масштаб рендера — ✅ РЕШЕНО (2026-06-23): self-hosted горизонтально, без AWS.** Lambda и GCP Cloud Run отклонены (требуют публичных медиа + Company License). Параллельность даёт масштабирование BullMQ-воркеров (RENDER-SCALE). Открытые под-вопросы: лицензия Remotion при команде 2–4 (проверить порог) и нужен ли GPU-энкодинг — решать при упоре в пропускную способность.

**5.4-old Remotion Lambda (решение, LAMBDA-1).** Уже есть проблема с объёмом/скоростью рендера, оправдывающая лицензию (~$100/мес min) + AWS, или локальный Remotion пока достаточен и Lambda откладываем?

**5.5 Cold-start порог промоушена (решение, BE-2).** 5 (как в коде) или 20 (как в стратегии) опубликованных видео до авто-промоушена скрипта в golden?

**5.6 Статус ML-воркеров (решение, ML-1/ML-2).** `whisper-py` и реальное LoRA-обучение нужны в продукте, или это можно удалить/честно пометить отложенным? (Сейчас оба — заглушки, ml-py дефолтит на фейковые веса.)

**5.7 Статус VPS/деплоя — ✅ РЕШЕНО: деплой уже живой** (push в main → деплой). Следствие (критично): порты БД/Redis сейчас, скорее всего, **открыты в интернет на работающем сервере** — INFRA-1 это не будущая задача, а срочное закрытие активной уязвимости. INFRA-2 = аудит (пароли/.env/S3-доступность), не настройка с нуля. Открытый под-вопрос: используется ли реальный S3/CDN или localhost MinIO (влияет на внешнюю доступность медиа для платформ и на будущий Lambda).

**5.8 Сроки (уточнение).** Когда целишься в бету/запуск? Драйвит границу P0/P1.

---

## 6. Реализовано на ветке `feat/roadmap-2026-06-23` (2026-06-24)

Каждая задача прошла ревью (typecheck + lint + test; миграции — реальный replay на Postgres+pgvector; web — `next build`) и закоммичена отдельным коммитом. Деплой НЕ делался (решение: ветка → мержишь/деплоишь ты).

| Задача | Статус | Коммит |
|---|---|---|
| RENDER-SCALE — env WORKER_CONCURRENCY (замена Lambda) | ✅ | 39e9a94 |
| BE-2 — env GOLDEN_PROMOTION_MIN_PUBLICATIONS | ✅ | e73c5c7 |
| BE-5 — убран мёртвый _workspaceId у tiktok/x фетчеров | ✅ | c922a2b |
| BE-4 — Publication.postUrl (+миграция) | ✅ | 6aa6dfb |
| BE-1 — pgvector HNSW индексы (+согласование доков) | ✅ | 6add051 |
| BE-6 — удалены осиротевшие агенты (cover-concept, storyboard) | ✅ | 8248528 |
| ML-1/2/3 — whisper-py удалён, scrapers README, ml-py fail-loud | ✅ | afa34e2 |
| INFRA-5 — CI replay миграций + drift-гейт | ✅ | 2ffa0e4 |
| INFRA-4 — деплой гейтится зелёным CI | ✅ | be6559e |
| QA-2 — QA-вердикт в create-флоу (+фикс флакки-теста) | ✅ | 1ea19e6, add0b81 |
| BE-7 — убран мёртвый Kafka-продьюс mentions | ✅ | c73e1cd |
| QA-3 — реальные unit-тесты RBAC | ✅ | 2ec5933 |
| FE-4 — общий useApiFetch()/API_BASE (25 файлов) | ✅ | 00198e9 |
| FE-2 — редактируемый PlatformProfile (модель+CRUD+UI+генерация) | ✅ | 369fbc7 |
| FE-3 — surface влияния feedback loop (golden-influences) | ✅ | 6ca8bb5 |
| FE-1 — двуязычность: switcher+инфра были; локализованы навигация+settings hub, паритет каталогов | ⚠️ частично | 4b051c0 |
| INFRA-1 — порты БД на 127.0.0.1 + ufw | ✅ (ранее, f1dbce7) | — |

**FE-1 — остаток (механический follow-up по готовому паттерну):** тела страниц dashboard/trends/review/calendar/library/create/brand/studio/analytics/manual + settings-подстраницы — прогнать строки через `useTranslations` и дозаполнить en/ru (switcher уже переключает локаль по всему приложению, навигация — рабочий пример).

**Отдано на сторону (не код / нужен доступ):** INFRA-2 (аудит .env/паролей/S3 на VPS), INFRA-3 (валидация Docker-образа video-worker — нет Docker локально), BE-3 (заявки на app-review IG/TikTok — старт сейчас), QA-4 (E2E на стейджинге), DESIGN-1/2, ML-2-full (реальный LoRA на GPU), LAMBDA-1→RENDER-SCALE (масштаб репликами по необходимости).

**Замечание (see-something-say-something):** на этой же ветке присутствуют коммиты НЕ из этой сессии — миграция Clerk→локальный email/password-auth (382c714, 149bf26, 22e0d53, 93eb526, 7df10c0, d0d2dbe). Похоже, ветку параллельно вёл другой сеанс. Мои проверки гоняли по объединённому состоянию (совместимо), но при ревью/мерже это стоит учесть.
