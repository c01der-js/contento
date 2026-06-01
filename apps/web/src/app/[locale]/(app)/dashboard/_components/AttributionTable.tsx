'use client'

import { useTranslations } from 'next-intl'

type AttributionRow = { platform: string; format: string; count: number }

export function AttributionTable({ data }: { data: AttributionRow[] }) {
  const t = useTranslations('dashboard')

  return (
    <section className="border rounded-lg p-4 bg-white shadow-sm">
      <h2 className="text-sm font-semibold mb-4 text-gray-800">{t('attributionTitle')}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{t('attributionEmpty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2 font-medium">{t('attributionPlatform')}</th>
              <th className="pb-2 font-medium">{t('attributionFormat')}</th>
              <th className="pb-2 font-medium text-right">{t('attributionCount')}</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, i) => (
              <tr key={`${row.platform}-${row.format}-${i}`} className="border-t">
                <td className="py-1.5">{row.platform}</td>
                <td className="py-1.5 text-gray-500">{row.format || '—'}</td>
                <td className="py-1.5 text-right font-medium">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
