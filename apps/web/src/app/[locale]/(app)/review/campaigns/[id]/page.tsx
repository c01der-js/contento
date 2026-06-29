'use client'

import { getAuthToken } from '@/lib/auth'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch, API_BASE } from '@/lib/api'
import { QaBadge } from '@/components/qa/QaBadge'
import { useTranslations } from 'next-intl'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  hook: string
  scheduledDate: string
  status: string
  rejectComment: string | null
  videoJobId: string | null
  qaStatus: 'PASS' | 'WARN' | 'BLOCK' | null
  qaFindings: { id: string; severity: string; message: string }[] | null
}

interface VideoJob {
  id: string
  outputUrl: string | null
  status: string
}

interface Campaign {
  id: string
  name: string
  targetAction: string
  contentPlan: { items: ContentPlanItem[] } | null
}

export default function ReviewCampaignPage() {
  const apiFetch = useApiFetch()
  const { activeId: workspaceId } = useWorkspace()
  const params = useParams()
  const campaignId = params.id as string
  const t = useTranslations('review')
  const tCommon = useTranslations('common')

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [videoJobs, setVideoJobs] = useState<Record<string, VideoJob>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)
  const [videoToken, setVideoToken] = useState<string | null>(null)

  const fetchCampaign = useCallback(async () => {
    if (!workspaceId) return
    try {
      setVideoToken(getAuthToken())
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json() as Campaign
      setCampaign(data)

      const reviewItems = data.contentPlan?.items.filter(i => i.status === 'CLIENT_REVIEW' && i.videoJobId) ?? []
      const jobs: Record<string, VideoJob> = {}
      await Promise.all(reviewItems.map(async item => {
        if (!item.videoJobId) return
        const vRes = await apiFetch(`/workspaces/${workspaceId}/video-jobs/${item.videoJobId}`)
        if (vRes.ok) jobs[item.videoJobId] = await vRes.json() as VideoJob
      }))
      setVideoJobs(jobs)
    } catch (e) { setError(e instanceof Error ? e.message : tCommon('error')) }
    finally { setLoading(false) }
  }, [workspaceId, campaignId, apiFetch, tCommon])

  useEffect(() => { void fetchCampaign() }, [fetchCampaign])

  async function handleApprove(itemId: string) {
    if (!workspaceId) return
    setActionLoading(itemId)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}/approve`, {
        method: 'PUT',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : tCommon('error')) }
    finally { setActionLoading(null) }
  }

  async function handleReject(itemId: string) {
    if (!workspaceId || !rejectComment[itemId]) return
    setActionLoading(itemId)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ comment: rejectComment[itemId] }),
      })
      if (!res.ok) throw new Error(await res.text())
      setRejectOpen(null)
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : tCommon('error')) }
    finally { setActionLoading(null) }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">{tCommon('loading')}</div>
  if (!campaign) return <div className="p-6 text-gray-500">{t('campaignNotFound')}</div>

  const reviewItems = campaign.contentPlan?.items.filter(i => i.status === 'CLIENT_REVIEW') ?? []
  const otherItems = campaign.contentPlan?.items.filter(i => i.status !== 'CLIENT_REVIEW') ?? []

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('reviewSubtitle')}</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {reviewItems.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">{t('noVideosAwaiting')}</p>
          <p className="text-xs text-gray-400 mt-2">{t('checkBackLater')}</p>
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-900">{t('awaitingApproval')} ({reviewItems.length})</h2>
          {reviewItems.map(item => {
            const videoJob = item.videoJobId ? videoJobs[item.videoJobId] : null
            const isActing = actionLoading === item.id
            const isRejectOpen = rejectOpen === item.id

            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{item.topic}</h3>
                    <p className="text-xs text-gray-500 italic mt-1">&ldquo;{item.hook}&rdquo;</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(item.scheduledDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full">{t('needsReview')}</span>
                    <QaBadge status={item.qaStatus} findings={item.qaFindings} />
                  </div>
                </div>

                {videoJob?.outputUrl && videoToken ? (
                  <video
                    src={`${API_BASE}/workspaces/${workspaceId}/video-jobs/${videoJob.id}/output?token=${encodeURIComponent(videoToken)}`}
                    controls
                    className="w-full rounded-lg bg-black object-contain max-h-96"
                    style={{ aspectRatio: '9/16' }}
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                    <p className="text-sm text-gray-400">{t('videoLoading')}</p>
                  </div>
                )}

                {!isRejectOpen ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRejectOpen(item.id)}
                      disabled={isActing}
                      className="flex-1 py-2 px-4 text-sm border-2 border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {tCommon('reject')}
                    </button>
                    <button
                      onClick={() => { void handleApprove(item.id) }}
                      disabled={isActing || item.qaStatus === 'BLOCK'}
                      title={item.qaStatus === 'BLOCK' ? t('qaBlockTooltip') : undefined}
                      className="flex-1 py-2 px-4 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isActing ? t('processing') : t('approveSchedule')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none"
                      rows={2}
                      placeholder={t('whatToChange')}
                      value={rejectComment[item.id] ?? ''}
                      onChange={e => setRejectComment(r => ({ ...r, [item.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejectOpen(null)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        {tCommon('cancel')}
                      </button>
                      <button
                        onClick={() => { void handleReject(item.id) }}
                        disabled={isActing || !rejectComment[item.id]}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {isActing ? t('sending') : t('sendRejection')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {otherItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium text-gray-700 text-sm">{t('otherVideos')}</h2>
          {otherItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">{item.topic}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                item.status === 'PUBLISHED' || item.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                item.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>{item.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
