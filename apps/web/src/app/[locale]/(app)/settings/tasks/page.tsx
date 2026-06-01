'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner, Input } from '@/components/ui'

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

interface Task {
  id: string
  workspaceId: string
  projectId: string | null
  assigneeId: string | null
  title: string
  description: string | null
  dueDate: string | null
  status: TaskStatus
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

const STATUS_BADGE_COLOR: Record<TaskStatus, 'default' | 'blue' | 'green'> = {
  TODO: 'default',
  IN_PROGRESS: 'blue',
  DONE: 'green',
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
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
    return <EmptyState title="No workspace found" description="Create a workspace first." />
  }
  if (workspaceError === 'fetch-failed') {
    return <div className="p-6"><ErrorBanner message="Failed to load workspace. Please refresh." /></div>
  }
  if (!workspaceId) {
    return <div className="p-6 flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>Loading…</span></div>
  }

  return <TasksContent workspaceId={workspaceId} apiFetch={apiFetch} />
}

// ── Tasks Content ─────────────────────────────────────────────────────────────

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

function TasksContent({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  function buildUrl() {
    const base = `/workspaces/${workspaceId}/tasks?assigneeId=me`
    if (statusFilter !== 'ALL') return `${base}&status=${statusFilter}`
    return base
  }

  async function load() {
    setIsLoading(true)
    try {
      const r = await apiFetch(buildUrl())
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: Task[] = await r.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load tasks.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function handleMarkDone(taskId: string) {
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      })
      if (!r.ok) throw new Error('Failed to update')
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'DONE' as TaskStatus } : t))
    } catch {
      setError('Failed to mark task as done.')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setIsCreating(true)
    setCreateError('')
    try {
      const body: Record<string, string> = { title: newTitle.trim() }
      if (newAssigneeId.trim()) body['assigneeId'] = newAssigneeId.trim()
      if (newDueDate) body['dueDate'] = new Date(newDueDate).toISOString()

      const r = await apiFetch(`/workspaces/${workspaceId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error('Failed to create')
      const created: Task = await r.json()
      setTasks((prev) => [created, ...prev])
      setNewTitle('')
      setNewAssigneeId('')
      setNewDueDate('')
    } catch {
      setCreateError('Failed to create task.')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete(taskId: string) {
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Failed to delete')
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch {
      setError('Failed to delete task.')
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">My Tasks</h1>

      {/* Quick-add form */}
      <Card className="mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add Task</h2>
        {createError && <div className="mb-3"><ErrorBanner message={createError} /></div>}
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <Input
            placeholder="Task title *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <Input
              placeholder="Assignee ID (optional)"
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="flex-1"
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <Button type="submit" loading={isCreating} disabled={!newTitle.trim()} className="shrink-0">
              Add
            </Button>
          </div>
        </form>
      </Card>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {(['ALL', 'TODO', 'IN_PROGRESS', 'DONE'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {s === 'ALL' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>Loading tasks…</span></div>
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks found" description="Add your first task above." icon="✓" />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <Card key={task.id} padding={false}>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge color={STATUS_BADGE_COLOR[task.status]}>
                      {STATUS_LABELS[task.status]}
                    </Badge>
                    <span className={`text-sm font-medium ${task.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {task.title}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-500 truncate">{task.description}</p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {task.status !== 'DONE' && (
                    <Button size="sm" variant="secondary" onClick={() => handleMarkDone(task.id)}>
                      Done
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => handleDelete(task.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
