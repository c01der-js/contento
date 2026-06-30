'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

// ── System notice ────────────────────────────────────────────────────────────
// A single, designed notification plaque for every system message in Contento.
// It turns raw API errors (e.g. {"error":"Company portrait not found..."}) into a
// clear, localized title + explanation + a one-tap action — in the platform palette.

export type NoticeKind = 'error' | 'warning' | 'info' | 'success'

interface NoticeAction {
  label: string
  href?: string
  onClick?: () => void
}

interface ResolvedNotice {
  kind: NoticeKind
  title: string
  description?: string
  action?: NoticeAction
}

type T = (key: string) => string

/** Unwrap a `{"error":"…"}` payload that some screens render verbatim. */
function cleanMessage(raw: string): string {
  const s = raw.trim()
  if (s.startsWith('{') && s.includes('error')) {
    try {
      const o = JSON.parse(s) as { error?: unknown; message?: unknown }
      if (typeof o.error === 'string') return o.error
      if (typeof o.message === 'string') return o.message
    } catch {
      /* not JSON — fall through */
    }
  }
  return s
}

/** Map a raw error string to a friendly, localized notice with an action. */
function resolveNotice(raw: string, t: T): ResolvedNotice {
  const msg = cleanMessage(raw)
  const low = msg.toLowerCase()
  const has = (...needles: string[]) => needles.some((n) => low.includes(n))

  if (has('portrait not found', 'run onboarding', 'onboarding first'))
    return {
      kind: 'warning',
      title: t('onboarding.title'),
      description: t('onboarding.desc'),
      action: { label: t('onboarding.action'), href: '/studio/onboarding' },
    }
  if (has('unauthorized', 'session expired', 'invalid token', 'jwt'))
    return {
      kind: 'warning',
      title: t('unauthorized.title'),
      description: t('unauthorized.desc'),
      action: { label: t('unauthorized.action'), href: '/sign-in' },
    }
  if (has('forbidden', 'permission', 'not allowed', 'insufficient role'))
    return { kind: 'warning', title: t('forbidden.title'), description: t('forbidden.desc') }
  if (has('load failed', 'failed to fetch', 'networkerror', 'network request', 'fetch failed'))
    return {
      kind: 'error',
      title: t('network.title'),
      description: t('network.desc'),
      action: { label: t('network.action'), onClick: () => window.location.reload() },
    }
  if (has('internal server error', '500'))
    return { kind: 'error', title: t('server.title'), description: t('server.desc') }
  if (has('not found', '404'))
    return { kind: 'warning', title: t('notFound.title'), description: t('notFound.desc') }
  // Unknown error — keep the raw detail as the explanation so nothing is hidden.
  return { kind: 'error', title: t('generic.title'), description: msg }
}

const KIND: Record<NoticeKind, { wrap: string; bar: string; chip: string; icon: React.ReactNode }> = {
  error: {
    wrap: 'border-rose-200/70 bg-rose-50/70',
    bar: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-600 ring-rose-200',
    icon: <IconAlert />,
  },
  warning: {
    wrap: 'border-amber-200/70 bg-amber-50/70',
    bar: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700 ring-amber-200',
    icon: <IconWarn />,
  },
  info: {
    wrap: 'border-indigo-200/70 bg-indigo-50/70',
    bar: 'bg-indigo-500',
    chip: 'bg-indigo-100 text-indigo-600 ring-indigo-200',
    icon: <IconInfo />,
  },
  success: {
    wrap: 'border-emerald-200/70 bg-emerald-50/70',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-600 ring-emerald-200',
    icon: <IconCheck />,
  },
}

interface SystemNoticeProps {
  /** Raw error/message string — resolved to a friendly localized notice. */
  message?: string
  kind?: NoticeKind
  /** Explicit content (overrides `message` resolution). */
  title?: string
  description?: string
  action?: NoticeAction
  onDismiss?: () => void
  className?: string
}

export function SystemNotice({ message, kind, title, description, action, onDismiss, className }: SystemNoticeProps) {
  const tns = useTranslations('notices')
  const t: T = (key) => tns(key)
  const params = useParams()
  const rawLocale = params?.['locale']
  const locale = typeof rawLocale === 'string' ? rawLocale : Array.isArray(rawLocale) ? rawLocale[0] : 'ru'

  let k: NoticeKind = kind ?? 'info'
  let heading = title
  let body = description
  let act = action

  if (message && !heading) {
    const r = resolveNotice(message, t)
    k = kind ?? r.kind
    heading = r.title
    body = r.description
    act = action ?? r.action
  }

  const s = KIND[k]
  const actionClass =
    'mt-2.5 inline-flex items-center gap-1 rounded-md text-[12.5px] font-semibold text-indigo-600 transition-colors hover:text-indigo-800'

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 overflow-hidden rounded-xl border ${s.wrap} py-3.5 pl-4 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)] animate-[noticeIn_.28s_cubic-bezier(.16,1,.3,1)] ${className ?? ''}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
      <span className={`mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${s.chip}`}>
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-gray-900">{heading}</p>
        {body && <p className="mt-1 break-words text-[12.5px] leading-relaxed text-gray-500">{body}</p>}
        {act &&
          (act.href ? (
            <a href={`/${locale}${act.href}`} className={actionClass}>
              {act.label}
              <IconArrow />
            </a>
          ) : (
            <button type="button" onClick={act.onClick} className={actionClass}>
              {act.label}
              <IconArrow />
            </button>
          ))}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-0.5 mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600"
        >
          <IconClose />
        </button>
      )}
    </div>
  )
}

// ── Inline icons (no icon-library dependency) ─────────────────────────────────
function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}
function IconWarn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.3 2.3 4.7-4.8" />
    </svg>
  )
}
function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h13" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
