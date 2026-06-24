'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/lib/api'

interface NotificationPayload {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

interface ToastMessage {
  id: string
  title: string
  body: string
}

const MAX_RECONNECT_DELAY_MS = 30_000
const INITIAL_RECONNECT_DELAY_MS = 1_000

export function NotificationBell() {
  const { getToken, isSignedIn } = useAuth()

  const [badgeCount, setBadgeCount] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY_MS)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function addToast(notification: NotificationPayload) {
    const toast: ToastMessage = {
      id: notification.id,
      title: notification.title,
      body: notification.body,
    }
    setToasts((prev) => [...prev.slice(-4), toast])
    // Auto-dismiss after 5 seconds
    setTimeout(() => dismissToast(toast.id), 5_000)
  }

  useEffect(() => {
    if (!isSignedIn) return

    let cancelled = false

    async function connect() {
      if (cancelled) return
      const token = await getToken()
      if (!token || cancelled) return

      // EventSource doesn't support custom headers; pass token as query param
      const url = `${API_BASE}/realtime/notifications?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (event) => {
        reconnectDelay.current = INITIAL_RECONNECT_DELAY_MS
        try {
          const payload = JSON.parse(event.data as string) as NotificationPayload
          setBadgeCount((c) => c + 1)
          addToast(payload)
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        if (!cancelled) {
          const delay = reconnectDelay.current
          reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)
          reconnectTimer.current = setTimeout(connect, delay)
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
      esRef.current?.close()
      esRef.current = null
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  if (!isSignedIn) return null

  return (
    <>
      {/* Bell icon with badge */}
      <button
        onClick={() => setBadgeCount(0)}
        className="relative p-1.5 rounded hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-0.5 leading-none">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-sm w-full pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 pointer-events-auto"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{toast.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{toast.body}</p>
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-gray-400 hover:text-gray-600 shrink-0 text-xs"
                  aria-label="Dismiss"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
