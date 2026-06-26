# B2 — Instagram Sales-Funnel AI Agent — дизайн

**Дата:** 2026-06-26
**Статус:** Дизайн утверждён (готов к плану реализации)
**Вариант:** 1 — Contento-native (бесспоук-агент внутри монорепо)

## Зачем

У Automost менеджер вручную ведёт входящие переписки в Instagram Direct: отвечает, собирает
телефон, затем пересылает номер + скрины переписки в Telegram-чат отдела продаж. Задача — заменить
ручной труд **автономным AI-агентом**, который ведёт диалог сам, квалифицирует лида (телефон +
интент) и передаёт его в отдел продаж.

## Решения (зафиксированы в брейншторме)

- **Автономия:** полная — агент отвечает на входящие в реальном времени без человека до сбора номера.
  В дизайн заложены защитные «рельсы» (см. ниже), чтобы автономность не вредила на боевом аккаунте.
- **Цель диалога:** собрать **номер + интент** (какой авто/услуга/объявление, примерный бюджет/срок).
- **База знаний:** **гибрид** — курируемая FAQ (ядро) + подтяжка деталей с automost.ru по
  конкретным объявлениям/ценам.
- **Хендофф:** карточка-уведомление в TG отдела продаж + ссылка на полную карточку лида в Contento
  (лёгкий Leads-раздел).
- **Реализация:** Contento-native (полный контроль, переиспользует brand-context/TG/db, лиды в Contento).

## Архитектура и поток данных (цикл диалога)

```
IG Direct (входящее)
  → POST /webhooks/instagram (apps/api)
      verify подписи (reuse verifyWebhookSignature @contento/ai)
      enqueue в очередь 'instagram-dm' (reuse BullMQ queue.ts) → 200 OK
  → воркер apps/instagram-agent
      load/создать Conversation + Message[]
      sales-agent (reuse buildBrandContext + runAnthropicMessage, haiku-4.5)
        вход: история диалога + гибрид-KB
        выход: { replyText, detectedIntent, extractedPhone?, qualificationStatus, needsEscalation }
      → отправить replyText клиенту через IG Send API (токен из SocialAccount.credentials)
      → если собран номер+интент: create Lead
           → sendTelegram(salesChatId, карточка-со-ссылкой)  (reuse @contento/notifications)
      → если needsEscalation: безопасная заглушка + Conversation.escalated=true + пинг в TG
                              (авто-ответы дальше не идут)
```

Идемпотентность: дедуп по messageId (Meta ретраит webhook) — не обрабатывать одно событие дважды.

## Компоненты

### Reuse (не дублировать)
- **AI-агент:** `runAnthropicMessage()` + `buildBrandContext(workspaceId)` (`packages/ai`). Модель
  `claude-haiku-4-5-20251001` (скорость/цена; интент-классификация + короткие ответы).
- **TG-хендофф:** `sendTelegram(chatId, message)` из `@contento/notifications`.
- **Webhook verify:** `verifyWebhookSignature()` из `@contento/ai`.
- **Очереди:** BullMQ-паттерн из `apps/api/src/queue.ts` (+ новый `getInstagramQueue()`).
- **Web:** `useApiFetch()`, `useWorkspace()`, UI-примитивы `@/components/ui`, `next-intl`.
- **Аккаунты:** существующий `SocialAccount` (OAuth-флоу уже построен; токен IG берём оттуда).
- **Sales-чат:** существующая `Integration`-модель (config с `chatId`) — без изменений схемы.

### Net-new
1. `apps/api/src/routes/instagram-webhooks.ts` — GET (challenge verify) + POST (events → enqueue).
2. `packages/ai/src/agents/sales-agent.ts` — агент (structured JSON output).
3. `packages/platforms/src/instagram/messaging.ts` — IG Send-клиент (POST
   `graph.facebook.com/v21.0/me/messages`, токен страницы/аккаунта).
4. `apps/instagram-agent/` — воркер (BullMQ consumer цикла диалога). **Gated за compose-профилем
   `inbox`** — чтобы деплой кода не стартовал воркер без заданного env (по аналогии с `video`).
5. Prisma: модели `Conversation`, `Message`, `Lead` + enum'ы + аддитивная миграция.
6. `apps/api/src/routes/leads.ts` — `GET /workspaces/:id/leads`, `GET .../leads/:leadId` (с тредом),
   `PATCH .../leads/:leadId` (status).
7. `apps/web/src/app/[locale]/(app)/leads/page.tsx` + детальная карточка с тредом + nav-ссылка +
   i18n-ключи (`leads` namespace, en+ru в паритете).

## Модель данных (Prisma, аддитивно)

```prisma
enum ConversationChannel { INSTAGRAM_DM }
enum LeadStatus { NEW CONTACTED CONVERTED LOST }
enum LeadQualification { UNQUALIFIED PHONE_MISSING INTENT_UNCLEAR QUALIFIED }

model Conversation {
  id             String            @id @default(cuid())
  workspaceId    String
  channel        ConversationChannel @default(INSTAGRAM_DM)
  igThreadId     String            // Instagram-аккаунт sender (scoped уникальность ниже)
  socialAccountId String?          // какой подключённый IG-аккаунт принял диалог
  senderName     String?
  senderPhone    String?
  detectedIntent String?
  qualification  LeadQualification @default(UNQUALIFIED)
  escalated      Boolean           @default(false)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  workspace      Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  messages       Message[]
  lead           Lead?
  @@unique([workspaceId, igThreadId])
  @@index([workspaceId, qualification])
  @@index([workspaceId, createdAt])
}

model Message {
  id              String       @id @default(cuid())
  conversationId  String
  role            String       // "user" | "assistant"
  text            String
  externalId      String?      // Meta messageId — для идемпотентности
  createdAt       DateTime     @default(now())
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@unique([conversationId, externalId])
  @@index([conversationId])
}

model Lead {
  id             String     @id @default(cuid())
  workspaceId    String
  conversationId String     @unique
  name           String
  phone          String
  intent         String
  status         LeadStatus @default(NEW)
  notes          String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  workspace      Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([workspaceId, status])
  @@index([workspaceId, createdAt])
}
```
(+ back-relations `conversations Conversation[]` и `leads Lead[]` в модели `Workspace`.)

## Поведение агента и «рельсы» (полная автономия)

- **Системный промпт:** роль = вежливый менеджер Automost; цель = помочь + собрать номер+интент;
  язык **русский**; tone/факты из `buildBrandContext` (brand-context) + курируемая FAQ.
- **Guardrails:**
  - Не выдумывать цены/наличие/характеристики, которых нет в KB → «уточню у коллеги, оставьте номер,
    перезвоним».
  - Не обещать сроки/скидки/гарантии.
  - Стоп-темы (торг по цене, спор, жалоба, юр.вопросы, оскорбления) → `needsEscalation=true`.
  - Лимит длины ответа; человекоподобная задержка; **debounce** серии быстрых сообщений (склеивать
    в один контекст перед ответом).
  - Распознавание RU-телефона (+7/8, форматы с пробелами/скобками/дефисами) → `extractedPhone`.
- **Комплаенс Instagram:** отвечаем **только на входящие**; окно 24 ч; для более позднего ответа —
  message tag `HUMAN_AGENT` (до 7 дней). Никакого холодного аутрича (это отдельная фича B1).

## Предусловия и фазы

**Предусловия (внешние, на стороне владельца):**
- HTTPS-домен (см. план §5.1; домен есть, TLS нет).
- IG-аккаунт Business/Creator + привязка к Facebook Page.
- Meta-app + permission `instagram_manage_messages` (+ `instagram_business_basic`) → **app-review,
  недели**.
- Env: `FB_APP_ID`, `FB_APP_SECRET`, `META_WEBHOOK_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
  sales-чат `chatId` (через Integration), `TELEGRAM_BOT_TOKEN`.

**Фазы:**
- **Фаза 0 (пока идёт ревью):** полный E2E на тест-аккаунте в dev-mode (роль в app) + автотест на
  симулированном webhook-пейлоаде. Деплой кода дормантным (профиль `inbox` не поднят).
- **Фаза 1:** включить профиль `inbox` в проде после app-review + HTTPS.
- **Фаза 2 (позже):** связка с feedback-loop — какие ответы конвертят в лиды → улучшение промпта;
  авто-статусы лидов.

## Обработка ошибок

- Джобы BullMQ с ретраями; сбой агента или IG Send → лог + диалог в статус ошибки + (опц.) эскалация.
- **Идемпотентность по `Message.externalId`** (`@@unique([conversationId, externalId])`) — повторный
  webhook не плодит ответы.
- Валидация webhook-пейлоада через zod; невалидный → 400, неподписанный → 401.

## Тестирование

- **Unit (vitest, как `qa/checks.test.ts`):**
  - `sales-agent` с замоканным Anthropic — извлечение телефона, интента, флага эскалации, формат JSON.
  - Парсер webhook-пейлоада (валид/невалид/дубль messageId).
  - Формирование карточки лида для TG.
- **Интеграционный happy-path:** симулированный входящий webhook → агент(мок) → создан Lead →
  вызван `sendTelegram` (мок) → запись в БД корректна. Это и есть «E2E без реального IG».
- CI: `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm --filter @contento/web build` зелёные;
  миграция реплеится в `migrate-check`.

## Вне scope (later)

Холодный аутрич/комментарии (фича B1), реальные скрин-картинки переписки (сейчас тред текстом в
карточке лида), мультиязычные диалоги (старт — русский), голосовые/медиа-сообщения IG (только текст),
авто-CRM-пайплайн статусов (ручной статус + Фаза 2).

## Риски / заметки

- Полная автономия на боевом аккаунте: «рельсы» снижают риск, но первые недели стоит наблюдать
  диалоги (Leads-раздел показывает треды). Возможен быстрый «тумблер» в полу-авто при необходимости.
- Зависимость от app-review: сроки внешние; код готов и тестируется заранее на mock/dev-mode.
- IG Messaging media/echo-события игнорируем; обрабатываем только входящий текст от пользователя.
