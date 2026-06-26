'use client'

import { useApiFetch } from '@/lib/api'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useWorkspace } from '@/lib/workspace'
import {
  Button,
  Card,
  Badge,
  Spinner,
  EmptyState,
  ErrorBanner,
  Select,
} from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST'

interface Lead {
  id: string
  name: string
  phone: string
  intent: string
  status: LeadStatus
  createdAt: string
  conversationId: string
}

interface Message {
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}

interface LeadDetail extends Lead {
  notes: string | null
  conversation: {
    id: string
    senderName: string
    detectedIntent: string | null
    igThreadId: string | null
    messages: Message[]
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE_COLOR: Record<LeadStatus, 'indigo' | 'yellow' | 'green' | 'red'> = {
  NEW: 'indigo',
  CONTACTED: 'yellow',
  CONVERTED: 'green',
  LOST: 'red',
}

const ALL_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Status label helper ────────────────────────────────────────────────────────

function useStatusLabel() {
  const t = useTranslations('leads')
  return (s: LeadStatus): string => {
    if (s === 'NEW') return t('statusNEW')
    if (s === 'CONTACTED') return t('statusCONTACTED')
    if (s === 'CONVERTED') return t('statusCONVERTED')
    return t('statusLOST')
  }
}

// ── Lead Row ───────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  isSelected,
  onClick,
}: {
  lead: Lead
  isSelected: boolean
  onClick: () => void
}) {
  const statusLabel = useStatusLabel()

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-gray-100 transition-colors text-sm
        ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-4 py-3 font-medium text-gray-900">{lead.name}</td>
      <td className="px-4 py-3 text-gray-500">{lead.phone}</td>
      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{lead.intent}</td>
      <td className="px-4 py-3">
        <Badge color={STATUS_BADGE_COLOR[lead.status]}>
          {statusLabel(lead.status)}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(lead.createdAt)}</td>
    </tr>
  )
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed
          ${isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
          }`}
      >
        <p className="whitespace-pre-wrap">{msg.text}</p>
        <p className={`text-xs mt-1 ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}>
          {new Date(msg.createdAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function LeadDetailPanel({
  leadId,
  workspaceId,
  apiFetch,
  onStatusChange,
  onClose,
}: {
  leadId: string
  workspaceId: string
  apiFetch: ReturnType<typeof useApiFetch>
  onStatusChange: (id: string, status: LeadStatus) => void
  onClose: () => void
}) {
  const t = useTranslations('leads')
  const tCommon = useTranslations('common')
  const statusLabel = useStatusLabel()

  const [detail, setDetail] = useState<LeadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDetail(null)
    apiFetch(`/workspaces/${workspaceId}/leads/${leadId}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<LeadDetail>
      })
      .then(setDetail)
      .catch(() => setError(t('errorLoadDetail')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, workspaceId])

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!detail) return
    setSavingStatus(true)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      if (!r.ok) throw new Error('patch-failed')
      const updated = (await r.json()) as Lead
      setDetail((prev) => (prev ? { ...prev, status: updated.status } : prev))
      onStatusChange(leadId, updated.status)
    } catch {
      setError(t('errorSaveStatus'))
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 overflow-hidden h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900 truncate">
          {detail ? detail.name : '…'}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {detail && !loading && (
        <>
          {/* Meta */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">{detail.phone}</span>
            <Badge color={STATUS_BADGE_COLOR[detail.status]}>
              {statusLabel(detail.status)}
            </Badge>
          </div>

          {/* Intent */}
          <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <span className="font-medium text-gray-700">{t('intent')}: </span>
            {detail.intent}
          </div>

          {/* Notes */}
          {detail.notes && (
            <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
              <span className="font-medium text-yellow-700">{t('notes')}: </span>
              {detail.notes}
            </div>
          )}

          {/* Status change */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('changeStatus')}:</span>
            <Select
              value={detail.status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={savingStatus}
              className="text-xs h-7"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
            {savingStatus && <Spinner className="h-3.5 w-3.5" />}
          </div>

          {/* Thread */}
          <div className="flex-1 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {t('conversation')}
            </p>
            {detail.conversation.messages.length === 0 ? (
              <p className="text-sm text-gray-400">{t('noMessages')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.conversation.messages.map((msg, i) => (
                  // index key is fine here — messages list is static once loaded
                  <MessageBubble key={i} msg={msg} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('leads')
  const tCommon = useTranslations('common')

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError =
    status === 'no-workspaces'
      ? 'no-workspaces'
      : status === 'fetch-failed'
        ? 'fetch-failed'
        : null

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    apiFetch(`/workspaces/${workspaceId}/leads`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<Lead[]>
      })
      .then((data) => setLeads(Array.isArray(data) ? data : []))
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function handleStatusChange(id: string, newStatus: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)))
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState title={tCommon('noWorkspaces')} icon="🏢" />
      </div>
    )
  }

  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message={tCommon('failedWorkspace')} />
      </div>
    )
  }

  const showPanel = selectedId !== null && workspaceId !== null

  return (
    <div className={`flex gap-6 ${showPanel ? 'items-start' : ''}`}>
      {/* Leads list */}
      <div className={`flex flex-col min-w-0 ${showPanel ? 'w-1/2' : 'w-full'}`}>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t('title')}</h1>

        {loading && (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
            <Spinner />
            <span>{tCommon('loading')}</span>
          </div>
        )}

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {!loading && !error && leads.length === 0 && (
          <EmptyState
            title={t('noLeads')}
            description={t('noLeadsHint')}
            icon="👤"
          />
        )}

        {!loading && leads.length > 0 && (
          <Card padding={false} className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('colName')}</th>
                  <th className="px-4 py-3 text-left">{t('colPhone')}</th>
                  <th className="px-4 py-3 text-left">{t('colIntent')}</th>
                  <th className="px-4 py-3 text-left">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-left">{t('colDate')}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedId === lead.id}
                    onClick={() =>
                      setSelectedId(selectedId === lead.id ? null : lead.id)
                    }
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Detail panel */}
      {showPanel && workspaceId && (
        <div
          className="w-1/2 shrink-0"
          style={{ maxHeight: 'calc(100vh - 7rem)', overflowY: 'auto' }}
        >
          <LeadDetailPanel
            leadId={selectedId!}
            workspaceId={workspaceId}
            apiFetch={apiFetch}
            onStatusChange={handleStatusChange}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}
