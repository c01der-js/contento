'use client'

import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, Input, Select, EmptyState, ErrorBanner } from '@/components/ui'

type MemberRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'APPROVER' | 'VIEWER'

interface Member {
  userId: string
  role: MemberRole
  joinedAt: string
}

interface Invitation {
  id: string
  email: string
  role: string
  token: string
  expiresAt: string
  acceptedAt: string | null
}


const ROLES: Exclude<MemberRole, 'OWNER'>[] = ['ADMIN', 'EDITOR', 'APPROVER', 'VIEWER']

export default function MembersPage() {
  const { getToken } = useAuth()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const searchParams = useSearchParams()

  const { activeId, status } = useWorkspace()
  const workspaceId = searchParams.get('workspaceId') ?? activeId
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<MemberRole, 'OWNER'>>('EDITOR')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<string | null>(null)

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

  function loadData(wsId: string) {
    setLoading(true)
    Promise.all([
      apiFetch(`/workspaces/${wsId}/members`).then(r => r.json()),
      apiFetch(`/workspaces/${wsId}/invitations`).then(r => r.json()),
    ])
      .then(([m, inv]) => {
        setMembers(Array.isArray(m) ? m : [])
        setInvitations(Array.isArray(inv) ? inv : [])
        setError(null)
      })
      .catch(() => setError('Failed to load members'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!workspaceId) return
    loadData(workspaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function changeRole(userId: string, role: MemberRole) {
    if (!workspaceId) return
    const res = await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? 'Failed to update role')
      return
    }
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m))
  }

  async function removeMember(userId: string) {
    if (!workspaceId || !confirm('Remove this member?')) return
    const res = await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? 'Failed to remove member')
      return
    }
    setMembers(prev => prev.filter(m => m.userId !== userId))
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!workspaceId || !inviteEmail.trim()) return
    setInviting(true)
    setInviteResult(null)
    setError(null)
    const res = await apiFetch(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
    const body = await res.json().catch(() => ({})) as { token?: string; error?: string }
    if (!res.ok) {
      setError(body.error ?? 'Failed to send invitation')
    } else {
      const acceptUrl = `${apiBase}/workspaces/invitations/${body.token}/accept`
      setInviteResult(`Invite token: ${body.token} | Accept URL: ${acceptUrl}`)
      setInviteEmail('')
      if (workspaceId) loadData(workspaceId)
    }
    setInviting(false)
  }

  async function cancelInvitation(invId: string) {
    if (!workspaceId) return
    const res = await apiFetch(`/workspaces/${workspaceId}/invitations/${invId}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to cancel invitation'); return }
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState title="Create a workspace first." icon="🏢" />
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
      <div className="p-6 flex items-center gap-3 text-gray-400 text-sm">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  const pendingInvitations = invitations.filter(i => !i.acceptedAt)

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Members</h1>

      {error && <ErrorBanner message={error} />}

      {/* Member list */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Team Members</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm px-5 py-6">
            <Spinner />
            <span>Loading…</span>
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-6">
            <p className="text-sm text-gray-400">No members yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map(member => (
              <li key={member.userId} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 font-mono truncate">{member.userId}</p>
                  <p className="text-xs text-gray-400">{new Date(member.joinedAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {member.role === 'OWNER' ? (
                    <Badge color="purple">OWNER</Badge>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        onChange={e => changeRole(member.userId, e.target.value as MemberRole)}
                        className="text-xs"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </Select>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeMember(member.userId)}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Invite form */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Invite Member</h2>
        <form onSubmit={sendInvite} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="flex-1"
            />
            <Select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Exclude<MemberRole, 'OWNER'>)}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Button
              type="submit"
              variant="primary"
              disabled={inviting}
              loading={inviting}
            >
              Invite
            </Button>
          </div>
          {inviteResult && (
            <p className="text-xs text-green-700 bg-green-50 p-2 rounded-lg border border-green-200 break-all">{inviteResult}</p>
          )}
        </form>
      </Card>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <Card padding={false}>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Pending Invitations</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {pendingInvitations.map(inv => (
              <li key={inv.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    <Badge color="default" className="mr-1">{inv.role}</Badge>
                    expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => cancelInvitation(inv.id)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
