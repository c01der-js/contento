'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useParams } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'

const ALLOWLIST = ['/studio/onboarding', '/settings', '/sign-in', '/sign-up']

function isAllowlisted(pathname: string): boolean {
  return ALLOWLIST.some((segment) => pathname.includes(segment))
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { activeId, status } = useWorkspace()
  const apiFetch = useApiFetch()
  const pathname = usePathname()
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  const locale = params?.locale ?? 'ru'

  const [redirecting, setRedirecting] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !activeId) return
    if (isAllowlisted(pathname)) return

    let cancelled = false

    async function checkPortrait() {
      try {
        const res = await apiFetch(`/workspaces/${activeId}/company-portrait`)
        if (cancelled || cancelledRef.current) return
        if (res.ok) {
          const data: unknown = await res.json()
          if (cancelled || cancelledRef.current) return
          // null means no portrait — redirect to onboarding
          if (data === null) {
            setRedirecting(true)
            router.replace(`/${locale}/studio/onboarding`)
          }
        }
        // On non-ok responses (e.g. 404 treated as no portrait), redirect
        else if (res.status === 404) {
          if (cancelled || cancelledRef.current) return
          setRedirecting(true)
          router.replace(`/${locale}/studio/onboarding`)
        }
        // Other errors: don't block the user
      } catch {
        // Network error — don't block
      }
    }

    void checkPortrait()

    return () => {
      cancelled = true
    }
  }, [status, activeId, pathname, locale, apiFetch, router])

  if (redirecting) return null

  return <>{children}</>
}
