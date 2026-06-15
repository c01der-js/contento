# PlatformProfile + multi-format — design spec

Дата: 2026-06-15. Рынок зафиксирован: **диаспора + СНГ** → платформы **TikTok, Instagram Reels, YouTube Shorts, Telegram** (VK убран). Реализуется **двумя планами: A (PlatformProfile + per-platform) → B (multi-format)**. Основано на `2026-06-15-platform-strategy-and-decisions.md`.

## Проблема
Сейчас пайплайн делает один аватар-ролик 9:16 1080×1920 и постит одну подпись на все площадки. Research показал: форматы, длина, стиль подписи и алгоритмы у TikTok/Reels/Shorts разные; faceless/очевидный AI давится (Shorts — особенно). Нужна **отдельная логика на платформу** и **разнообразие форматов** (аватар + b-roll+текст + скринкаст).

## Решённые развилки
- **Источник b-roll:** генерим сцену — Higgsfield foundation text2image (без Soul) → DoP-движение → текст-оверлей в Remotion.
- **Screencast:** в MVP. Источник — **Remotion-синтетика** (шаблоны `phone-app` / `browser` / `chat` / `slides`, контент из скрипта) + опционально загруженная запись экрана из Asset-библиотеки.
- **Модель вариантов:** отдельный VideoJob на платформу (fan-out).
- **PlatformProfile:** статичный типизированный конфиг в `packages/shared`.
- **Target-платформы:** на уровне Campaign.

---

## Архитектура

### Компонент 1 — `PlatformProfile` (Plan A; `packages/shared/src/platform-profiles.ts`)
Статичная типизированная запись на платформу:
```
PlatformProfile {
  platform: 'tiktok'|'instagram'|'youtube'|'telegram'
  targetDuration: { min; ideal; max }        // tiktok 21/28/34, reels 15/20/30, shorts 20/28/35, telegram ~30
  hookWindowSec                              // tiktok/reels 3, shorts 1.5
  formatMix: { avatar; broll; screencast }   // веса shotType (сумма=1); shorts avatar-heavy, reels broll/ugc, tiktok avatar-storytime
  captionStyle: 'seo-keyword-first'|'conversational-trend'
  hashtagCount; captionMaxLen
  nativeSoundImportance: 'high'|'low'         // high только tiktok
  subtitleStyle                              // караоке burned-in (везде)
  aigcDisclosure: true
  cadenceHint
}
export function getPlatformProfile(platform): PlatformProfile
```
Чистый модуль, без зависимостей, юнит-тестируемый. Дефолты — из research.

### Компонент 2 — per-platform fan-out (Plan A; схема + campaign-producer)
- `Campaign` получает `targetPlatforms: Platform[]` (выбор на уровне кампании).
- Связь `ContentPlanItem → VideoJob` меняется на **1:N**: `VideoJob` получает `platform` и `contentPlanItemId` (FK на item); у item — `videoJobs VideoJob[]`. (Сейчас обратный single-FK `ContentPlanItem.videoJobId` → заменить; миграция в плане.)
- `campaign-producer`: для каждого item × каждой `targetPlatforms` создаёт VideoJob с этим `platform`; storyboard/длина/формат-микс генерятся по `getPlatformProfile(platform)`.
- На approve: `Publication` на каждую пару (VideoJob.platform → соответствующий SocialAccount).

### Компонент 3 — per-platform script/caption (Plan A)
- `scriptwriter` / новый caption-шаг принимает `PlatformProfile`: длина, hook-окно, `captionStyle` (SEO-keyword-first для Reels/Shorts vs разговорный+тренд-тег для TikTok), `hashtagCount`. Убрать хардкод `platform:'instagram'` в campaign-producer.
- `video-storyboard` принимает `PlatformProfile`: `shotCount`/длина под `targetDuration`, структура под hook-окно.

### Компонент 4 — `shotType` multi-format (Plan B; `VideoShotSchema` + Prisma + Remotion)
`VideoShot` получает `shotType: 'avatar'|'broll'|'screencast'` (+ поля под тип). `video-storyboard` распределяет шоты по `formatMix` платформы. Рендер — **format-aware в `VideoStitch`**:
- **avatar** — текущий путь (Soul → Speak/DoP → MP4 → `<OffthreadVideo>`).
- **broll** — `provider.sceneFrame(prompt)` (новый метод `VideoProvider`: Higgsfield foundation text2image без Soul) → DoP-движение → MP4; в композиции поверх — текст-оверлей (`headline` из шота), та же машинерия, что субтитры/CTA.
- **screencast** — без Higgsfield: `VideoStitch` рендерит синтетический компонент `<ScreencastShot template=... content=...>` инлайн (шаблоны phone/browser/chat/slides), либо `<OffthreadVideo>` загруженной записи (Asset). Голос+субтитры поверх.

`VideoProvider` (из P0 Task 10) расширяется методом `sceneFrame`. `VideoStitchProps.shots[]` получает `shotType` + поля; композиция ветвится по типу.

### Поток данных (Plan A, один item)
```
Campaign.targetPlatforms = [tiktok, instagram, youtube, telegram]
  → ContentPlanItem
    → for each platform p:
        profile = getPlatformProfile(p)
        script = writeScript(.., profile)            // длина/подпись/хэштеги под p
        storyboard = generateVideoStoryboard(.., profile)  // длина/структура под p
        VideoJob{ platform: p } → render → outputUrl
  → approve → Publication per (VideoJob, SocialAccount[p])
  → posting-service (P0): payload.videoUrl presigned, aigcDisclosure=true, caption per p
```

## Границы планов
- **Plan A:** `PlatformProfile` конфиг + Campaign.targetPlatforms + ContentPlanItem→N VideoJob (platform) + per-platform script/caption/length. Формат — только avatar (как сейчас). Даёт «каждая платформа уникальна» на текущем визуале.
- **Plan B:** `shotType` (broll generate-scene + screencast Remotion-синтетика/upload), format-aware `VideoStitch`, `provider.sceneFrame`, `formatMix`-распределение в storyboard.

## Error handling / edge cases
- Платформа без подключённого SocialAccount на approve → пропустить эту платформу (не падать), залогировать.
- `formatMix` для шота, чей тип невозможен (нет Soul для avatar / нет Asset для screencast-upload) → fallback на доступный тип (screencast→synthetic, broll→avatar) с пометкой.
- Fan-out N VideoJob: один упавший VideoJob платформы не валит остальные (изолированный статус на job).
- AIGC: `aigcDisclosure=true` во всех пейлоадах (детект всё равно неизбежен — ElevenLabs/C2PA вотермарки).

## Тестирование
- `getPlatformProfile` — юнит (значения профилей, дефолт).
- caption/storyboard per-platform — юнит на то, что профиль прокидывается (длина/стиль в промпте).
- fan-out — тест: item × N платформ → N VideoJob с разными `platform`.
- Plan B: `shotType`-ветвление в `VideoStitch` — рендер-смоук (как Фаза 2) на каждом типе; `sceneFrame` — мок-тест провайдера.

## Что НЕ входит
- Feedback loop / PostAnalytics / QA-гейт (отложены за этот блок — см. reconciled-roadmap).
- VK / Rutube (рынок диаспора+СНГ).
- Реальная запись экрана продукта через browser-automation (только upload или синтетика).
- Тренд-саунд TikTok как готовая интеграция (профиль помечает `nativeSoundImportance:high`, но автоподбор трендового аудио — позже).
