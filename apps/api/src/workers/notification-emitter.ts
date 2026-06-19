import { prisma } from '@contento/db'
import type { NotificationType } from '@contento/db'
import { notificationEmitter } from '../routes/realtime.js'
import { dispatchNotification } from '@contento/notifications'

const VALID_NOTIFICATION_TYPES = new Set<string>([
  'TREND_DIGEST',
  'PUBLISH_SUCCESS',
  'PUBLISH_FAILURE',
  'APPROVAL_NEEDED',
  'COMMENT_MENTION',
  'TASK_ASSIGNED',
  'GENERIC',
])

function toNotificationType(type: string): NotificationType {
  if (VALID_NOTIFICATION_TYPES.has(type)) {
    return type as NotificationType
  }
  return 'GENERIC'
}

/**
 * Create a Notification record and push it to any open SSE connections.
 * Also dispatches to external channels (email/telegram/slack) if configured.
 */
export async function emitNotification(params: {
  workspaceId: string
  userId: string
  type: string
  title: string
  body: string
  entityType?: string
  entityId?: string
}): Promise<void> {
  // Persist the notification
  const notification = await prisma.notification.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: toNotificationType(params.type),
      title: params.title,
      body: params.body,
      read: false,
      ...(params.entityType !== undefined && { entityType: params.entityType }),
      ...(params.entityId !== undefined && { entityId: params.entityId }),
    },
  })

  // Push to SSE subscribers
  notificationEmitter.emit('notification', params.userId, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  })

  // Dispatch to external channels (fire-and-forget)
  dispatchNotification(params.userId, {
    type: params.type,
    title: params.title,
    body: params.body,
  }).catch((err: unknown) => {
    console.error('[notification-emitter] External dispatch failed: %o', err)
  })
}
