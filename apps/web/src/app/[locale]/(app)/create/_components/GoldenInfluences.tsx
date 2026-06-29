'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ApiFetch } from '@/lib/api'

interface Influence {
  id: string
  title: string
  similarity: number
  snippet: string
}

/**
 * Feedback-loop surface: shows which high-performing golden examples are most similar to the
 * current script — i.e. what the loop weights into generation for content like this. Renders
 * nothing until there are matches (cold start / no embeddings yet → hidden).
 */
export function GoldenInfluences({
  workspaceId,
  scriptId,
  apiFetch,
}: {
  workspaceId: string
  scriptId: string
  apiFetch: ApiFetch
}) {
  const t = useTranslations('create')
  const [items, setItems] = useState<Influence[] | null>(null)

  useEffect(() => {
    let active = true
    void apiFetch(`/workspaces/${workspaceId}/scripts/${scriptId}/golden-influences`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active) setItems(data as Influence[])
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [workspaceId, scriptId, apiFetch])

  if (!items || items.length === 0) return null

  return (
    <div className="border rounded p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {t('goldenInfluencesTitle')}
      </p>
      <p className="text-xs text-gray-400">
        {t('goldenInfluencesDesc')}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{it.title || t('goldenInfluencesUntitled')}</span>
              <span className="text-xs text-indigo-600 shrink-0">{Math.round(it.similarity * 100)}% match</span>
            </div>
            {it.snippet && <p className="text-xs text-gray-500">{it.snippet}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
