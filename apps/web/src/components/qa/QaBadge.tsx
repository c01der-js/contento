'use client'

import { useTranslations } from 'next-intl'

type Finding = { id: string; severity: string; message: string }
type QaStatus = 'PASS' | 'WARN' | 'BLOCK'

const STYLES: Record<QaStatus, string> = {
  PASS: 'bg-green-100 text-green-700 border-green-200',
  WARN: 'bg-amber-100 text-amber-700 border-amber-200',
  BLOCK: 'bg-red-100 text-red-700 border-red-200',
}

export function QaBadge({ status, findings }: { status: QaStatus | null; findings: Finding[] | null }) {
  const t = useTranslations('qa')
  if (!status) return null
  const label = status === 'PASS' ? t('pass') : status === 'WARN' ? t('warn') : t('block')
  const notable = (findings ?? []).filter((f) => f.severity === 'warn' || f.severity === 'block')
  return (
    <div className="space-y-1">
      <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{label}</span>
      {notable.length > 0 && (
        <ul className="text-xs text-gray-500 list-disc pl-4">
          {notable.map((f) => (
            <li key={f.id}>{f.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
