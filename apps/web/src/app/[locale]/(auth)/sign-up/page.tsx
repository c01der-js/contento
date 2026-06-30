'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { setAuthToken } from '@/lib/auth'

export default function SignUpPage() {
  const t = useTranslations('auth')
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
      setError(t('errPasswordShort'))
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
        setError(res.status === 409 ? t('errEmailTaken') : t('errSignUp'))
        return
      }
      const { token } = (await res.json()) as { token: string }
      setAuthToken(token)
      router.replace(`/${locale}/studio/onboarding`)
    } catch {
      setError(t('errNetwork'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('signUpTitle')}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="text" placeholder={t('name')} value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border px-3 py-2" />
        <input type="email" required placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border px-3 py-2" />
        <input type="password" required minLength={8} placeholder={t('passwordMin')} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50">
          {loading ? t('signUpSubmitting') : t('signUpSubmit')}
        </button>
      </form>
      <p className="text-sm">
        {t('haveAccount')}{' '}
        <Link href={`/${locale}/sign-in`} className="underline">{t('signInLink')}</Link>
      </p>
    </div>
  )
}
