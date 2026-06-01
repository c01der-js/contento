'use client'

import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'

export function WorkspaceSwitcher() {
  const { workspaces, activeId, setActiveId, createWorkspace, status } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const active = workspaces.find(w => w.id === activeId)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreateError('')
    setCreating(true)
    try {
      await createWorkspace(newName.trim())
      setNewName('')
      setOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="px-3 py-2 rounded-lg border text-sm text-gray-400 w-full">
        Loading…
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium w-full hover:bg-gray-100"
      >
        <span className="truncate flex-1 text-left">{active?.name ?? 'Select workspace'}</span>
        <span className="shrink-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 py-1 min-w-0">
            {workspaces.map(w => (
              <button
                key={w.id}
                onClick={() => { setActiveId(w.id); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span className="truncate flex-1">{w.name}</span>
                {w.id === activeId && <span className="text-blue-600 shrink-0 text-xs">✓</span>}
              </button>
            ))}

            <div className="border-t mx-2 my-1" />

            <form onSubmit={handleCreate} className="px-3 py-2">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">New workspace</p>
              <input
                className="w-full border rounded px-2 py-1 text-xs mb-1.5 outline-none focus:ring-1 focus:ring-blue-400"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name…"
                autoFocus
              />
              {createError && <p className="text-xs text-red-500 mb-1">{createError}</p>}
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="w-full bg-black text-white text-xs rounded px-2 py-1.5 disabled:opacity-40 hover:bg-gray-800"
              >
                {creating ? 'Creating…' : '+ Create'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
