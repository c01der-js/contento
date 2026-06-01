'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Link } from '@/i18n/navigation'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  status: string
  scheduledDate: string
}

interface Campaign {
  id: string
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
  status: string
  createdAt: string
  contentPlan: { id: string; status: string; items: ContentPlanItem[] } | null
}

const GOAL_LABELS: Record<string, string> = {
  SUBSCRIBERS: 'Subscribers',
  SALES: 'Sales',
  ENGAGEMENT: 'Engagement',
  REACH: 'Reach',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
}

export default function StudioPage() {
  const { getToken } = useAuth()
  const { activeId: workspaceId } = useWorkspace()
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load campaigns')
        const data = await res.json() as { items: Campaign[] }
        setCampaigns(data.items)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      } finally {
        setLoading(false)
      }
    })()
  }, [workspaceId])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Studio</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered video content factory</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/studio/onboarding')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Company Setup
          </button>
          <button
            onClick={() => router.push('/studio/campaigns/new')}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            New Campaign
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-gray-500">No campaigns yet.</p>
          <p className="text-sm text-gray-400">Set up your company profile and create your first video campaign.</p>
          <button
            onClick={() => router.push('/studio/onboarding')}
            className="mt-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Get started
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(campaign => {
            const itemCount = campaign.contentPlan?.items.length ?? 0
            const doneCount = campaign.contentPlan?.items.filter(i =>
              ['CLIENT_REVIEW', 'APPROVED', 'PUBLISHED'].includes(i.status)
            ).length ?? 0

            return (
              <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[campaign.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {campaign.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {GOAL_LABELS[campaign.goal] ?? campaign.goal}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">Goal: {campaign.targetAction}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(campaign.startsAt).toLocaleDateString()} — {new Date(campaign.endsAt).toLocaleDateString()}
                    </p>
                    {itemCount > 0 && (
                      <p className="text-xs text-gray-500">{doneCount}/{itemCount} videos ready</p>
                    )}
                  </div>
                  <Link href={`/studio/campaigns/${campaign.id}`}>
                    <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                      View
                    </button>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
