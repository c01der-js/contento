'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface AuthContextValue {
  token: string | null
  userId: string | null
  getToken: () => Promise<string | null>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  userId: null,
  getToken: async () => null,
  signOut: () => {},
})

function parseJwtSub(token: string): string | null {
  try {
    const [, payloadB64] = token.split('.')
    if (!payloadB64) return null
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]!) : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    setToken(getCookie('auth_token'))
  }, [])

  const userId = token ? parseJwtSub(token) : null

  function signOut() {
    document.cookie = 'auth_token=; path=/; max-age=0'
    setToken(null)
    window.location.href = '/sign-in'
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        userId,
        getToken: async () => getCookie('auth_token'),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
