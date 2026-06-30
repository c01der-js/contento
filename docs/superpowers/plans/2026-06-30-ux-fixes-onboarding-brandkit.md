# План: UX-фиксы + обязательный онбординг с авто-бренд-китом (2026-06-30)

Источник — заметки владельца по проду (`contento-ai.ru`). Корневые причины подтверждены аудитом кода
(5 параллельных Explore-агентов). Приоритет: сначала быстрые победы (S), затем мясо (онбординг+бренд-кит).

| # | Задача | Оценка | Тип |
|---|---|---|---|
| T0 | Понятные дизайн-плашки уведомлений (сырые ошибки → расшифровка RU/EN) | S | UX/i18n (компонент уже набросан) |
| T1 | Локализация типов целей (SUBSCRIBERS/SALES/…) в Бренд-ките | S | i18n |
| T2 | Прояснить кнопку «Превью голоса бренда» | S | UX/copy |
| T3 | Гейт создания кампании по наличию портрета компании | S | UI+API |
| T4 | Починить Тренды (пустые) — посеять источники | S/M | config+seed+UI |
| T5 | Обязательный онбординг + авто-заполнение Бренд-кита из онбординга | M | AI-агент+guard+route |

---

## T0 — Понятные плашки системных уведомлений
**Проблема:** в UI показываются сырые JSON-ошибки, напр. `{"error":"Company portrait not found. Run onboarding first."}` — непонятно пользователю.
**Статус:** компонент `SystemNotice` уже написан (`apps/web/src/components/ui/system-notice.tsx`) — дизайн-плашка (иконка-чип + заголовок + пояснение + действие, палитра платформы, RU/EN), маппит сырые ошибки в понятные локализованные сообщения с действием.
**Осталось:**
1. `ErrorBanner` (в `components/ui/index.tsx:177`) → делегировать на `<SystemNotice message={message} kind="error" />` + ре-экспорт `SystemNotice`. Так апгрейд расходится на все **17** мест использования.
2. Добавить namespace `notices` в `messages/en.json` + `ru.json` (паритет): `generic/onboarding/unauthorized/forbidden/network/server/notFound` (title/desc/action).
3. Keyframe `noticeIn` в `globals.css` (плавное появление).
4. Verify (typecheck/lint/web build) → деплой.
**Файлы:** `system-notice.tsx` (есть), `components/ui/index.tsx`, `messages/{en,ru}.json`, `app/globals.css`.

---

## T1 — Локализация типов целей в Бренд-ките
**Проблема:** дропдаун «Тип» во вкладке **Цели** Бренд-кита показывает сырой enum `SUBSCRIBERS/SALES/ENGAGEMENT/REACH`.
**Корень:** `apps/web/.../brand/page.tsx` — GoalsTab: `<option>{goalType}</option>` (стр. 1876) и `<Badge>{item.type}</Badge>` (стр. 1837) рендерят сырой enum. Tab использует `useTranslations('brand')`, а ключи целей есть только в namespace `studio` (не `brand`). Кампании уже локализованы правильно (`studio/page.tsx:46-51` — образец).
**Реализация:**
1. В `messages/en.json` и `ru.json` в секцию **`brand`** добавить `goalSubscribers/goalSales/goalEngagement/goalReach` (значения скопировать из `studio` 695-698: Подписчики/Продажи/Вовлечённость/Охват).
2. В GoalsTab (после `useTranslations('brand')`) добавить `GOAL_TYPE_LABELS: Record<Goal['type'],string> = {SUBSCRIBERS:t('goalSubscribers'), …}`.
3. Заменить `{goalType}` (стр.1876) → `{GOAL_TYPE_LABELS[goalType]}`, и `{item.type}` (стр.1837) → `{GOAL_TYPE_LABELS[item.type] ?? item.type}`.
**Риск:** дубль 4 ключей в `studio`+`brand` (namespace'ы изолированы) — норма по конвенции. **Оценка S.**

---

## T2 — Прояснить «Превью голоса бренда»
**Проблема:** непонятно, что делает кнопка.
**Факт:** кнопка **рабочая** — POST `/brand-preview` (`brand-kit.ts:905-944`) генерит **3 реальных примера** контента через Claude (`writeScript`, sonnet) в голосе бренда → открывает модалку. Проблема чисто в **тексте/подаче**.
**Реализация (только copy + мелкий JSX, без бэкенда):**
1. Переименовать кнопку (ключ `previewVoice`, `messages` 528): «**Сгенерировать пример в голосе бренда**» / «Generate Sample in Brand Voice».
2. Переписать модалку (`previewModalTitle`/`Desc` 544-545): заголовок «**Так AI пишет в голосе вашего бренда**»; описание — «Примеры постов, сгенерированные по вашим настройкам (тон, ценности, словарь) — видно, как будет звучать AI».
3. Добавить inline-подсказку у кнопки (новый ключ `previewVoiceHint`).
4. Подписать каждый из 3 примеров его ракурсом (личность / ценности / связь с ЦА) — лейблы в фикс-порядке, как их отдаёт бэкенд (`brand-kit.ts:929-933`).
5. Если бренд пустой — показать подсказку «заполните Голос/Столпы для точных примеров».
6. (Опц.) убрать хардкод фиолетовых классов на кнопке (`brand/page.tsx:233`), вернуть `variant="primary"`.
**Файлы:** `brand/page.tsx`, `messages/{en,ru}.json`. **Оценка S.**

---

## T3 — Гейт создания кампании по портрету компании
**Проблема:** можно создать кампанию без бренд-кита → потом reject «Company portrait not found» на генерации плана.
**Корень:** reject летит **поздно** — на `content-plan/generate` (`campaigns.ts:200-204`), а не при создании. Зависимость = строка **CompanyPortrait** (НЕ tones/pillars — это red herring). POST `/campaigns` (`campaigns.ts:158-169`) не проверяет портрет → всегда 201. Кнопки «Новая кампания» (`studio/page.tsx:85-91, 110-116`) и submit (`campaigns/new:163-169`) не проверяют портрет.
**Реализация (defense-in-depth):**
1. **API-гейт:** в POST `/campaigns` перед `campaign.create` — `findUnique companyPortrait by workspaceId`; нет → 400 с понятным сообщением (+ 400 в response-схему).
2. **UI-гейт:** на `studio/page.tsx` и `campaigns/new` — параллельный `GET /company-portrait`; если null → дизейблить кнопки/submit + плашка (T0) с действием «Перейти к онбордингу» (`/studio/onboarding`).
3. i18n: «Сначала заполните бренд-кит» (RU/EN).
4. Тест: `campaigns.test.ts` — POST `/campaigns` → 400 без портрета.
**Reuse:** `GET /company-portrait` (`company-portrait.ts:42-52`) — готовый probe (null если нет). **Оценка S.**

---

## T4 — Починить Тренды (пустые)
**Проблема:** `/trends` всегда «Тренды не найдены», «Обновить тренды» ничего не даёт.
**Корень:** таблица **`TrendFeedConfig` пуста** — её НИЧТО не сеет (нет seed-скрипта, нет INSERT в миграции, нет хука при создании воркспейса). Воркер (`trend-fetcher/worker.ts:44`) читает `TrendFeedConfig where enabled:true` (глобальная таблица, без workspaceId) → 0 строк → 0 трендов → `publisher.broadcastTrends` (который правильно фанаутит Trend по всем воркспейсам) не вызывается. Очередь/воркеры/фанаут — **работают**, нет только данных-источников. Вторично: youtube требует `YOUTUBE_API_KEY`; reddit/rss — без ключа.
**Реализация:**
1. **Быстро (config):** через существующий OWNER-роут `POST /workspaces/{id}/trend-feed-configs` посеять 1-2 источника без ключей: `{"source":"rss","config":{"url":"<RU RSS>"}}` и/или `{"source":"reddit","config":{"subreddit":"…"}}`. RSS — самый надёжный первый сигнал.
2. **Проверить, что воркеры подняты на проде:** `trend-fetcher` + `trend-analyzer` + redis + kafka (это **дефолтные** сервисы compose, без профиля; логи fetcher должны показать «Fetches every 30 minutes» без ошибок Redis/Kafka). Для youtube — `YOUTUBE_API_KEY` в `infra/.env`.
3. **Out-of-box фикс (рекоменд.):** добавить Prisma-seed/миграцию-INSERT с дефолтными key-free источниками (reddit+rss), чтобы свежая установка работала сразу.
4. **UI (для удобства):** экран «Подключить источники» (Settings → Trend Sources уже есть как страница — связать с `trend-feed-configs` endpoints), т.к. сейчас они только API.
**Риск:** при выключенном Redis API всё равно отдаёт 202 (queued) → ложный успех в UI. youtube без ключа молча отдаёт []. **Оценка S (config) / M (seed+UI).**

---

## T5 — Обязательный онбординг + авто-заполнение Бренд-кита
**Проблема:** онбординг необязателен; бренд-кит надо заполнять руками; владелец хочет — онбординг обязателен после регистрации, и поля бренд-кита авто-заполняются из онбординга с возможностью правки.
**Корень:**
- Онбординг НЕ обязателен: middleware гейтит только по auth-куке, не знает про CompanyPortrait; после регистрации редирект на `/dashboard`. Нет флага `onboardingComplete`.
- **Жёсткое ограничение:** регистрация (`auth.ts:33`) создаёт только `User`, БЕЗ воркспейса → два состояния гейта: нет воркспейса / нет портрета.
- **Нет AI-агента**, который генерит бренд-кит (tones/pillars/vocab/personas) — `analyzeCompany` делает только портрет (niche/usp/audience/angles). Бренд-кит сейчас — только ручной CRUD.
**Реализация:**
1. **Гейт онбординга** — клиентский `<OnboardingGuard>` в `app/[locale]/(app)/layout.tsx` (внутри `WorkspaceProvider`, т.к. middleware не видит workspace-scoped портрет): если `status==='no-workspaces'` → создать/предложить воркспейс; если есть workspaceId и `GET /company-portrait`===null и путь ≠ `/studio/onboarding` → `router.replace('/studio/onboarding')`. Allowlist: онбординг + settings + logout (не запереть юзера). Редирект после регистрации `sign-up/page.tsx:39` → `/studio/onboarding`. (Опц.: авто-создавать дефолтный воркспейс в `auth.ts` register; опц. флаг `Workspace.onboardingCompletedAt`.)
2. **Новый агент `brand-kit-generator`** (`packages/ai/src/agents/brand-kit-generator.ts`) — по образцу `content-plan-generator.ts`: один `runAnthropicMessage` (sonnet, ↑max_tokens), system-промпт «верни только JSON» вида `{tones[], pillars[], vocabulary[], personas[], visualIdentity{}}`, парс со strip-fence + guard (как `company-portrait-analyzer.ts:52-59`). Экспорт в `agents/index.ts`.
3. **Роут `POST /workspaces/:id/brand-kit/generate`** — загрузить CompanyPortrait → `generateBrandKit` → `prisma.$transaction` createMany BrandTone/BrandPillar/BrandVocabulary/Persona + `visualIdentity.upsert` (паттерн `campaigns.ts:224-243`). **Идемпотентно** (skip/clear если строки уже есть; учесть unique на `BrandVocabulary.word`/`TabooTopic.topic`).
4. **Вшить в онбординг:** после шага «портрет ок» в `studio/onboarding/page.tsx` вызвать `/brand-kit/generate` (или внутри `/company-portrait/generate`), затем редирект на `/brand` → пользователь видит авто-заполненные **редактируемые** вкладки (UI бренд-кита уже поддерживает правку — менять не надо).
5. Тесты по образцу `company-portrait.test.ts`.
**Reuse:** онбординг-визард, `analyzeCompany`+`/company-portrait/generate`, полная модель+CRUD бренд-кита (`brand-kit.ts`, `brand/page.tsx`), `WorkspaceProvider` status, паттерн generate-then-createMany.
**Риски:** не запереть юзера (allowlist); обработать no-workspace до редиректа; идемпотентность; надёжность LLM-JSON большого объёма (strict-промпт + guard + ↑tokens); 2 sonnet-вызова на онбординге (портрет+кит) — цена/латентность. **Оценка M (самая большая).**

---

## Последовательность
**Спринт 1 (быстрые победы, ~S каждая):** T0 → T1 → T2 → T3 (UX+i18n+гейт, один-два деплоя).
**Спринт 2:** T4 (посеять источники + проверить воркеры) и T5 (онбординг-гейт + brand-kit-generator) — T5 самый ценный, делается с субагентами по слоям (агент / роут / guard / онбординг-wiring).

## Verification (общая)
- `pnpm typecheck` + `pnpm lint` + `pnpm --filter @contento/web build` зелёные; миграции (если T5/seed) реплеятся.
- Прод-прогон: T1/T2 — визуально RU/EN; T3 — создать кампанию без портрета → блок + понятная плашка; T4 — посеять RSS → «Обновить тренды» → тренды появились; T5 — регистрация → принудительный онбординг → бренд-кит авто-заполнен и редактируется.
