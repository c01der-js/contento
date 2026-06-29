# Активация Instagram sales-funnel агента (B2) + HTTPS

**Что активируем:** автономного AI-агента, который ведёт входящие Instagram Direct, собирает
номер+интент и шлёт лида в Telegram отдела продаж (+ раздел Leads в Contento). Код уже в `main` и
задеплоен **дормантно** — ниже шаги, чтобы он заработал на реальном аккаунте Automost.

> Легенда: 🟢 = делает Claude/код (уже в репо). 🔵 = делаешь ты (DNS / сервер по SSH / кабинет Meta).
> Плейсхолдеры: `<WEB_DOMAIN>` (напр. `app.automost.ru`), `<API_DOMAIN>` (напр. `api.automost.ru`).

## Порядок (зависимости)
```
1. DNS + HTTPS (Caddy)  →  2. Meta-app  →  3. env на сервере  →  4. Webhook
                                                     ↓
                          5. Connect IG-аккаунта + поднять воркер (тест в dev-mode)
                                                     ↓
                          6. App-review (для прод / чужих аккаунтов)
```

---

## Шаг 1 — DNS + HTTPS (Caddy) 🟢код / 🔵DNS
🟢 В репо добавлены: `infra/Caddyfile` + сервис `caddy` (профиль `proxy`, авто-TLS Let's Encrypt) +
публичные страницы `/privacy`, `/terms`, `/data-deletion` (нужны для ревью Meta).

🔵 На стороне регистратора и сервера:
1. Заведи две A-записи на IP VPS (`89.125.82.179`): `<WEB_DOMAIN>` и `<API_DOMAIN>`.
2. Открой порты: `sudo ufw allow 80 && sudo ufw allow 443`.
3. В `infra/.env` на сервере задай `WEB_DOMAIN=<WEB_DOMAIN>` и `API_DOMAIN=<API_DOMAIN>`.
4. Подними прокси:
   ```
   docker compose -f infra/docker-compose.yml --profile proxy up -d caddy
   ```
   Caddy сам получит TLS-сертификаты (DNS уже должен резолвиться на сервер).
5. Проверь: `https://<WEB_DOMAIN>` открывает приложение, `https://<API_DOMAIN>/health` → `{"status":...}`.
6. (Опц., безопасность) после перехода на HTTPS закрой прямой доступ к 3000/3001:
   `sudo ufw deny 3000 && sudo ufw deny 3001` (Caddy проксирует их внутри docker-сети).

> Текущий `http://89.125.82.179:3000` продолжает работать, пока не поднят `proxy` — миграция не ломающая.

---

## Шаг 2 — Meta-app (Facebook/Instagram) 🔵
1. https://developers.facebook.com → **My Apps → Create App → тип «Business»**.
2. Добавь продукты: **Instagram** (Instagram API setup) и **Webhooks**.
3. В **App settings → Basic** возьми **App ID** и **App Secret** (понадобятся в Шаге 3).
4. Требования к аккаунту: Instagram должен быть **Business/Creator**. (Для классического Graph-пути —
   связать с Facebook-страницей; для нового Instagram API с Instagram Login — подключается напрямую.)
5. **OAuth redirect URI** (Facebook Login / Instagram API → Settings):
   добавь `https://<API_DOMAIN>/oauth/meta/callback` (ровно так — совпадает с `FB_REDIRECT_URI`).
6. Permissions (для агента): `instagram_business_basic` + **права на чтение/ответ в Instagram-сообщениях**.
   Точный slug подтверди в кабинете — у Meta это `instagram_manage_messages` (старое имя) или
   `instagram_business_manage_messages` (новый Instagram API с Instagram Login). См. docs:
   https://developers.facebook.com/docs/instagram-platform . Для **теста** (Шаг 5) полный review НЕ
   нужен — в dev-mode права работают на аккаунтах с ролью в приложении.

---

## Шаг 3 — env на сервере (`infra/.env`) 🔵
Заполни (значения — из Шага 2; токен Telegram — из @BotFather; chatId — id чата отдела продаж):
```
FB_APP_ID=<из Meta App Basic>
FB_APP_SECRET=<из Meta App Basic>
FB_REDIRECT_URI=https://<API_DOMAIN>/oauth/meta/callback
META_WEBHOOK_VERIFY_TOKEN=<придумай строку, она же в Шаге 4>
TELEGRAM_BOT_TOKEN=<токен бота из @BotFather>
SALES_TELEGRAM_CHAT_ID=<id чата отдела продаж>     # бота нужно добавить в этот чат
WEB_BASE_URL=https://<WEB_DOMAIN>
WEB_DOMAIN=<WEB_DOMAIN>
API_DOMAIN=<API_DOMAIN>
NEXT_PUBLIC_API_URL=https://<API_DOMAIN>           # ВАЖНО: вшивается в web на сборке
```
Затем пере-деплой (пересоберёт web с новым `NEXT_PUBLIC_API_URL` и подхватит env api):
```
git pull && bash scripts/deploy.sh
```
> `SALES_TELEGRAM_CHAT_ID` можно не задавать в env, а создать `Integration` type `SALES_TELEGRAM`
> (config `{ "chatId": "..." }`). База знаний агента (опц.): `Integration` type `SALES_KB`
> (config `{ "text": "FAQ/прайс/условия" }`) — гибрид с brand-context.

---

## Шаг 4 — Webhook Instagram 🔵
В Meta-app → **Webhooks** (или Instagram → Configure webhooks):
- **Callback URL:** `https://<API_DOMAIN>/webhooks/instagram`
- **Verify Token:** ровно `META_WEBHOOK_VERIFY_TOKEN` из Шага 3.
- Нажми Verify → должно пройти (наш `GET /webhooks/instagram` отвечает на handshake).
- **Subscribe** на поле **`messages`** (Instagram object).

---

## Шаг 5 — Connect аккаунта + воркер (тест в dev-mode) 🔵
1. Подними воркер агента:
   ```
   docker compose -f infra/docker-compose.yml --profile inbox up -d --build instagram-agent
   ```
2. В приложении: **Settings → Connected Accounts → Connect** на Meta/Instagram → пройди OAuth →
   аккаунт сохранится (`SocialAccount`, токен в credentials).
3. Тест: напиши с **другого** аккаунта в Direct на подключённый IG → агент должен ответить, а при
   передаче номера+интента — прислать карточку лида в Telegram-чат и показать лид в `/{locale}/leads`.

> В dev-mode переписка работает только с аккаунтами, у которых есть роль в Meta-app (admin/dev/tester) —
> для приёмки этого достаточно. Для публичного приёма сообщений от любых пользователей — Шаг 6.
> Известное ограничение: OAuth-callback не сохраняет IG account id → агент матчит аккаунт по полям
> credentials ИЛИ single-account fallback (для одного аккаунта Automost — ок).

---

## Шаг 6 — App-review (для прод / чужих аккаунтов) 🔵 — недели
Подавать **сейчас, параллельно**, т.к. ревью идёт 2–4 недели.
- Запроси у Meta нужное messaging-право (Шаг 2.6) через **App Review**.
- Приложи **скринкаст** полного пути: вход в приложение → Connect IG-аккаунта → приходит входящее DM →
  агент отвечает → появляется лид. Покажи, как и зачем запрашивается право.
- **Privacy Policy URL:** `https://<WEB_DOMAIN>/privacy` · **Data Deletion URL:** `https://<WEB_DOMAIN>/data-deletion`
  (страницы уже есть — заполни плейсхолдеры `[COMPANY]`, `[CONTACT_EMAIL]`, `[JURISDICTION]`).
- Опиши use-case: «AI-ассистент отвечает на входящие сообщения в нашем бизнес-аккаунте и передаёт
  заявки в отдел продаж».

---

## Проверка готовности
- ☐ `https://<WEB_DOMAIN>` и `https://<API_DOMAIN>/health` живы по HTTPS.
- ☐ `https://<WEB_DOMAIN>/privacy` и `/data-deletion` открываются без логина.
- ☐ Webhook verified, подписка на `messages`.
- ☐ Тест-DM → ответ агента → лид в Telegram + в `/leads`.
- ☐ Заявка на app-review подана.

## Заметки
- Стоимость на старте теста: см. план §5.2 (Anthropic pay-as-you-go обязателен; Higgsfield/ElevenLabs —
  только если генерим видео, не для агента). Агенту B2 хватает `ANTHROPIC_API_KEY` (уже задан).
- Метрики IG Insights (для feedback-loop) — отдельное право `instagram_*_content_publish`/insights и
  отдельный review (WEDGE-1), не нужно для работы агента.
