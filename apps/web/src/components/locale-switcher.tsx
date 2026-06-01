'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function switchLocale(newLocale: 'en' | 'ru') {
    router.replace(pathname, { locale: newLocale })
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => switchLocale('en')}
        className={locale === 'en' ? 'font-bold text-gray-900' : 'text-gray-400 hover:text-gray-600'}
      >
        EN
      </button>
      <span className="text-gray-300">/</span>
      <button
        type="button"
        onClick={() => switchLocale('ru')}
        className={locale === 'ru' ? 'font-bold text-gray-900' : 'text-gray-400 hover:text-gray-600'}
      >
        RU
      </button>
    </div>
  )
}
