import { Link } from '@/i18n/navigation'

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <nav className="flex flex-col gap-2 max-w-xs">
        <Link
          href="/settings/accounts"
          className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
        >
          <span>Connected Accounts</span>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/settings/notifications"
          className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
        >
          <span>Notification Preferences</span>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/settings/tasks"
          className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
        >
          <span>My Tasks</span>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/settings/members"
          className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
        >
          <span>Members</span>
          <span className="text-gray-400">→</span>
        </Link>
        <Link
          href="/settings/trend-sources"
          className="flex items-center justify-between border rounded p-3 hover:bg-gray-50 text-sm"
        >
          <span>Trend Sources</span>
          <span className="text-gray-400">→</span>
        </Link>
      </nav>
    </div>
  )
}
