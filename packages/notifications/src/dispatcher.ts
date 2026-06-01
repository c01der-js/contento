import { prisma } from '@contento/db'
import { sendEmail } from './channels/email.js'
import { sendTelegram } from './channels/telegram.js'
import { sendSlack } from './channels/slack.js'

export async function dispatchNotification(
  userId: string,
  notification: { type: string; title: string; body: string },
): Promise<void> {
  // Load user's notification channels
  const channels = await prisma.notificationChannel.findMany({
    where: { userId, enabled: true },
  })

  if (channels.length === 0) return

  // Load preferences for this user + notification type
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId, eventType: notification.type },
  })

  const preferenceMap = new Map(
    preferences.map((p) => [`${p.channel}:${p.eventType}`, p.enabled]),
  )

  const messageText = `${notification.title}\n\n${notification.body}`
  const messageHtml = `<strong>${escapeHtml(notification.title)}</strong><br>${escapeHtml(notification.body)}`

  await Promise.allSettled(
    channels.map(async (channel) => {
      const prefKey = `${channel.channel}:${notification.type}`
      // If a preference exists and is disabled, skip. If no preference, default to enabled.
      const isEnabled = preferenceMap.get(prefKey) ?? true
      if (!isEnabled) return

      const config = channel.config as Record<string, string>

      switch (channel.channel) {
        case 'EMAIL': {
          const email = config['email']
          if (!email) return
          await sendEmail(email, notification.title, messageHtml)
          break
        }
        case 'TELEGRAM': {
          const chatId = config['chatId']
          if (!chatId) return
          await sendTelegram(chatId, messageText)
          break
        }
        case 'SLACK': {
          const webhookUrl = config['webhookUrl']
          if (!webhookUrl) return
          await sendSlack(webhookUrl, messageText)
          break
        }
        case 'IN_APP':
          break
        default:
          break
      }
    }),
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
