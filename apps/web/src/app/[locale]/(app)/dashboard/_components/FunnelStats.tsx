'use client'

import { useTranslations } from 'next-intl'

type Summary = { trends: number; ideas: number; scripts: number; publications: number } | null

export function FunnelStats({ data, loading }: { data: Summary; loading?: boolean }) {
  const t = useTranslations('dashboard')

  const steps = [
    { key: 'funnelTrends' as const, value: data?.trends ?? 0 },
    { key: 'funnelIdeas' as const, value: data?.ideas ?? 0 },
    { key: 'funnelScripts' as const, value: data?.scripts ?? 0 },
    { key: 'funnelPublished' as const, value: data?.publications ?? 0 },
  ]

  const max = Math.max(1, ...steps.map(s => s.value))

  return (
    <section className="border rounded-lg p-4 bg-white shadow-sm">
      <h2 className="text-sm font-semibold mb-4 text-gray-800">{t('funnelTitle')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {steps.map(s => {
          const pct = Math.round((s.value / max) * 100)
          return (
            <div key={s.key} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t(s.key)}</p>
              <p className="text-3xl font-bold text-gray-900">
                {loading ? <span className="text-gray-300">—</span> : s.value}
              </p>
              <div className="h-1.5 rounded bg-gray-100 overflow-hidden mt-1">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: loading ? '0%' : `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
