import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { TOKEN_COOKIE } from './lib/auth'

const intlMiddleware = createIntlMiddleware(routing)

// Public (no auth needed): the localized sign-in / sign-up pages and the legal pages
// (privacy / terms / data-deletion) — the latter must be reachable for Meta/Google app-review.
const PUBLIC_PATH = /^\/[^/]+\/(sign-in|sign-up|privacy|terms|data-deletion)(?:\/.*)?$/

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = request.cookies.has(TOKEN_COOKIE)
  const isPublic = PUBLIC_PATH.test(pathname)

  if (!hasToken && !isPublic) {
    const rawLocale = pathname.split('/')[1]
    const locale = (routing.locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale
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
