# Remove Clerk → Local Email+Password Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk with the project's own email+password auth — backend issues/verifies a JWT, the web stores it in a cookie and gates routes by it.

**Architecture:** The API already has `/auth/register` + `/auth/login` (bcrypt + `jwt.sign({sub}, JWT_SECRET, 30d)`) — they just aren't registered, and the auth plugin verifies via Clerk instead of the local secret. We register the routes, switch the plugin to `jwt.verify`, and on the web swap `ClerkProvider`/`clerkMiddleware`/`getToken()` for a `contento_token` cookie read by both the middleware (route gating) and pages (Bearer header).

**Tech Stack:** Fastify 5, `jsonwebtoken`, `bcryptjs`, Prisma, Next.js 15 (App Router), next-intl, pnpm + Turborepo, vitest (api only).

**Spec:** `docs/superpowers/specs/2026-06-24-remove-clerk-local-auth-design.md`

---

## File Structure

**Backend (`apps/api`)**
- Modify `src/plugins/auth.ts` — verify local JWT (extract a pure `decodeUserId` helper), de-Clerk `ensureUser`.
- Create `src/plugins/auth.test.ts` — unit-test `decodeUserId`.
- Modify `src/server.ts` — register `authRoutes`.
- Modify `package.json` — drop `@clerk/backend`.

**Frontend (`apps/web`)**
- Create `src/lib/auth.ts` — `setAuthToken` / `getAuthToken` / `clearAuthToken` cookie helpers + `TOKEN_COOKIE`.
- Modify `src/middleware.ts` — cookie gating, drop `clerkMiddleware`.
- Modify `src/app/layout.tsx` — drop `<ClerkProvider>`.
- Rewrite `src/app/[locale]/(auth)/sign-in/page.tsx` and `.../sign-up/page.tsx` — local forms.
- Create `src/components/logout-button.tsx`; wire into `src/app/[locale]/(app)/settings/page.tsx`.
- Modify the ~20 `(app)` pages/components that call `useAuth().getToken()` — use `getAuthToken()`.
- Modify `package.json` — drop `@clerk/nextjs`.

**Infra**
- Modify `infra/.env.example` — add `JWT_SECRET`, remove `CLERK_*`.
- Modify `Dockerfile` — drop Clerk web-builder args.
- Modify `infra/docker-compose.yml` — drop Clerk build-args/env.
- Server `infra/.env` + redeploy.

---

## Task 1: Register the auth routes in the API server

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add the import** near the other route imports (the file imports routes around lines 6–30):

```ts
import { authRoutes } from './routes/auth.js'
```

- [ ] **Step 2: Register the routes** right after `await registerAuth(app)` (≈ line 71), before the workspace routes. No prefix — these are pre-auth:

```ts
  await app.register(authRoutes)
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @contento/api run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register /auth/register + /auth/login routes"
```

---

## Task 2: Switch the auth plugin to verify the local JWT (TDD)

**Files:**
- Modify: `apps/api/src/plugins/auth.ts`
- Test: `apps/api/src/plugins/auth.test.ts` (create)

- [ ] **Step 1: Write the failing test** — `apps/api/src/plugins/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'
import { decodeUserId } from './auth.js'

const SECRET = 'test-secret'
beforeAll(() => { process.env.JWT_SECRET = SECRET })

describe('decodeUserId', () => {
  it('returns the sub for a token signed with JWT_SECRET', () => {
    const token = jwt.sign({ sub: 'user_123' }, SECRET)
    expect(decodeUserId(token)).toBe('user_123')
  })
  it('returns null for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user_123' }, 'wrong-secret')
    expect(decodeUserId(token)).toBeNull()
  })
  it('returns null for a malformed token', () => {
    expect(decodeUserId('not-a-jwt')).toBeNull()
  })
  it('returns null when the payload has no sub', () => {
    const token = jwt.sign({ foo: 'bar' }, SECRET)
    expect(decodeUserId(token)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @contento/api exec vitest run src/plugins/auth.test.ts`
Expected: FAIL — `decodeUserId` is not exported.

- [ ] **Step 3: Rewrite `apps/api/src/plugins/auth.ts`** to verify the local JWT. Replace the whole file with:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from 'jsonwebtoken'
import { prisma } from '@contento/db'

interface AuthUser {
  userId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null
  }
}

export const registerAuth = fp(async (app: FastifyInstance) => {
  app.decorateRequest('authUser', null)

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const token = extractToken(request)
    if (!token) { request.authUser = null; return }
    const userId = decodeUserId(token)
    if (!userId) { request.authUser = null; return }
    await ensureUser(userId)
    request.authUser = { userId }
  })
})

/**
 * Read the bearer token from the Authorization header, or — as a fallback — from a
 * `?token=` query param. The query fallback exists for browser media tags (`<video src>`,
 * `<a download>`) which cannot send custom headers; the token is parsed from the raw URL
 * because `request.query` is not yet populated in the onRequest hook.
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)

  const url = request.raw.url
  if (url) {
    const q = url.indexOf('?')
    if (q !== -1) {
      const token = new URLSearchParams(url.slice(q + 1)).get('token')
      if (token) return token
    }
  }
  return null
}

/** Verify a local JWT (signed by /auth/{register,login}) and return its `sub`, or null. */
export function decodeUserId(token: string): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const payload = jwt.verify(token, secret) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}

/** Provision the user's first workspace on their first authenticated request. */
async function ensureUser(userId: string): Promise<void> {
  // Fast path — already a member of some workspace.
  const existing = await prisma.membership.findFirst({ where: { userId } })
  if (existing) return

  // The User row is created at /auth/register. If the sub doesn't map to a user, do nothing.
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const slug = `ws-${userId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase()}`
  const workspaceName = user.name ? `${user.name}'s Workspace` : 'My Workspace'

  try {
    await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    })
  } catch (e: unknown) {
    // P2002 = unique constraint — a concurrent first request already created it; ignore.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') return
    throw e
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @contento/api exec vitest run src/plugins/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the whole api**

Run: `pnpm --filter @contento/api run typecheck`
Expected: no errors (the `@clerk/backend` import is gone).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/plugins/auth.test.ts
git commit -m "feat(api): verify local JWT in auth plugin (drop Clerk verification)"
```

---

## Task 3: Drop `@clerk/backend` from the API

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove the dependency line** `"@clerk/backend": "^1.0.0",` from `apps/api/package.json` `dependencies`.

- [ ] **Step 2: Confirm nothing else imports it**

Run: `grep -rn "@clerk/backend" apps/api/src`
Expected: no output.

- [ ] **Step 3: Update the lockfile**

Run: `pnpm install --lockfile-only`
Expected: completes; `pnpm-lock.yaml` changes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): remove @clerk/backend dependency"
```

---

## Task 4: Web auth cookie helper

**Files:**
- Create: `apps/web/src/lib/auth.ts`

- [ ] **Step 1: Create `apps/web/src/lib/auth.ts`:**

```ts
export const TOKEN_COOKIE = 'contento_token'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

/** Store the JWT in a SameSite=Lax cookie readable by client JS (for the Bearer header). */
export function setAuthToken(token: string): void {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}

/** Read the JWT from the cookie, or null on the server / when absent. */
export function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/** Remove the JWT cookie (logout). */
export function clearAuthToken(): void {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth.ts
git commit -m "feat(web): add contento_token cookie auth helper"
```

---

## Task 5: Replace the middleware (cookie gating, drop Clerk)

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Replace the whole file** `apps/web/src/middleware.ts` with:

```ts
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { TOKEN_COOKIE } from './lib/auth'

const intlMiddleware = createIntlMiddleware(routing)

// Public (no auth needed): the localized sign-in / sign-up pages.
const PUBLIC_PATH = /^\/[^/]+\/(sign-in|sign-up)(?:\/.*)?$/

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = request.cookies.has(TOKEN_COOKIE)
  const isPublic = PUBLIC_PATH.test(pathname)

  if (!hasToken && !isPublic) {
    const locale = pathname.split('/')[1] || routing.defaultLocale
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url))
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

Note: the `routing` object (`./i18n/routing`) already exports `defaultLocale`. The `/__clerk/` matcher entry is intentionally dropped.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): cookie-based route gating, remove clerkMiddleware"
```

---

## Task 6: Remove `<ClerkProvider>` from the root layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Open `apps/web/src/app/layout.tsx`.** Remove the `import { ClerkProvider } from '@clerk/nextjs'` line and unwrap the JSX so the provider no longer wraps `children`. Example transformation:

Before:
```tsx
import { ClerkProvider } from '@clerk/nextjs'
// ...
  return (
    <ClerkProvider>
      <html lang={locale}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
```
After:
```tsx
// (ClerkProvider import removed)
// ...
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
```
Keep all other layout content (fonts, providers, `<body>` classes) exactly as-is — only remove the `ClerkProvider` wrapper and its import.

- [ ] **Step 2: Confirm no other Clerk imports remain in the layout**

Run: `grep -n "clerk\|Clerk" apps/web/src/app/layout.tsx`
Expected: no output.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): drop ClerkProvider from root layout"
```

---

## Task 7: Local sign-in page

**Files:**
- Modify (replace contents): `apps/web/src/app/[locale]/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Replace the file** with a local login form:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { setAuthToken } from '@/lib/auth'

export default function SignInPage() {
  const router = useRouter()
  const { locale } = useParams<{ locale: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Неверный email или пароль' : 'Ошибка входа')
        return
      }
      const { token } = (await res.json()) as { token: string }
      setAuthToken(token)
      router.replace(`/${locale}/dashboard`)
    } catch {
      setError('Сеть недоступна. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Вход</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="text-sm">
        Нет аккаунта?{' '}
        <Link href={`/${locale}/sign-up`} className="underline">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/(auth)/sign-in/page.tsx"
git commit -m "feat(web): local email+password sign-in form"
```

---

## Task 8: Local sign-up page

**Files:**
- Modify (replace contents): `apps/web/src/app/[locale]/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Replace the file** with a local registration form (posts to `/auth/register`, min 8-char password, handles 409):

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { setAuthToken } from '@/lib/auth'

export default function SignUpPage() {
  const router = useRouter()
  const { locale } = useParams<{ locale: string }>()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || undefined }),
      })
      if (!res.ok) {
        setError(res.status === 409 ? 'Этот email уже зарегистрирован' : 'Ошибка регистрации')
        return
      }
      const { token } = (await res.json()) as { token: string }
      setAuthToken(token)
      router.replace(`/${locale}/dashboard`)
    } catch {
      setError('Сеть недоступна. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Регистрация</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Имя (необязательно)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Пароль (мин. 8 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Создаём…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="text-sm">
        Уже есть аккаунт?{' '}
        <Link href={`/${locale}/sign-in`} className="underline">
          Войти
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/[locale]/(auth)/sign-up/page.tsx"
git commit -m "feat(web): local email+password sign-up form"
```

---

## Task 9: Logout button

**Files:**
- Create: `apps/web/src/components/logout-button.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/settings/page.tsx`

- [ ] **Step 1: Create `apps/web/src/components/logout-button.tsx`:**

```tsx
'use client'

import { useRouter, useParams } from 'next/navigation'
import { clearAuthToken } from '@/lib/auth'

export function LogoutButton() {
  const router = useRouter()
  const { locale } = useParams<{ locale: string }>()

  function onLogout() {
    clearAuthToken()
    router.replace(`/${locale}/sign-in`)
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className="rounded-md border px-3 py-2 text-sm"
    >
      Выйти
    </button>
  )
}
```

- [ ] **Step 2: Render it on the settings hub.** In `apps/web/src/app/[locale]/(app)/settings/page.tsx`, add the import at the top:

```tsx
import { LogoutButton } from '@/components/logout-button'
```

and render `<LogoutButton />` somewhere visible in the returned JSX (e.g. at the end of the main settings container). If `settings/page.tsx` is a server component, the `LogoutButton` (a client component) can still be rendered inside it directly — no extra `'use client'` needed on the page.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/logout-button.tsx "apps/web/src/app/[locale]/(app)/settings/page.tsx"
git commit -m "feat(web): logout button on settings"
```

---

## Task 10: Replace `getToken()` with `getAuthToken()` across the app pages

Every `(app)` page/component currently does (variations):
```tsx
import { useAuth } from '@clerk/nextjs'
// ...
const { getToken } = useAuth()
// ...
const token = await getToken()
// header: Authorization: `Bearer ${token}`
// useCallback/useEffect deps include `getToken`
```

Transform each to:
```tsx
import { getAuthToken } from '@/lib/auth'
// ...
// (remove the `const { getToken } = useAuth()` line)
// ...
const token = getAuthToken()   // synchronous — drop the `await`
// remove `getToken` from any useCallback/useEffect dependency arrays
```

**Files (apply the transformation to each):**
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`
- `apps/web/src/app/[locale]/(app)/trends/page.tsx`
- `apps/web/src/app/[locale]/(app)/create/page.tsx`
- `apps/web/src/app/[locale]/(app)/create/_components/VideoJobPanel.tsx`
- `apps/web/src/app/[locale]/(app)/calendar/page.tsx`
- `apps/web/src/app/[locale]/(app)/review/page.tsx`
- `apps/web/src/app/[locale]/(app)/review/campaigns/[id]/page.tsx`
- `apps/web/src/app/[locale]/(app)/brand/page.tsx`
- `apps/web/src/app/[locale]/(app)/analytics/page.tsx`
- `apps/web/src/app/[locale]/(app)/library/page.tsx`
- `apps/web/src/app/[locale]/(app)/library/drafts/page.tsx`
- `apps/web/src/app/[locale]/(app)/library/assets/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/onboarding/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/campaigns/new/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/campaigns/[id]/page.tsx`
- `apps/web/src/app/[locale]/(app)/settings/accounts/page.tsx`
- `apps/web/src/app/[locale]/(app)/settings/members/page.tsx`
- `apps/web/src/app/[locale]/(app)/settings/notifications/page.tsx`
- `apps/web/src/app/[locale]/(app)/settings/tasks/page.tsx`
- `apps/web/src/app/[locale]/(app)/settings/trend-sources/page.tsx`
- `apps/web/src/app/[locale]/(app)/layout.tsx`
- `apps/web/src/components/notification-bell.tsx`

- [ ] **Step 1: Find every remaining Clerk usage** so none is missed:

Run: `grep -rln "@clerk/nextjs\|useAuth\|getToken\|useUser\|SignedIn\|SignedOut\|UserButton" apps/web/src`
Expected (after edits): no output. Use this list to drive the edits — any file that still appears needs the transformation. Note `(app)/layout.tsx` may use `useUser`/`UserButton` for the avatar; if so, replace the user display with static text or remove it (no Clerk user object exists anymore).

- [ ] **Step 2: Apply the transformation** to each file above. For files that used `getToken` inside a `useCallback`, removing `getToken` from the dependency array is required (it no longer exists). Example before/after for a typical page:

Before:
```tsx
import { useAuth } from '@clerk/nextjs'
const { getToken } = useAuth()
const load = useCallback(async () => {
  const token = await getToken()
  const res = await fetch(`${apiBase}/...`, { headers: { Authorization: `Bearer ${token}` } })
}, [apiBase, getToken])
```
After:
```tsx
import { getAuthToken } from '@/lib/auth'
const load = useCallback(async () => {
  const token = getAuthToken()
  const res = await fetch(`${apiBase}/...`, { headers: { Authorization: `Bearer ${token}` } })
}, [apiBase])
```

- [ ] **Step 3: Re-run the grep until clean**

Run: `grep -rln "@clerk\|useAuth\|getToken\|SignedIn\|SignedOut\|UserButton" apps/web/src`
Expected: no output.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @contento/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): use cookie JWT (getAuthToken) instead of Clerk getToken across app"
```

---

## Task 11: Drop `@clerk/nextjs` from the web

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove** `"@clerk/nextjs": "..."` from `apps/web/package.json` `dependencies`.

- [ ] **Step 2: Confirm nothing imports it**

Run: `grep -rn "@clerk/nextjs" apps/web/src`
Expected: no output.

- [ ] **Step 3: Update the lockfile**

Run: `pnpm install --lockfile-only`
Expected: completes; `pnpm-lock.yaml` changes.

- [ ] **Step 4: Build the web to validate end-to-end compilation**

Run: `pnpm --filter @contento/web run build`
Expected: build succeeds, emits `.next/standalone`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): remove @clerk/nextjs dependency"
```

---

## Task 12: Env + Docker — add JWT_SECRET, remove Clerk

**Files:**
- Modify: `infra/.env.example`
- Modify: `Dockerfile`
- Modify: `infra/docker-compose.yml`

- [ ] **Step 1: `infra/.env.example`** — add a `JWT_SECRET` entry and remove the Clerk ones. Add near the other app secrets:

```
# Auth — secret used to sign/verify the email+password JWT (use a long random value)
JWT_SECRET=
```
Delete the `CLERK_SECRET_KEY=` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=` lines.

- [ ] **Step 2: `Dockerfile`** — in the `web-builder` stage, remove the two Clerk build args and their ENV lines. The stage should become:

```dockerfile
FROM deps AS web-builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm exec turbo run build --filter=@contento/web...
```
(Remove the `ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and its `ENV` line.)

- [ ] **Step 3: `infra/docker-compose.yml`** — in the `web` service, drop the Clerk build arg and the two Clerk env lines, and in the `api` service drop `CLERK_SECRET_KEY`. Add `JWT_SECRET` to the shared `x-app-env` anchor so both api and web-adjacent services get it:

In `x-app-env: &app-env` add:
```yaml
  JWT_SECRET: ${JWT_SECRET:-}
```
In `web.build.args`: keep only `NEXT_PUBLIC_API_URL`; remove `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
In `web.environment`: remove `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
In `api.environment`: remove `CLERK_SECRET_KEY` (it now inherits `JWT_SECRET` from `*app-env`).

- [ ] **Step 4: Validate the compose file**

Run: `docker compose -f infra/docker-compose.yml config >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add infra/.env.example Dockerfile infra/docker-compose.yml
git commit -m "chore(infra): add JWT_SECRET, remove Clerk env/build-args"
```

---

## Task 13: Deploy and verify on the server

**Server:** `root@89.125.82.179`, repo at `/opt/contento`.

- [ ] **Step 1: Push the branch/commits** to `origin/main` so the server can pull:

```bash
git push origin main
```

- [ ] **Step 2: Set `JWT_SECRET` on the server and remove Clerk env.** SSH in and edit `infra/.env`:

```bash
ssh root@89.125.82.179
cd /opt/contento
# generate + append a strong secret
echo "JWT_SECRET=$(openssl rand -hex 32)" >> infra/.env
# remove Clerk lines
sed -i '/^CLERK_SECRET_KEY=/d;/^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=/d' infra/.env
grep -c JWT_SECRET infra/.env   # expect 1
```

- [ ] **Step 3: Pull + redeploy:**

```bash
git fetch origin && git reset --hard origin/main
bash scripts/deploy.sh
```
Expected: build succeeds; `docker compose ps` shows web + api Up.

- [ ] **Step 4: Smoke test the auth flow** (from the server):

```bash
# register
curl -s -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}'
# expect: {"token":"...","user":{...}}

# use the token on a protected route (workspaces list)
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/workspaces -H "Authorization: Bearer $TOKEN"
# expect: 200
```

- [ ] **Step 5: Browser check.** Open `http://89.125.82.179:3000`:
  - Logged-out → redirected to `/{locale}/sign-in` (no more 404).
  - Register a user → lands on the dashboard.
  - Reload → still authenticated (cookie persists).
  - Logout (settings) → back to sign-in.

- [ ] **Step 6: Done.** No commit needed (deploy only). Note in the PR/summary that Clerk test keys can be deleted from the Clerk dashboard.

---

## Self-Review

- **Spec coverage:** backend route registration (T1), local JWT verify (T2), de-Clerk ensureUser (T2), drop `@clerk/backend` (T3), cookie helper (T4), middleware gating (T5), drop ClerkProvider (T6), sign-in/sign-up forms (T7/T8), logout (T9), getToken→getAuthToken across ~20 files (T10), drop `@clerk/nextjs` (T11), JWT_SECRET + remove Clerk env/build-args (T12), deploy + verify incl. the logged-out-404 fix (T13). All spec sections covered.
- **Placeholders:** none — every code step has full code; the one repeated transformation (T10) shows complete before/after and enumerates every file.
- **Type/name consistency:** `TOKEN_COOKIE`, `setAuthToken`, `getAuthToken`, `clearAuthToken`, `decodeUserId` are defined once and referenced consistently; `getAuthToken()` is synchronous everywhere (the `await` is dropped in T10).
- **Out-of-scope** items (password reset, email verification, social, refresh tokens) are intentionally excluded per the spec.
