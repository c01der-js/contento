'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

interface NavItem {
  href: string
  // Key into the 'nav' message namespace. Not named `key` — React reserves that prop and would
  // strip it when spreading items into <NavLink>.
  labelKey: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/studio', labelKey: 'studio', icon: '▶' },
  { href: '/dashboard', labelKey: 'dashboard', icon: '⊞' },
  { href: '/trends', labelKey: 'trends', icon: '↑' },
  { href: '/brand', labelKey: 'brand', icon: '◈' },
  { href: '/create', labelKey: 'create', icon: '+' },
  { href: '/review', labelKey: 'review', icon: '✓' },
  { href: '/calendar', labelKey: 'calendar', icon: '□' },
  { href: '/analytics', labelKey: 'analytics', icon: '∿' },
  { href: '/leads', labelKey: 'leads', icon: '👤' },
  { href: '/stories', labelKey: 'stories', icon: '📖' },
  { href: '/library', labelKey: 'library', icon: '⊟' },
]

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings', labelKey: 'settings', icon: '⚙' },
]

function NavLink({ href, labelKey, icon }: NavItem) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  // pathname has locale prefix like /en/dashboard — strip it for matching
  const normalised = pathname.replace(/^\/[a-z]{2}/, '') || '/'
  const isActive = normalised === href || (href !== '/dashboard' && normalised.startsWith(href))

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors select-none
        ${isActive
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
    >
      <span className="w-4 text-center shrink-0 text-[13px]">{icon}</span>
      <span>{t(labelKey)}</span>
    </Link>
  )
}

export function NavLinks() {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} {...item} />
      ))}
    </nav>
  )
}

export function BottomNavLinks() {
  return (
    <nav className="flex flex-col gap-0.5">
      {BOTTOM_ITEMS.map((item) => (
        <NavLink key={item.href} {...item} />
      ))}
    </nav>
  )
}
