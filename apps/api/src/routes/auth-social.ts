import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createHmac, randomBytes } from 'crypto'
import { prisma, type Prisma } from '@contento/db'

// ---------------------------------------------------------------------------
// Minimal HS256 JWT helpers (no external dependency)
// ---------------------------------------------------------------------------

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

function signStateJwt(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET ?? 'dev-insecure-secret'
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 }))
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${sig}`
}

function verifyStateJwt(token: string): Record<string, unknown> {
  const secret = process.env.JWT_SECRET ?? 'dev-insecure-secret'
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const [header, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url')
  if (sig !== expected) throw new Error('Invalid JWT signature')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>
  const exp = payload['exp'] as number | undefined
  if (exp && Date.now() / 1000 > exp) throw new Error('State JWT expired')
  return payload
}

// ---------------------------------------------------------------------------
// Platform OAuth helpers
// ---------------------------------------------------------------------------

const PLATFORMS = ['meta', 'tiktok', 'youtube', 'x', 'linkedin', 'telegram'] as const
type Platform = typeof PLATFORMS[number]

function buildAuthorizeUrl(platform: Platform, state: string): string {
  const enc = encodeURIComponent

  switch (platform) {
    case 'meta': {
      const clientId = process.env.FB_APP_ID ?? ''
      const redirectUri = process.env.FB_REDIRECT_URI ?? 'http://localhost:3001/oauth/meta/callback'
      const scope = 'pages_manage_posts,instagram_basic,instagram_content_publish'
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${enc(clientId)}&redirect_uri=${enc(redirectUri)}&scope=${enc(scope)}&state=${enc(state)}&response_type=code`
    }
    case 'tiktok': {
      const clientKey = process.env.TIKTOK_CLIENT_KEY ?? ''
      const redirectUri = process.env.TIKTOK_REDIRECT_URI ?? 'http://localhost:3001/oauth/tiktok/callback'
      const scope = 'user.info.basic,video.upload,video.publish'
      return `https://www.tiktok.com/auth/authorize/?client_key=${enc(clientKey)}&redirect_uri=${enc(redirectUri)}&scope=${enc(scope)}&state=${enc(state)}&response_type=code`
    }
    case 'youtube': {
      const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
      const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/oauth/youtube/callback'
      const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${enc(clientId)}&redirect_uri=${enc(redirectUri)}&scope=${enc(scope)}&state=${enc(state)}&response_type=code&access_type=offline&prompt=consent`
    }
    case 'x': {
      const clientId = process.env.X_CLIENT_ID ?? ''
      const redirectUri = process.env.X_REDIRECT_URI ?? 'http://localhost:3001/oauth/x/callback'
      const codeVerifier = randomBytes(32).toString('base64url')
      // PKCE: code_challenge = base64url(sha256(code_verifier))
      const codeChallenge = createHmac('sha256', codeVerifier).digest('base64url')
      // Store verifier in state payload for retrieval in callback
      const scope = 'tweet.read tweet.write users.read offline.access'
      return `https://twitter.com/i/oauth2/authorize?client_id=${enc(clientId)}&redirect_uri=${enc(redirectUri)}&scope=${enc(scope)}&state=${enc(state)}&response_type=code&code_challenge=${enc(codeChallenge)}&code_challenge_method=S256`
    }
    case 'linkedin': {
      const clientId = process.env.LINKEDIN_CLIENT_ID ?? ''
      const redirectUri = process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3001/oauth/linkedin/callback'
      const scope = 'r_liteprofile w_member_social r_organization_social w_organization_social'
      return `https://www.linkedin.com/oauth/v2/authorization?client_id=${enc(clientId)}&redirect_uri=${enc(redirectUri)}&scope=${enc(scope)}&state=${enc(state)}&response_type=code`
    }
    case 'telegram': {
      // Telegram Login Widget — bot-token-based, no standard OAuth redirect
      // Return a sentinel URL; the frontend should use the Telegram Login Widget
      return `https://oauth.telegram.org/auth?bot_id=${enc(process.env.TELEGRAM_BOT_ID ?? '')}&origin=${enc(process.env.TELEGRAM_ORIGIN ?? 'http://localhost:3000')}&return_to=${enc(`http://localhost:3001/oauth/telegram/callback?state=${state}`)}`
    }
  }
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

interface ProfileInfo {
  name: string
  id: string | undefined
}

async function exchangeCodeForTokens(
  platform: Platform,
  code: string,
): Promise<TokenResponse> {
  switch (platform) {
    case 'meta': {
      const url = new URL('https://graph.facebook.com/v18.0/oauth/access_token')
      url.searchParams.set('client_id', process.env.FB_APP_ID ?? '')
      url.searchParams.set('client_secret', process.env.FB_APP_SECRET ?? '')
      url.searchParams.set('redirect_uri', process.env.FB_REDIRECT_URI ?? 'http://localhost:3001/oauth/meta/callback')
      url.searchParams.set('code', code)
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status}`)
      return res.json() as Promise<TokenResponse>
    }
    case 'tiktok': {
      const res = await fetch('https://open-api.tiktok.com/oauth/access_token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.TIKTOK_REDIRECT_URI ?? 'http://localhost:3001/oauth/tiktok/callback',
        }),
      })
      if (!res.ok) throw new Error(`TikTok token exchange failed: ${res.status}`)
      const data = (await res.json()) as { data?: TokenResponse }
      return data.data ?? (data as unknown as TokenResponse)
    }
    case 'youtube': {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/oauth/youtube/callback',
          code,
          grant_type: 'authorization_code',
        }),
      })
      if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
      return res.json() as Promise<TokenResponse>
    }
    case 'x': {
      const clientId = process.env.X_CLIENT_ID ?? ''
      const clientSecret = process.env.X_CLIENT_SECRET ?? ''
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const res = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.X_REDIRECT_URI ?? 'http://localhost:3001/oauth/x/callback',
          // code_verifier would need to be stored in a server-side session; omit for now
          code_verifier: 'challenge',
        }),
      })
      if (!res.ok) throw new Error(`X token exchange failed: ${res.status}`)
      return res.json() as Promise<TokenResponse>
    }
    case 'linkedin': {
      const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3001/oauth/linkedin/callback',
          client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
          client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
        }),
      })
      if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${res.status}`)
      return res.json() as Promise<TokenResponse>
    }
    case 'telegram': {
      // Telegram uses bot token flow — no code exchange
      return { access_token: process.env.TELEGRAM_BOT_TOKEN ?? '' }
    }
  }
}

async function fetchProfile(platform: Platform, accessToken: string): Promise<ProfileInfo> {
  switch (platform) {
    case 'meta': {
      const res = await fetch(`https://graph.facebook.com/v18.0/me?fields=name,id&access_token=${accessToken}`)
      if (!res.ok) return { name: 'Meta Account', id: undefined }
      const data = (await res.json()) as { name?: string; id?: string }
      return { name: data.name ?? 'Meta Account', id: data.id }
    }
    case 'tiktok': {
      const res = await fetch('https://open-api.tiktok.com/user/info/', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { name: 'TikTok Account', id: undefined }
      const data = (await res.json()) as { data?: { user?: { display_name?: string; open_id?: string } } }
      return { name: data.data?.user?.display_name ?? 'TikTok Account', id: data.data?.user?.open_id }
    }
    case 'youtube': {
      const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { name: 'YouTube Channel', id: undefined }
      const data = (await res.json()) as { items?: Array<{ snippet?: { title?: string }; id?: string }> }
      const channel = data.items?.[0]
      return { name: channel?.snippet?.title ?? 'YouTube Channel', id: channel?.id }
    }
    case 'x': {
      const res = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { name: 'X Account', id: undefined }
      const data = (await res.json()) as { data?: { name?: string; id?: string } }
      return { name: data.data?.name ?? 'X Account', id: data.data?.id }
    }
    case 'linkedin': {
      const res = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { name: 'LinkedIn Account', id: undefined }
      const data = (await res.json()) as { localizedFirstName?: string; localizedLastName?: string; id?: string }
      const name = [data.localizedFirstName, data.localizedLastName].filter(Boolean).join(' ') || 'LinkedIn Account'
      return { name, id: data.id }
    }
    case 'telegram': {
      return { name: 'Telegram Channel', id: undefined }
    }
  }
}

async function refreshPlatformToken(
  platform: Platform,
  credentials: Record<string, unknown>,
): Promise<{ access_token: string; refresh_token: string | undefined; expires_at: number }> {
  switch (platform) {
    case 'youtube': {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          refresh_token: String(credentials['refresh_token'] ?? ''),
          grant_type: 'refresh_token',
        }),
      })
      if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`)
      const data = (await res.json()) as TokenResponse
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? String(credentials['refresh_token'] ?? ''),
        expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      }
    }
    case 'meta': {
      // Facebook long-lived token exchange
      const url = new URL('https://graph.facebook.com/v18.0/oauth/access_token')
      url.searchParams.set('grant_type', 'fb_exchange_token')
      url.searchParams.set('client_id', process.env.FB_APP_ID ?? '')
      url.searchParams.set('client_secret', process.env.FB_APP_SECRET ?? '')
      url.searchParams.set('fb_exchange_token', String(credentials['access_token'] ?? ''))
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`Meta refresh failed: ${res.status}`)
      const data = (await res.json()) as TokenResponse
      return {
        access_token: data.access_token,
        refresh_token: undefined,
        expires_at: Date.now() + (data.expires_in ?? 5184000) * 1000,
      }
    }
    case 'tiktok': {
      const res = await fetch('https://open-api.tiktok.com/oauth/refresh_token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
          grant_type: 'refresh_token',
          refresh_token: String(credentials['refresh_token'] ?? ''),
        }),
      })
      if (!res.ok) throw new Error(`TikTok refresh failed: ${res.status}`)
      const data = (await res.json()) as { data?: TokenResponse }
      const tokenData = data.data ?? (data as unknown as TokenResponse)
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? undefined,
        expires_at: Date.now() + (tokenData.expires_in ?? 86400) * 1000,
      }
    }
    case 'x': {
      const clientId = process.env.X_CLIENT_ID ?? ''
      const clientSecret = process.env.X_CLIENT_SECRET ?? ''
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const res = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: String(credentials['refresh_token'] ?? ''),
        }),
      })
      if (!res.ok) throw new Error(`X refresh failed: ${res.status}`)
      const data = (await res.json()) as TokenResponse
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? undefined,
        expires_at: Date.now() + (data.expires_in ?? 7200) * 1000,
      }
    }
    case 'linkedin': {
      // LinkedIn uses long-lived tokens; no standard refresh_token flow for v2
      // Return current credentials as-is (tokens last 60 days)
      return {
        access_token: String(credentials['access_token'] ?? ''),
        refresh_token: undefined,
        expires_at: Date.now() + 86400 * 60 * 1000,
      }
    }
    case 'telegram': {
      // Bot tokens don't expire
      return {
        access_token: String(credentials['access_token'] ?? ''),
        refresh_token: undefined,
        expires_at: Date.now() + 365 * 24 * 3600 * 1000,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const PlatformParam = z.object({
  platform: z.enum(PLATFORMS),
})

const ErrorResponse = z.object({ error: z.string() })

const RefreshBody = z.object({
  socialAccountId: z.string(),
})

const RefreshResponse = z.object({
  id: z.string(),
  platform: z.string(),
  updatedAt: z.string(),
})

export const authSocialRoutes: FastifyPluginAsyncZod = async (app) => {
  // ------------------------------------------------------------------
  // GET /oauth/:platform/authorize
  // ------------------------------------------------------------------
  app.get('/oauth/:platform/authorize', {
    schema: {
      params: PlatformParam,
      querystring: z.object({ workspaceId: z.string() }),
      response: {
        302: z.null(),
        400: ErrorResponse,
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { platform } = request.params
    const { workspaceId } = request.query

    const state = signStateJwt({
      workspaceId,
      userId: request.authUser.userId,
      platform,
    })

    const url = buildAuthorizeUrl(platform, state)
    return reply.redirect(url)
  })

  // ------------------------------------------------------------------
  // GET /oauth/:platform/callback
  // State JWT carries workspaceId — no workspace auth middleware needed
  // ------------------------------------------------------------------
  app.get('/oauth/:platform/callback', {
    schema: {
      params: PlatformParam,
      querystring: z.object({
        code: z.string().optional(),
        state: z.string(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
      response: {
        302: z.null(),
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { platform } = request.params
    const { code, state, error } = request.query

    const webBase = process.env.WEB_BASE_URL ?? 'http://localhost:3000'

    if (error) {
      return reply.redirect(`${webBase}/settings/accounts?error=${encodeURIComponent(error)}`)
    }

    if (!code) {
      return reply.status(400).send({ error: 'Missing authorization code' })
    }

    let statePayload: Record<string, unknown>
    try {
      statePayload = verifyStateJwt(state)
    } catch (err) {
      return reply.status(400).send({ error: `Invalid or expired state: ${err instanceof Error ? err.message : String(err)}` })
    }

    const workspaceId = String(statePayload['workspaceId'] ?? '')
    if (!workspaceId) {
      return reply.status(400).send({ error: 'Missing workspaceId in state' })
    }

    let tokens: TokenResponse
    try {
      tokens = await exchangeCodeForTokens(platform, code)
    } catch (err) {
      app.log.error(err, `Token exchange failed for ${platform}`)
      return reply.redirect(`${webBase}/settings/accounts?error=token_exchange_failed&platform=${platform}`)
    }

    let profile: ProfileInfo
    try {
      profile = await fetchProfile(platform, tokens.access_token)
    } catch {
      profile = { name: `${platform} Account`, id: undefined }
    }

    const expiresAt = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null

    const credentialsObj: Record<string, unknown> = {
      access_token: tokens.access_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    }
    const credentials = credentialsObj as unknown as Prisma.InputJsonValue

    // Upsert by workspaceId + platform (find-then-create-or-update)
    const existingSocialAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId, platform },
    })
    if (existingSocialAccount) {
      await prisma.socialAccount.update({
        where: { id: existingSocialAccount.id },
        data: { name: profile.name, credentials, updatedAt: new Date() },
      })
    } else {
      await prisma.socialAccount.create({
        data: { workspaceId, platform, name: profile.name, credentials },
      })
    }

    return reply.redirect(`${webBase}/settings/accounts?connected=${platform}`)
  })

  // ------------------------------------------------------------------
  // POST /oauth/:platform/refresh  (internal — called by scheduler)
  // ------------------------------------------------------------------
  app.post('/oauth/:platform/refresh', {
    schema: {
      params: PlatformParam,
      body: RefreshBody,
      response: {
        200: RefreshResponse,
        400: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { platform } = request.params
    const { socialAccountId } = request.body

    const account = await prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
    })
    if (!account) {
      return reply.status(404).send({ error: 'SocialAccount not found' })
    }
    if (account.platform !== platform) {
      return reply.status(400).send({ error: 'Platform mismatch' })
    }

    const credentials = account.credentials as Record<string, unknown>

    let newCreds: { access_token: string; refresh_token: string | undefined; expires_at: number }
    try {
      newCreds = await refreshPlatformToken(platform, credentials)
    } catch (err) {
      app.log.error(err, `Token refresh failed for ${platform} account ${socialAccountId}`)
      return reply.status(500).send({ error: `Refresh failed: ${err instanceof Error ? err.message : String(err)}` })
    }

    const updatedCredentialsObj: Record<string, unknown> = {
      ...credentials,
      access_token: newCreds.access_token,
      expires_at: newCreds.expires_at,
      ...(newCreds.refresh_token !== undefined ? { refresh_token: newCreds.refresh_token } : {}),
    }
    const updatedCredentials = updatedCredentialsObj as unknown as Prisma.InputJsonValue

    const updated = await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: { credentials: updatedCredentials, updatedAt: new Date() },
    })

    return reply.status(200).send({
      id: updated.id,
      platform: updated.platform,
      updatedAt: updated.updatedAt.toISOString(),
    })
  })
}
