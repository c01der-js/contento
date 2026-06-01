'use client'

import { useTranslations } from 'next-intl'

type LlmRow = { agent: string; model: string; calls: number; totalCostUsd: number }

export function LlmUsagePanel({ data }: { data: LlmRow[] }) {
  const t = useTranslations('dashboard')
  const totalCost = data.reduce((s, r) => s + r.totalCostUsd, 0)

  return (
    <section className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{t('llmUsageTitle')}</h2>
        <span className="text-sm text-gray-500">
          {t('llmUsageTotal')}: ${totalCost.toFixed(4)}
        </span>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{t('llmUsageEmpty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2 font-medium">{t('llmUsageAgent')}</th>
              <th className="pb-2 font-medium">{t('llmUsageModel')}</th>
              <th className="pb-2 font-medium text-right">{t('llmUsageCalls')}</th>
              <th className="pb-2 font-medium text-right">{t('llmUsageCost')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={`${row.agent}-${row.model}-${i}`} className="border-t">
                <td className="py-1.5">{row.agent}</td>
                <td className="py-1.5 text-gray-500 text-xs">{row.model}</td>
                <td className="py-1.5 text-right">{row.calls}</td>
                <td className="py-1.5 text-right font-medium">${row.totalCostUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
