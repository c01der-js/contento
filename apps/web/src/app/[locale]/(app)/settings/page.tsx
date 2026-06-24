import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function SettingsPage() {
  const t = await getTranslations('settings')
  const items: { href: string; label: string }[] = [
    { href: '/settings/accounts', label: t('accounts') },
    { href: '/settings/notifications', label: t('notifications') },
    { href: '/settings/tasks', label: t('tasks') },
    { href: '/settings/members', label: t('members') },
    { href: '/settings/trend-sources', label: t('trendSources') },
    { href: '/settings/platform-profiles', label: t('platformProfiles') },
  ]
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t('title')}</h1>
      <nav className="flex flex-col gap-2 max-w-xs">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
          >
            <span>{item.label}</span>
            <span className="text-gray-400">→</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
