# Meta App Review kit — Instagram sales-funnel агент (B2)

Готовые значения и текст для активации IG-агента. Полный пошаговый гайд: `activate-ig-agent.md`.

**Домены проекта:** web = `https://contento-ai.ru` · api = `https://api.contento-ai.ru`

---

## Шаг 1 — Webhook verify token  ⚠️ СЕКРЕТ (не публиковать)

```
META_WEBHOOK_VERIFY_TOKEN=222309acfe290eea3c911a8541d6ed8593dc2b0aa576aa1b2ca2cddb72393c03
```

**Куда вставить (в оба места одинаково):**
- в `infra/.env` на сервере → ключ `META_WEBHOOK_VERIFY_TOKEN`;
- в Meta-app → **Webhooks → Verify Token**.

Если утечёт — сгенерируй новый `openssl rand -hex 32` и обнови в обоих местах.

**Webhook Callback URL:** `https://api.contento-ai.ru/webhooks/instagram`
**Подписка на поле:** `messages` (Instagram object).

---

## Шаг 2 — Текст заявки Meta App Review (вставить в форму, англоязычная)

**Permissions:** `instagram_business_basic` + `instagram_business_manage_messages`
(точный slug подтверди в кабинете — может называться `instagram_manage_messages`).

**How your app uses this permission:**
> Our app is a customer-service and sales assistant for our own business's Instagram account.
> When a person sends a Direct Message to our connected Instagram Business account, the app reads
> the incoming message and replies on behalf of the business to answer product questions and
> collect the person's phone number so our sales team can follow up. `instagram_business_basic`
> identifies the connected business account; `instagram_business_manage_messages` lets us receive
> inbound messages via webhook and send replies within the standard messaging window. We never
> message users who have not messaged us first (no cold outreach).

**Reviewer test steps (screencast):**
> 1. Log in, go to Settings → Connected Accounts, click Connect on Instagram, complete OAuth.
> 2. From a second Instagram account, send a DM to the connected business account.
> 3. The assistant receives the message and replies automatically.
> 4. When the user shares a phone number, a lead is created and forwarded to our sales Telegram
>    channel; show it in the app's Leads screen.

**Data handling:** Messages and contact details are stored on our own servers and used only to
respond to and follow up on the inquiry.

| Поле формы | Значение |
|---|---|
| Privacy Policy URL | `https://contento-ai.ru/privacy` |
| Data Deletion URL | `https://contento-ai.ru/data-deletion` |
| OAuth redirect URI | `https://api.contento-ai.ru/oauth/meta/callback` |

> Таймлайн ревью: 2–4 недели. До одобрения агент тестируется в dev-mode на аккаунтах с ролью
> в Meta-app (admin/dev/tester) — этого достаточно для приёмки.
