'use client'

import { useAuth } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  Button,
  Card,
  Badge,
  Spinner,
  EmptyState,
  ErrorBanner,
  StatusBadge,
  Input,
} from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────


interface Script {
  id: string
  workspaceId: string
  ideaId: string
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
  brandCheckScore: number | null
  brandCheckNotes: string | null
  createdAt: string
  updatedAt: string
}

interface Idea {
  id: string
  workspaceId: string
  trendId: string
  title: string
  angle: string
  format: string
  platform: string
  status: string
  createdAt: string
  updatedAt: string
}

interface Publication {
  id: string
  workspaceId: string
  scriptId: string
  renderJobId: string | null
  socialAccountId: string
  status: string
  platformPostId: string | null
  errorMessage: string | null
  publishedAt: string | null
  scheduledAt: string | null
  createdAt: string
  updatedAt: string
}

type ScriptStatus = 'ALL' | 'DRAFT' | 'BRAND_CHECKED' | 'APPROVED' | 'PUBLISHED'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getMonthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  })
}

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

function getDaysInMonth(date: Date): Date[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const days: Date[] = []
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  return days
}

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── Publication Status Badge ───────────────────────────────────────────────────

function PubStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { getToken } = useAuth()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null

  async function apiFetch(path: string, options?: RequestInit) {
    const token = await getToken()
    return fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState
          title="No workspaces"
          description="Create a workspace first."
          icon="🏢"
        />
      </div>
    )
  }

  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message="Failed to load workspace. Please refresh." />
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="flex items-center gap-3 p-6 text-sm text-gray-500">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return <CalendarContent workspaceId={workspaceId} apiFetch={apiFetch} />
}

// ── Calendar Content ───────────────────────────────────────────────────────────

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

function QuickActionsPanel({ workspaceId, apiFetch }: { workspaceId: string; apiFetch: ApiFetch }) {
  const [urgentTopic, setUrgentTopic] = useState('')
  const [seriesTopic, setSeriesTopic] = useState('')
  const [seriesCount, setSeriesCount] = useState(5)
  const [showUrgent, setShowUrgent] = useState(false)
  const [showSeries, setShowSeries] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [bestTime, setBestTime] = useState<{ hour: number; platform: string }[] | null>(null)

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/best-time`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setBestTime(d) })
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function handleUrgent() {
    if (!urgentTopic.trim()) return
    setLoading('urgent')
    setMessage(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/quick/urgent`, {
        method: 'POST',
        body: JSON.stringify({ topic: urgentTopic, platforms: ['instagram'] }),
      })
      if (!r.ok) throw new Error()
      setMessage({ text: 'Urgent post scheduled in 15 min!', ok: true })
      setUrgentTopic('')
      setShowUrgent(false)
    } catch {
      setMessage({ text: 'Failed to create urgent post.', ok: false })
    } finally {
      setLoading(null)
    }
  }

  async function handleSeries() {
    if (!seriesTopic.trim()) return
    setLoading('series')
    setMessage(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/quick/series`, {
        method: 'POST',
        body: JSON.stringify({ topic: seriesTopic, count: seriesCount, platforms: ['instagram'] }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json() as { scripts: { id: string }[] }
      setMessage({ text: `Created ${data.scripts?.length ?? seriesCount} series scripts!`, ok: true })
      setSeriesTopic('')
      setShowSeries(false)
    } catch {
      setMessage({ text: 'Failed to create series.', ok: false })
    } finally {
      setLoading(null)
    }
  }

  async function handleScheduleWeek() {
    setLoading('week')
    setMessage(null)
    try {
      const startDate = new Date().toISOString()
      const r = await apiFetch(`/workspaces/${workspaceId}/schedule/week`, {
        method: 'POST',
        body: JSON.stringify({ startDate }),
      })
      if (!r.ok) throw new Error()
      setMessage({ text: 'Week scheduled!', ok: true })
    } catch {
      setMessage({ text: 'Failed to schedule week.', ok: false })
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quick Actions</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setShowUrgent((v) => !v); setShowSeries(false) }}
        >
          Urgent Post
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setShowSeries((v) => !v); setShowUrgent(false) }}
        >
          Series
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleScheduleWeek}
          disabled={loading === 'week'}
          loading={loading === 'week'}
        >
          Schedule Week
        </Button>
        {bestTime && bestTime.length > 0 && (
          <span className="text-xs text-gray-500 ml-2">
            Best time: {bestTime.slice(0, 2).map((b) => `${b.platform} ${b.hour}:00`).join(', ')}
          </span>
        )}
      </div>

      {showUrgent && (
        <div className="flex gap-2 items-center mt-2">
          <Input
            value={urgentTopic}
            onChange={(e) => setUrgentTopic(e.target.value)}
            placeholder="Topic for urgent post…"
            className="flex-1 max-w-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleUrgent()}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleUrgent}
            disabled={loading === 'urgent' || !urgentTopic.trim()}
            loading={loading === 'urgent'}
          >
            Create
          </Button>
        </div>
      )}

      {showSeries && (
        <div className="flex gap-2 items-center flex-wrap mt-2">
          <Input
            value={seriesTopic}
            onChange={(e) => setSeriesTopic(e.target.value)}
            placeholder="Series topic…"
            className="flex-1 max-w-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleSeries()}
          />
          <Input
            type="number"
            value={seriesCount}
            onChange={(e) => setSeriesCount(Number(e.target.value))}
            min={2}
            max={10}
            className="w-16"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSeries}
            disabled={loading === 'series' || !seriesTopic.trim()}
            loading={loading === 'series'}
          >
            Create
          </Button>
        </div>
      )}

      {message && (
        <p className={`text-sm mt-2 ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </Card>
  )
}

function CalendarContent({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const [scripts, setScripts] = useState<Script[]>([])
  const [ideasMap, setIdeasMap] = useState<Record<string, Idea>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<ScriptStatus>('ALL')
  const [view, setView] = useState<'list' | 'grid'>('list')

  // Per-script expanded publications (list view)
  const [expandedScriptId, setExpandedScriptId] = useState<string | null>(null)
  const [publicationsMap, setPublicationsMap] = useState<Record<string, Publication[]>>({})
  const [publicationsLoading, setPublicationsLoading] = useState<Record<string, boolean>>({})

  // Grid view state
  const [allPubs, setAllPubs] = useState<Publication[]>([])
  const [gridLoading, setGridLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date())

  useEffect(() => {
    setLoading(true)
    setError('')

    Promise.all([
      apiFetch(`/workspaces/${workspaceId}/scripts`).then((r) => {
        if (!r.ok) throw new Error('Failed to load scripts')
        return r.json() as Promise<Script[]>
      }),
      apiFetch(`/workspaces/${workspaceId}/ideas`).then((r) => {
        if (!r.ok) return [] as Idea[]
        return r.json() as Promise<Idea[]>
      }),
    ])
      .then(([scriptList, ideaList]) => {
        setScripts(scriptList)
        const map: Record<string, Idea> = {}
        for (const idea of ideaList) {
          map[idea.id] = idea
        }
        setIdeasMap(map)
      })
      .catch(() => setError('Failed to load content. Please refresh.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Fetch all publications when switching to grid view
  useEffect(() => {
    if (view !== 'grid' || scripts.length === 0) return

    setGridLoading(true)
    Promise.all(
      scripts.map((s) =>
        apiFetch(`/workspaces/${workspaceId}/scripts/${s.id}/publications`)
          .then((r) => (r.ok ? (r.json() as Promise<Publication[]>) : ([] as Publication[])))
          .catch(() => [] as Publication[]),
      ),
    )
      .then((results) => {
        setAllPubs(results.flat())
      })
      .finally(() => setGridLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, workspaceId, scripts.length])

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId, destination } = result

    const pub = allPubs.find((p) => p.id === draggableId)
    if (!pub) return

    // Optimistic update
    setAllPubs((prev) =>
      prev.map((p) =>
        p.id === draggableId ? { ...p, scheduledAt: destination.droppableId } : p,
      ),
    )

    try {
      const res = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${pub.scriptId}/publications/${pub.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ scheduledAt: destination.droppableId + 'T00:00:00.000Z' }),
        },
      )
      if (!res.ok) throw new Error('reschedule failed')
    } catch {
      // Revert optimistic update on error
      setAllPubs((prev) =>
        prev.map((p) =>
          p.id === draggableId ? { ...p, scheduledAt: pub.scheduledAt } : p,
        ),
      )
    }
  }

  function prevMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  async function togglePublications(scriptId: string) {
    if (expandedScriptId === scriptId) {
      setExpandedScriptId(null)
      return
    }

    setExpandedScriptId(scriptId)

    if (publicationsMap[scriptId]) return

    setPublicationsLoading((prev) => ({ ...prev, [scriptId]: true }))
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/scripts/${scriptId}/publications`)
      if (!r.ok) throw new Error('Failed to load publications')
      const data = await r.json() as Publication[]
      setPublicationsMap((prev) => ({ ...prev, [scriptId]: data }))
    } catch {
      setPublicationsMap((prev) => ({ ...prev, [scriptId]: [] }))
    } finally {
      setPublicationsLoading((prev) => ({ ...prev, [scriptId]: false }))
    }
  }

  const STATUS_FILTERS: ScriptStatus[] = ['ALL', 'DRAFT', 'BRAND_CHECKED', 'APPROVED', 'PUBLISHED']

  const filtered = scripts.filter((s) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'PUBLISHED') {
      return s.status === 'PUBLISHED'
    }
    return s.status === statusFilter
  })

  // Sort by createdAt descending
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Group by month
  const groups: { label: string; scripts: Script[] }[] = []
  for (const script of sorted) {
    const label = getMonthLabel(script.createdAt)
    const existing = groups.find((g) => g.label === label)
    if (existing) {
      existing.scripts.push(script)
    } else {
      groups.push({ label, scripts: [script] })
    }
  }

  // Build scriptsMap for grid view (id -> hook lookup)
  const scriptsMap: Record<string, Script> = {}
  for (const s of scripts) {
    scriptsMap[s.id] = s
  }

  // Grid view: month days
  const days = getDaysInMonth(currentMonth)
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1 // Mon=0

  const monthLabel = currentMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Calendar</h1>

      <QuickActionsPanel workspaceId={workspaceId} apiFetch={apiFetch} />

      {/* View toggle */}
      <div className="flex gap-1 mb-4">
        <Button
          type="button"
          variant={view === 'list' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setView('list')}
        >
          List
        </Button>
        <Button
          type="button"
          variant={view === 'grid' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setView('grid')}
        >
          Grid
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setStatusFilter(f)}
            className={[
              'px-3 py-1 text-sm rounded-full border transition-colors',
              statusFilter === f
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
            ].join(' ')}
          >
            {f === 'ALL' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          {!loading && sorted.length === 0 && !error && (
            <EmptyState
              title="No scripts found"
              icon="📋"
              action={
                <Link href="/create" className="text-sm text-indigo-600 hover:underline">
                  Create one
                </Link>
              }
            />
          )}

          {!loading && groups.length > 0 && (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <div key={group.label}>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {group.scripts.map((script) => {
                      const idea = ideasMap[script.ideaId]
                      const isExpanded = expandedScriptId === script.id
                      const pubs = publicationsMap[script.id] ?? []
                      const pubsLoading = publicationsLoading[script.id] ?? false

                      return (
                        <Card key={script.id} padding={false} className="overflow-hidden">
                          {/* Script row */}
                          <div className="flex items-start gap-3 p-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 font-medium truncate">
                                {truncate(script.hook || '(no hook)', 80)}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {idea?.platform && (
                                  <Badge color="default">{idea.platform}</Badge>
                                )}
                                {idea?.format && (
                                  <span className="text-xs text-gray-400">
                                    {idea.format}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {formatDate(script.createdAt)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={script.status} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePublications(script.id)}
                              >
                                {isExpanded ? 'Hide' : 'Publications'}
                              </Button>
                            </div>
                          </div>

                          {/* Publications drawer */}
                          {isExpanded && (
                            <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                              {pubsLoading ? (
                                <div className="flex items-center gap-2 text-gray-400 text-xs py-1">
                                  <Spinner className="h-3.5 w-3.5" />
                                  <span>Loading publications…</span>
                                </div>
                              ) : pubs.length === 0 ? (
                                <p className="text-xs text-gray-400 py-1">
                                  No publications yet.{' '}
                                  <Link href="/create" className="text-indigo-600 hover:underline">
                                    Publish from Create
                                  </Link>
                                  .
                                </p>
                              ) : (
                                <ul className="flex flex-col gap-1.5 py-1">
                                  {pubs.map((pub) => (
                                    <li
                                      key={pub.id}
                                      className="flex items-center gap-2 text-xs"
                                    >
                                      <PubStatusBadge status={pub.status} />
                                      {pub.publishedAt && (
                                        <span className="text-gray-400">
                                          Published {formatDate(pub.publishedAt)}
                                        </span>
                                      )}
                                      {pub.scheduledAt && !pub.publishedAt && (
                                        <span className="text-gray-400">
                                          Scheduled {formatDate(pub.scheduledAt)}
                                        </span>
                                      )}
                                      {pub.errorMessage && (
                                        <span className="text-red-500 truncate max-w-xs">
                                          {pub.errorMessage}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── GRID VIEW ── */}
      {view === 'grid' && (
        <div>
          {/* Month navigation */}
          <div className="flex items-center gap-3 mb-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={prevMonth}
            >
              ‹
            </Button>
            <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
              {monthLabel}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={nextMonth}
            >
              ›
            </Button>
          </div>

          {gridLoading && (
            <div className="flex items-center gap-3 text-gray-500 text-sm mb-4">
              <Spinner />
              <span>Loading publications…</span>
            </div>
          )}

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-px mb-px">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="text-xs font-semibold text-gray-400 text-center py-1 bg-gray-50"
              >
                {d}
              </div>
            ))}
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
              {/* Offset cells */}
              {Array.from({ length: offset }).map((_, i) => (
                <div key={`offset-${i}`} className="bg-gray-50 min-h-[80px]" />
              ))}

              {/* Day cells */}
              {days.map((day) => {
                const dayKey = localDateKey(day)
                const dayPubs = allPubs.filter(
                  (p) => p.scheduledAt && p.scheduledAt.slice(0, 10) === dayKey,
                )

                return (
                  <Droppable key={dayKey} droppableId={dayKey}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={[
                          'min-h-[80px] bg-white p-1 relative transition-colors',
                          snapshot.isDraggingOver ? 'bg-indigo-50' : '',
                        ].join(' ')}
                      >
                        {/* Date number */}
                        <span className="absolute top-1 right-1.5 text-xs text-gray-400">
                          {day.getDate()}
                        </span>

                        {/* Publication cards */}
                        <div className="mt-4 flex flex-col gap-1">
                          {dayPubs.map((pub, index) => {
                            const script = scriptsMap[pub.scriptId]
                            const hook = script?.hook ?? ''
                            return (
                              <Draggable
                                key={pub.id}
                                draggableId={pub.id}
                                index={index}
                              >
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className={[
                                      'text-xs rounded-lg p-1 border cursor-grab select-none transition-shadow',
                                      dragSnapshot.isDragging
                                        ? 'shadow-md bg-white border-indigo-300'
                                        : 'bg-gray-50 border-gray-200 hover:border-indigo-200',
                                    ].join(' ')}
                                  >
                                    <p className="truncate text-gray-700 leading-tight mb-0.5">
                                      {truncate(hook || '(no hook)', 40)}
                                    </p>
                                    <PubStatusBadge status={pub.status} />
                                  </div>
                                )}
                              </Draggable>
                            )
                          })}
                        </div>
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                )
              })}

              {/* Trailing empty cells to fill last row */}
              {(() => {
                const totalCells = offset + days.length
                const remainder = totalCells % 7
                const trailing = remainder === 0 ? 0 : 7 - remainder
                return Array.from({ length: trailing }).map((_, i) => (
                  <div key={`trail-${i}`} className="bg-gray-50 min-h-[80px]" />
                ))
              })()}
            </div>
          </DragDropContext>
        </div>
      )}
    </div>
  )
}
