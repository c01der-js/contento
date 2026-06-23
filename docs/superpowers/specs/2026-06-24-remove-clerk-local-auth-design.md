# Remove Clerk → local email+password auth (JWT in cookie)

**Date:** 2026-06-24
**Status:** Design approved (pending spec review)
**Decision:** Drop Clerk entirely. Users authenticate with email + password only (no social login). The backend already contains the building blocks; the work is to wire them up and replace Clerk on the web.

## Why

Clerk is overkill for the chosen auth model (email + password, no social login). It also currently breaks the deployed UX: `auth.protect()` returns 404 for logged-out users instead of redirecting to sign-in, and it requires `NEXT_PUBLIC_CLERK_*` build-time keys. Removing it simplifies the stack and fixes the bare-`/` and protected-route 404s.

## Current state (verified in code)

- **`apps/api/src/routes/auth.ts`** — local password auth EXISTS but is **not registered**: `POST /auth/register` and `POST /auth/login` with bcrypt + `jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' })`, returning `{ token, user: { id, email, name } }` (register → 409 if email taken; login → 401 on bad credentials). `server.ts` never calls `app.register(authRoutes)`, so these endpoints are currently 404.
- **`apps/api/src/plugins/auth.ts`** (`registerAuth`, IS registered) — reads the Bearer token (or `?token=` fallback) and resolves `authUser`. With `CLERK_SECRET_KEY` set it verifies via Clerk; without it, it decodes the JWT **without verification** (dev-only). `ensureUser(sub)` provisions a `User` + first `Workspace` (OWNER membership) on first request.
- **`User.passwordHash String?`** exists in the schema.
- **`JWT_SECRET` is unset** in `infra/.env.example` and on the server `.env`.
- **Web is Clerk-heavy**: `ClerkProvider` (`app/layout.tsx`), `clerkMiddleware` (`middleware.ts`), and ~20 `(app)` pages call `useAuth().getToken()` to authorize API calls (pattern: `const { getToken } = useAuth()` → `const token = await getToken()` → `Authorization: Bearer ${token}`).

## Approach (chosen: A — JWT in cookie)

Login/register store the JWT in a cookie; `middleware.ts` gates routes by cookie presence (a clean replacement for `clerkMiddleware`); pages read the same cookie to build the `Bearer` header. Single token store, server-side route gating preserved, minimal rewrite of the existing direct-API-call pattern.

Token storage: cookie `contento_token`, `path=/`, `SameSite=Lax`, `max-age` 30 days, **non-httpOnly** (client JS reads it for the `Bearer` header). Acceptable for the beta; the API always validates the JWT server-side regardless. Hardenable later (httpOnly + a Next.js proxy) — out of scope.

## Backend changes (`apps/api`)

1. **Register the auth routes.** Add `await app.register(authRoutes)` in `server.ts` (import from `./routes/auth.js`). `/auth/register` and `/auth/login` become live (no `/workspaces` prefix — they are pre-auth).
2. **Verify the local JWT in the plugin.** In `plugins/auth.ts`, rewrite `resolveAuthUser(token)` to `jwt.verify(token, process.env.JWT_SECRET)` and use `payload.sub` as `userId`. Remove `@clerk/backend` (`verifyToken`, `createClerkClient`) and the no-secret "decode without verify" branch. On verify failure → `null` (unauthenticated).
3. **De-Clerk `ensureUser`.** Keep the User + first-Workspace provisioning, but drop the Clerk profile fetch (`clerk.users.getUser`). The `User` row already exists (created at register); `ensureUser` only needs to provision the first `Workspace`/`Membership` if none exists. (Email/name come from the register payload, not Clerk.)
4. **Deps/env.** Remove `@clerk/backend` from `apps/api/package.json`; remove `CLERK_SECRET_KEY` usage. Make `JWT_SECRET` required (already asserted in `auth.ts`).

## Frontend changes (`apps/web`)

1. **sign-in / sign-up pages** (`[locale]/(auth)/sign-in`, `/sign-up`): replace Clerk `<SignIn>`/`<SignUp>` with local forms (email + password; `react-hook-form` + `zod` per project convention). On submit → `POST ${NEXT_PUBLIC_API_URL}/auth/login` (or `/register`) → on success set the `contento_token` cookie and redirect to `/{locale}/dashboard`. Surface 409/401 errors via `sonner`.
2. **`middleware.ts`**: remove `clerkMiddleware`; keep the next-intl middleware. New logic: if no `contento_token` cookie and the path is not public (`/{locale}/sign-in`, `/{locale}/sign-up`), redirect to `/{locale}/sign-in`. This also fixes the current logged-out 404s.
3. **`app/layout.tsx`**: remove `<ClerkProvider>` wrapper.
4. **Token access helper**: add `getAuthToken()` (reads the `contento_token` cookie) in a small `lib/auth` module; optionally an `apiFetch()` wrapper. Replace every `useAuth().getToken()` call site (~20 pages) with `getAuthToken()`.
5. **Logout**: a control in the header/settings that clears the `contento_token` cookie and redirects to `/{locale}/sign-in`.
6. **Deps/env/build**: remove `@clerk/nextjs` from `apps/web/package.json`; remove `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the web env, the `Dockerfile` web-builder args, and the compose `web.build.args`/`environment` (the Clerk build-args added during deploy).

## Infra / deploy

- Add `JWT_SECRET` (strong random value) to `infra/.env.example` and to the server's `infra/.env`. It is required by both the auth routes and the verifying plugin.
- Remove the Clerk env vars from `infra/.env` / `.env.example`.
- Redeploy: `scripts/deploy.sh` (rebuilds web without Clerk, restarts api).

## Auth flow (end state)

```
register/login form → POST /auth/{register,login} → { token }
  → set cookie contento_token (SameSite=Lax, 30d)
  → redirect /{locale}/dashboard
each API call → Authorization: Bearer <contento_token cookie>
api plugin → jwt.verify(token, JWT_SECRET) → sub = userId → ensureUser → authUser
middleware → no cookie & protected route → redirect /{locale}/sign-in
logout → clear cookie → /{locale}/sign-in
```

## Out of scope (later)

Password reset via email, email verification, social login, refresh tokens (a 30-day JWT is sufficient for the beta), CSRF hardening / httpOnly+proxy.

## Risks / notes

- **Token in a non-httpOnly cookie is XSS-readable.** Accepted for the beta; documented for later hardening.
- **Existing Clerk-provisioned users** (if any test accounts exist) won't have a `passwordHash` and can't log in locally — they re-register. For the beta this is fine (no real data).
- The invitation/membership flow (`Invitation`, `Membership`) is unaffected — it keys off `User`/`email`, not Clerk.
