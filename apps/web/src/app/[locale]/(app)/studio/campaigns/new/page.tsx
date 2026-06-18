'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'

type Goal = 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'

const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: 'SALES', label: 'Sales', description: 'Drive purchases, bookings, sign-ups' },
  { value: 'SUBSCRIBERS', label: 'Subscribers', description: 'Grow followers across platforms' },
  { value: 'ENGAGEMENT', label: 'Engagement', description: 'Maximize likes, comments, shares' },
  { value: 'REACH', label: 'Reach', description: 'Brand awareness and visibility' },
]

// Mirrors @contento/shared TARGET_PLATFORMS (RU-speaking diaspora + CIS set).
const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube Shorts' },
  { value: 'telegram', label: 'Telegram' },
]

export default function NewCampaignPage() {
  const { getToken } = useAuth()
  const { activeId: workspaceId } = useWorkspace()
  const router = useRouter()
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    goal: 'SALES' as Goal,
    targetAction: '',
    targetPlatforms: ['tiktok', 'instagram', 'youtube', 'telegram'] as string[],
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  })

  async function handleSubmit() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      const campaign = await res.json() as { id: string }
      router.push(`/studio/campaigns/${campaign.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
        <p className="text-sm text-gray-500 mt-1">AI will generate a full content plan based on your brand and goal</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign name</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="e.g. July Product Launch"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Campaign goal</label>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, goal: opt.value }))}
                className={`text-left p-3 rounded-lg border-2 transition-colors
                  ${form.goal === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Target platforms</label>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORM_OPTIONS.map(opt => {
              const selected = form.targetPlatforms.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    targetPlatforms: selected
                      ? f.targetPlatforms.filter(p => p !== opt.value)
                      : [...f.targetPlatforms, opt.value],
                  }))}
                  className={`text-left p-3 rounded-lg border-2 transition-colors text-sm font-medium
                    ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1">Each platform gets its own tailored video.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target action</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="e.g. Book a free consultation call"
            value={form.targetAction}
            onChange={e => setForm(f => ({ ...f, targetAction: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">What should viewers do after watching?</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.startsAt}
              onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.endsAt}
              onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.push('/studio')}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.targetAction || form.targetPlatforms.length === 0}
            className="flex-1 py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create campaign ->'}
          </button>
        </div>
      </div>
    </div>
  )
}
