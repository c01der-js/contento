'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

/**
 * Single source for the API base URL. The web app calls the Fastify API directly from the
 * browser (there are no Next API routes). Previously this literal + an inline `apiFetch` were
 * copy-pasted into ~25 files; use this module instead.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

/**
 * Authenticated fetch against the API: prepends API_BASE, sets JSON content-type, and attaches
 * the Clerk bearer token. Caller-supplied headers win over the defaults. Same behaviour the
 * per-page `apiFetch` had — just shared.
 *
 * Usage (client component):
 *   const apiFetch = useApiFetch()
 *   const res = await apiFetch(`/workspaces/${id}/trends`)
 */
export function useApiFetch(): ApiFetch {
  const { getToken } = useAuth()
  return useCallback<ApiFetch>(
    async (path, options) => {
      const token = await getToken()
      return fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options?.headers,
        },
      })
    },
    [getToken],
  )
}
