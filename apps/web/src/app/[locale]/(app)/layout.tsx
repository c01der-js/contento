import { getTranslations } from 'next-intl/server'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { NavLinks, BottomNavLinks } from '@/components/nav-links'
import { LogoutButton } from '@/components/logout-button'
import { WorkspaceProvider } from '@/lib/workspace'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getTranslations('nav')

  return (
    <WorkspaceProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-900 tracking-tight">Contento</span>
          </div>

          {/* Workspace switcher */}
          <div className="px-3 py-3 border-b border-gray-100">
            <WorkspaceSwitcher />
          </div>

          {/* Main nav */}
          <div className="flex-1 px-3 py-3 overflow-y-auto">
            <NavLinks />
          </div>

          {/* Bottom nav + user */}
          <div className="px-3 pb-3 space-y-1 border-t border-gray-100 pt-3">
            <BottomNavLinks />
            <div className="flex items-center gap-2 px-2.5 py-2 mt-1">
              <LocaleSwitcher />
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="min-h-full px-8 py-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </WorkspaceProvider>
  )
}
