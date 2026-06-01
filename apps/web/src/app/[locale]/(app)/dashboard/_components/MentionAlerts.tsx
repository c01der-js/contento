'use client'

import { useTranslations } from 'next-intl'

type Mention = {
  id: string
  source: string
  text: string
  sentiment: string
  urgency: number
  url: string
}

const sentimentColor: Record<string, string> = {
  positive: 'text-green-600',
  neutral: 'text-gray-600',
  negative: 'text-red-600',
}

export function MentionAlerts({ data }: { data: Mention[] }) {
  const t = useTranslations('dashboard')

  return (
    <section className="border rounded-lg p-4 border-amber-200 bg-amber-50">
      <h2 className="text-sm font-semibold mb-3 text-amber-800">{t('mentionsTitle')}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-amber-700/70">{t('mentionsEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {data.map(m => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border rounded p-3 bg-white hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500">{m.source}</span>
                <span
                  className={`text-xs font-semibold ${
                    sentimentColor[m.sentiment] ?? 'text-gray-600'
                  }`}
                >
                  {m.sentiment}
                </span>
                <span className="ml-auto text-xs font-bold text-amber-700">
                  {t('mentionsUrgency')} {m.urgency}/10
                </span>
              </div>
              <p className="text-sm text-gray-700 line-clamp-2">{m.text}</p>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
