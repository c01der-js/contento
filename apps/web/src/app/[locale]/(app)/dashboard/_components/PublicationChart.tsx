'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useTranslations } from 'next-intl'

type PlatformCount = { platform: string; count: number }

export function PublicationChart({ data }: { data: PlatformCount[] }) {
  const t = useTranslations('dashboard')

  return (
    <section className="border rounded-lg p-4 bg-white shadow-sm">
      <h2 className="text-sm font-semibold mb-4 text-gray-800">{t('publicationChartTitle')}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{t('publicationChartEmpty')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="platform" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
              cursor={{ fill: 'rgba(99,102,241,0.08)' }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
