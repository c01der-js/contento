'use client'

import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  format: string
  scheduledDate: string
  hook: string
  status: string
  rejectComment: string | null
  scriptId: string | null
  videoJobId: string | null
}

interface Campaign {
  id: string
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
  status: string
  contentPlan: { id: string; status: string; items: ContentPlanItem[] } | null
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  SCRIPTING: 'Writing script...',
  SCRIPTED: 'Script ready',
  VIDEO_QUEUED: 'Queued',
  VIDEO_GENERATING: 'Generating video...',
  VIDEO_DONE: 'Video ready',
  CLIENT_REVIEW: 'Awaiting approval',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
}

const ITEM_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  SCRIPTING: 'bg-blue-100 text-blue-700',
  SCRIPTED: 'bg-blue-100 text-blue-700',
  VIDEO_QUEUED: 'bg-yellow-100 text-yellow-700',
  VIDEO_GENERATING: 'bg-yellow-100 text-yellow-700',
  VIDEO_DONE: 'bg-blue-100 text-blue-700',
  CLIENT_REVIEW: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const IN_PROGRESS = new Set(['SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'])

export default function CampaignPage() {
  const { getToken } = useAuth()
  const { activeId: workspaceId } = useWorkspace()
  const params = useParams()
  const campaignId = params.id as string
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCampaign = useCallback(async () => {
    if (!workspaceId) return
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load campaign')
      setCampaign(await res.json() as Campaign)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }, [workspaceId, campaignId, API, getToken])

  useEffect(() => { void fetchCampaign() }, [fetchCampaign])

  useEffect(() => {
    if (!campaign?.contentPlan) return
    const hasInProgress = campaign.contentPlan.items.some(i => IN_PROGRESS.has(i.status))
    if (!hasInProgress) return
    const timer = setInterval(() => { void fetchCampaign() }, 10_000)
    return () => clearInterval(timer)
  }, [campaign, fetchCampaign])

  async function handleGeneratePlan() {
    if (!workspaceId) return
    setGenerating(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/content-plan/generate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setGenerating(false) }
  }

  async function handleApprovePlan() {
    if (!workspaceId) return
    setApproving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/approve-plan`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setApproving(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  if (!campaign) return <div className="p-6 text-gray-500">Campaign not found</div>

  const planStatus = campaign.contentPlan?.status
  const items = campaign.contentPlan?.items ?? []
  const canGenerate = !planStatus || planStatus === 'DRAFT'
  const canApprove = planStatus === 'DRAFT' && items.length > 0
  const isProducing = planStatus === 'IN_PRODUCTION'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Goal: {campaign.targetAction}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(campaign.startsAt).toLocaleDateString()} — {new Date(campaign.endsAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canGenerate && (
            <button
              onClick={() => { void handleGeneratePlan() }}
              disabled={generating}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {generating ? 'Generating...' : items.length > 0 ? 'Regenerate plan' : 'Generate plan'}
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => { void handleApprovePlan() }}
              disabled={approving}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {approving ? 'Starting...' : 'Approve & Start ->'}
            </button>
          )}
          {isProducing && (
            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full self-center">
              Production in progress...
            </span>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-gray-500">No content plan yet.</p>
          <button
            onClick={() => { void handleGeneratePlan() }}
            disabled={generating}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate content plan with AI'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Content Plan ({items.length} videos)</h2>
            {planStatus && (
              <span className={`text-xs px-2 py-1 rounded-full ${
                planStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                planStatus === 'IN_PRODUCTION' || planStatus === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>{planStatus}</span>
            )}
          </div>
          {items.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium shrink-0">
                  {item.index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{item.topic}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ITEM_STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ITEM_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                    {IN_PROGRESS.has(item.status) && (
                      <span className="text-xs text-gray-400 animate-pulse">●</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 italic">"{item.hook}"</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(item.scheduledDate).toLocaleDateString()} · {item.format}
                  </p>
                  {item.rejectComment && (
                    <p className="text-xs text-red-500 mt-1">Rejected: {item.rejectComment}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
