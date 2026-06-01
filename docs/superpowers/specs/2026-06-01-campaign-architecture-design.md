# Campaign Architecture — Design Spec
**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

Упрощённый end-to-end флоу создания видео-контента для брендов. Иерархия:
`Workspace → CompanyPortrait + AvatarPersona → Campaign → ContentPlan → ContentPlanItem → Script + VideoJob → Publication`

Цель: клиент вносит данные компании один раз, AI генерирует контент-план на месяц, система автоматически производит видео с AI-аватаром и отдаёт на одобрение, после одобрения публикует в соцсети.

---

## Data Model

### Новые модели Prisma

```prisma
model CompanyPortrait {
  id             String    @id @default(cuid())
  workspaceId    String    @unique
  niche          String
  description    String
  usp            String
  targetAudience String
  competitors    String[]
  contentAngles  String[]
  generatedAt    DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

enum AvatarPersonaStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

model AvatarPersona {
  id                  String              @id @default(cuid())
  workspaceId         String              @unique
  description         String
  style               String
  gender              String
  referenceImageUrl   String?
  higgsfieldSoulId    String?
  status              AvatarPersonaStatus @default(PENDING)
  errorMessage        String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  workspace           Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  COMPLETED
  PAUSED
}

model Campaign {
  id            String         @id @default(cuid())
  workspaceId   String
  name          String
  goal          GoalType
  targetAction  String
  startsAt      DateTime
  endsAt        DateTime
  status        CampaignStatus @default(DRAFT)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  workspace     Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contentPlan   ContentPlan?

  @@index([workspaceId])
}

enum ContentPlanStatus {
  DRAFT
  APPROVED
  IN_PRODUCTION
  COMPLETED
}

model ContentPlan {
  id         String            @id @default(cuid())
  campaignId String            @unique
  status     ContentPlanStatus @default(DRAFT)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
  campaign   Campaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  items      ContentPlanItem[]
}

enum ContentPlanItemStatus {
  PENDING
  SCRIPTING
  SCRIPTED
  VIDEO_QUEUED
  VIDEO_GENERATING
  VIDEO_DONE
  CLIENT_REVIEW
  APPROVED
  PUBLISHED
  REJECTED
}

model ContentPlanItem {
  id            String                @id @default(cuid())
  contentPlanId String
  index         Int
  topic         String
  format        String
  scheduledDate DateTime
  hook          String
  status        ContentPlanItemStatus @default(PENDING)
  rejectComment String?
  scriptId      String?
  videoJobId    String?
  publicationId String?
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  contentPlan   ContentPlan           @relation(fields: [contentPlanId], references: [id], onDelete: Cascade)
  script        Script?               @relation(fields: [scriptId], references: [id], onDelete: SetNull)
  videoJob      VideoJob?             @relation(fields: [videoJobId], references: [id], onDelete: SetNull)
  publication   Publication?          @relation(fields: [publicationId], references: [id], onDelete: SetNull)

  @@index([contentPlanId])
  @@index([status])
}
```

Существующие модели (`Script`, `VideoJob`, `Publication`) не изменяются — `ContentPlanItem` ссылается на них.

---

## API Routes

Все маршруты workspace-scoped: `/workspaces/:workspaceId/...`

### `company-portrait.ts`
| Method | Path | Описание |
|--------|------|----------|
| GET | `/company-portrait` | Получить портрет компании |
| POST | `/company-portrait/generate` | Запустить AI-генерацию портрета |

### `avatar-persona.ts`
| Method | Path | Описание |
|--------|------|----------|
| GET | `/avatar-persona` | Получить персонажа |
| POST | `/avatar-persona` | Создать/обновить описание персонажа |
| POST | `/avatar-persona/generate-image` | Запустить генерацию референс-изображения (Higgsfield text2image → Soul ID) |

### `campaigns.ts`
| Method | Path | Описание |
|--------|------|----------|
| GET | `/campaigns` | Список кампаний |
| POST | `/campaigns` | Создать кампанию |
| GET | `/campaigns/:cid` | Получить кампанию с ContentPlan |
| PATCH | `/campaigns/:cid` | Обновить кампанию |
| DELETE | `/campaigns/:cid` | Удалить кампанию (только DRAFT) |
| POST | `/campaigns/:cid/content-plan/generate` | AI-генерация контент-плана (Virlo + портрет) |
| POST | `/campaigns/:cid/approve-plan` | Утвердить план → запустить производство |
| GET | `/campaigns/:cid/items` | Список ContentPlanItem |
| PUT | `/campaigns/:cid/items/:iid/approve` | CLIENT одобряет видео → публикация |
| PUT | `/campaigns/:cid/items/:iid/reject` | CLIENT отклоняет с комментарием |

---

## AI Agents

### `company-portrait-analyzer.ts`
**Вход:** `{ companyName, niche, website?, description, usp, targetAudience, competitors[] }`  
**Выход:** `CompanyPortrait` (niche, description, usp, targetAudience, competitors, contentAngles[])  
**Модель:** claude-sonnet-4-6  
**Промпт:** Анализирует данные компании, формирует структурированный портрет с 5–7 углами контента (content angles) — уникальными точками зрения, из которых бренд может говорить со своей аудиторией.

### `content-plan-generator.ts`
**Вход:** `{ portrait: CompanyPortrait, goal: GoalType, targetAction: string, startsAt, endsAt, virloTrends[] }`  
**Выход:** `ContentPlanItem[]` (topic, format, scheduledDate, hook — из проверенных паттернов)  
**Модель:** claude-sonnet-4-6  
**Промпт:** Использует портрет компании + трендовые видео из Virlo + цель кампании. Генерирует хуки по доказанным формулам (Pattern Interrupt, Bold Claim, Question Hook, Story Hook). targetAction встраивается в CTA каждого видео.

---

## BullMQ Job: `campaign-producer`

Запускается при `POST /campaigns/:cid/approve-plan`. Последовательно обрабатывает каждый `ContentPlanItem`:

```
for each item in ContentPlan.items (ordered by scheduledDate):
  1. item.status = SCRIPTING
  2. scriptwriter agent → создать Script (hook + body + cta + caption + hashtags)
     (передаёт targetAction в CTA, brand context из CompanyPortrait)
  3. item.status = VIDEO_QUEUED, item.scriptId = script.id
  4. enqueue VideoJob (использует AvatarPersona.higgsfieldSoulId)
  5. Дождаться VideoJob.status = DONE (poll или webhook)
  6. item.status = CLIENT_REVIEW, item.videoJobId = videoJob.id
  7. Отправить уведомление CLIENT (NotificationType.APPROVAL_NEEDED)
```

Если VideoJob.status = FAILED → item.status = REJECTED, errorMessage сохраняется, уведомление менеджеру.

---

## Публикация после одобрения

`PUT /campaigns/:cid/items/:iid/approve` выполняет:
1. `item.status = APPROVED`
2. Берёт `Script.caption` + `Script.hashtags` (уже сгенерированы scriptwriter)
3. Создаёт `Publication` с `scheduledAt = item.scheduledDate` или публикует немедленно
4. posting-service подхватывает через существующий Kafka топик `TOPIC_PUBLISH`

---

## Новые страницы (Next.js)

| Маршрут | Роль | Описание |
|---------|------|----------|
| `/studio` | EDITOR+ | Дашборд: список кампаний, статусы, кнопка "Новая кампания" |
| `/studio/onboarding` | OWNER/ADMIN | Wizard (шаг 1: данные компании → шаг 2: AI-портрет → шаг 3: аватар → шаг 4: генерация образа) |
| `/studio/campaigns/new` | EDITOR+ | Форма: название, цель, даты, целевое действие |
| `/studio/campaigns/[id]` | EDITOR+ | Контент-план в виде таймлайна, статус каждого видео, кнопка "Утвердить план" |
| `/review/campaigns/[id]` | CLIENT | Список видео на одобрение: видеоплеер + Одобрить/Отклонить + комментарий |

Studio — первый пункт в левом меню навигации. CLIENT видит только `/review`.

---

## Обработка ошибок

- **Virlo недоступен** → content-plan-generator использует только портрет компании без трендов, возвращает план без `trendSource`
- **Higgsfield ошибка** при генерации аватара → `AvatarPersona.status = FAILED`, менеджер видит кнопку "Повторить генерацию"
- **VideoJob.status = FAILED** → `ContentPlanItem.status = REJECTED`, менеджер видит кнопку "Перегенерировать"
- **CLIENT отклонил** → менеджер видит комментарий, кнопка "Пересоздать видео" (создаёт новый VideoJob для того же item)

---

## Что НЕ входит в эту реализацию

- Загрузка реального лица человека (option A из обсуждения)
- Публичные ссылки для клиентов без аккаунта (option A из обсуждения)
- Автоматическая перегенерация при отклонении (менеджер запускает вручную)
- Аналитика кампании (метрики публикаций) — следующий этап
