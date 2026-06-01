'use client'

import { usePathname } from 'next/navigation'
import { Link } from '@/i18n/navigation'

interface NavItem {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/studio', label: 'Studio', icon: '▶' },
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/trends', label: 'Trends', icon: '↑' },
  { href: '/brand', label: 'Brand Kit', icon: '◈' },
  { href: '/create', label: 'Create', icon: '+' },
  { href: '/review', label: 'Review', icon: '✓' },
  { href: '/calendar', label: 'Calendar', icon: '□' },
  { href: '/analytics', label: 'Analytics', icon: '∿' },
  { href: '/library', label: 'Library', icon: '⊟' },
]

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

function NavLink({ href, label, icon }: NavItem) {
  const pathname = usePathname()
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
      <span>{label}</span>
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
