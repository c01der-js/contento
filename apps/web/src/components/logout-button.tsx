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
    <button type="button" onClick={onLogout} className="rounded-md border px-3 py-2 text-sm">
      Выйти
    </button>
  )
}
