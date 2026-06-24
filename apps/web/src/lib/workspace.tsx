'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useApiFetch } from '@/lib/api'

interface Workspace {
  id: string
  name: string
  slug: string
  createdAt: string
}

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeId: string | null
  status: 'loading' | 'ready' | 'no-workspaces' | 'fetch-failed'
  setActiveId: (id: string) => void
  createWorkspace: (name: string) => Promise<Workspace>
  refresh: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}

const STORAGE_KEY = 'activeWorkspaceId'

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const apiFetch = useApiFetch()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const [status, setStatus] = useState<WorkspaceContextValue['status']>('loading')

  async function load() {
    try {
      const r = await apiFetch('/workspaces')
      if (!r.ok) { setStatus('fetch-failed'); return }
      const data: Workspace[] = await r.json()
      if (!Array.isArray(data) || data.length === 0) { setStatus('no-workspaces'); return }
      setWorkspaces(data)
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      const valid = stored && data.some(w => w.id === stored) ? stored : data[0]!.id
      setActiveIdState(valid)
      setStatus('ready')
    } catch {
      setStatus('fetch-failed')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  function setActiveId(id: string) {
    setActiveIdState(id)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id)
  }

  async function createWorkspace(name: string): Promise<Workspace> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)
    const slug = `${base || 'ws'}-${Date.now().toString(36)}`
    const r = await apiFetch('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    })
    if (!r.ok) {
      const body = await r.json() as { error?: string }
      throw new Error(body.error ?? `HTTP ${r.status}`)
    }
    const ws: Workspace = await r.json()
    await load()
    setActiveId(ws.id)
    return ws
  }

  async function refresh() { await load() }

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeId, status, setActiveId, refresh, createWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
