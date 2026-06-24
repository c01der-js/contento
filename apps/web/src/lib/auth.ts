export const TOKEN_COOKIE = 'contento_token'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

/** Store the JWT in a SameSite=Lax cookie readable by client JS (for the Bearer header). */
export function setAuthToken(token: string): void {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
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
