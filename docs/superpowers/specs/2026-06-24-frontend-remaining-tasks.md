# Frontend — оставшиеся задачи (для делегирования) — 2026-06-24

Контекст: бэкенд/инфра/CI часть roadmap-аудита (`2026-06-23-state-audit-and-task-breakdown.md`)
реализована на ветке `feat/roadmap-2026-06-23`. Ниже — **фронтовый остаток**, который НЕ был
доделан в том заходе (в основном из-за объёма i18n и того, что фронт нельзя было проверить
визуально — проверялось только typecheck + lint + `next build`).

Стек: Next.js 15 App Router, `next-intl`, Tailwind, UI-примитивы в `apps/web/src/components/ui/index.tsx`
(`Button`/`Card`/`Input`/`Select`/`Spinner`/`ErrorBanner`). API — напрямую к Fastify через
**общий хук** `useApiFetch()` из `@/lib/api` (уже внедрён, использовать его, не писать `fetch` руками).

Общий definition of done для всех задач ниже:
- `pnpm typecheck` + `pnpm lint` + `pnpm --filter @contento/web build` зелёные.
- Каталоги `apps/web/src/messages/en.json` и `ru.json` остаются в **паритете** (одинаковый набор
  ключей; проверять скриптом — см. FE-1).
- Визуальный прогон затронутых экранов в обеих локалях (EN/RU) через переключатель в шапке.

---

## FE-1-REMAINDER — Завершить двуязычность (RU+EN) по всем экранам

**Что уже сделано (не трогать, использовать как образец):** инфраструктура i18n, `LocaleSwitcher`
(шапка), 9 namespace-ов в каталогах; **навигация** (`components/nav-links.tsx`) и **settings hub**
(`settings/page.tsx`) полностью локализованы; паритет каталогов выверен (175 leaf-ключей en==ru).

**Что осталось:** прогнать через `useTranslations` все видимые строки в телах страниц, которые
сейчас захардкожены на английском, и дозаполнить оба каталога.

**Экраны (по убыванию трафика):**
1. `dashboard/page.tsx` (namespace `dashboard` — есть, дополнить) — виджеты аналитики, заголовки.
2. `trends/page.tsx` (`trends`) — лента, кнопки analyze/archive/feedback/fetch, статусы.
3. `review/page.tsx` (`review`) — очередь, approve/reject, причины отклонения.
4. `review/campaigns/[id]/page.tsx` — экран ревью кампании (QA-бейдж уже локализован отдельно).
5. `calendar/page.tsx` (`calendar`) — DnD-календарь, best-time, quick-actions.
6. `create/page.tsx` (`create` — частично есть) — основной мастер (большой файл ~1600 строк; идти степпером 1→4).
7. `create/manual/page.tsx` — ручное создание, мульти-платформенные подписи.
8. `library/page.tsx`, `library/drafts/page.tsx`, `library/assets/page.tsx` (`library`).
9. `brand/page.tsx` — 11 вкладок Brand Kit (объёмный).
10. `studio/page.tsx`, `studio/onboarding/page.tsx`, `studio/campaigns/new/page.tsx`, `studio/campaigns/[id]/page.tsx`.
11. `analytics/page.tsx` — дашборды.
12. `settings/accounts|members|notifications|tasks|trend-sources|platform-profiles/page.tsx` (namespace `settings` уже создан для хаба — расширить под подстраницы).

**Требования:**
- Для каждой страницы — свой namespace (или подключ существующего), нести ключи в обоих каталогах.
- Клиентские компоненты: `const t = useTranslations('<ns>')`; серверные: `getTranslations`.
- Не ломать интерполяцию (значения/счётчики через `t('key', {count})`).
- НЕ хардкодить язык; всё через ключи.
- Русские переводы — естественные, не машинные (рынок — RU-диаспора+СНГ).

**Образец паттерна:** `components/nav-links.tsx` (использует `labelKey`, т.к. `key` зарезервирован
React) + namespace `nav` в каталогах.

**Проверка паритета каталогов (запускать перед коммитом):**
```bash
node -e 'const en=require("./apps/web/src/messages/en.json"),ru=require("./apps/web/src/messages/ru.json");
const P=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?P(v,p+k+"."):[p+k]);
const e=new Set(P(en)),r=new Set(P(ru));
console.log("missing in ru:",[...e].filter(k=>!r.has(k)));console.log("missing in en:",[...r].filter(k=>!e.has(k)));'
```

**Ожидаемый результат:** при переключении EN↔RU в шапке **все** перечисленные экраны полностью
меняют язык, без «сырых» ключей и без английских вкраплений; каталоги в паритете; билд зелёный.

**Оценка:** L (объёмная механическая работа; ~13 экранов). Можно параллелить по экранам между
исполнителями (каждый владеет своим namespace, чтобы не конфликтовать в JSON-каталогах).

---

## FE-VERIFY — Визуальный QA того, что реализовано, но не проверено визуально

В прошлом заходе фронт не проверялся в браузере (только сборка). Нужно прогнать руками и
поправить визуальные/UX-дефекты:

1. **PlatformProfile-редактор** — `settings/platform-profiles/page.tsx` (FE-2).
   - Проверить: загрузка 4 платформ, бейдж default/customized, валидация (duration min≤ideal≤max;
     сумма formatMix=1 показывает ошибку), Save (PUT) и Reset (DELETE), сообщение «Saved ✓».
   - Ожидаемый результат: редактирование сохраняется, override влияет на генерацию (видно в
     scriptwriter/video-storyboard), Reset возвращает дефолт.
2. **Feedback-loop surface** — `create/_components/GoldenInfluences.tsx` (FE-3).
   - Проверить: панель «Learned from these top examples» появляется после генерации скрипта при
     наличии golden-примеров с эмбеддингами; скрыта на cold-start.
   - Ожидаемый результат: показывает топ-3 golden с % match и сниппетом.
3. **QA-бейдж в create** — `create/_components/VideoJobPanel.tsx` (QA-2).
   - Проверить: после готового видео (status DONE) виден бейдж PASS/WARN/BLOCK + findings.

**Оценка:** S–M.

---

## FE-POLISH — Опционально (не блокеры)

- Состояния загрузки/пустые/ошибки на новых экранах (PlatformProfile, GoldenInfluences) —
  привести к общему стилю (Spinner/ErrorBanner уже используются).
- Дизайн-ревью основных экранов (`/design-review`) — единообразие, иерархия, отступы.
- FE-2: вынести числовые поля редактора в более удобный layout (сейчас grid 2/3 колонки).

---

## Чего НЕ требуется (вне фронта)
Эти пункты — не фронт, отданы отдельно (см. аудит §6): INFRA-2 (аудит .env/паролей/S3 на VPS),
INFRA-3 (валидация Docker-образа video-worker), BE-3 (заявки app-review IG/TikTok), QA-4 (E2E на
стейджинге), ML-2 (реальный LoRA на GPU), деплой.
