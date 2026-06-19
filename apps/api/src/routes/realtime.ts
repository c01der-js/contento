import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyReply } from 'fastify'
import { EventEmitter } from 'node:events'

// Global in-process pub/sub for SSE notification delivery.
// Maps userId → list of SSE reply objects.
const sseSubscribers = new Map<string, Set<FastifyReply>>()

// Internal event emitter used by notification-emitter worker to push events.
export const notificationEmitter = new EventEmitter()
notificationEmitter.setMaxListeners(1000)

notificationEmitter.on('notification', (userId: string, payload: unknown) => {
  const connections = sseSubscribers.get(userId)
  if (!connections || connections.size === 0) return
  const data = JSON.stringify(payload)
  for (const reply of connections) {
    try {
      reply.raw.write(`data: ${data}\n\n`)
    } catch {
      // Connection closed — will be cleaned up on 'close' event
    }
  }
})

export const realtimeRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /realtime/notifications — SSE endpoint (user-scoped, no workspaceId prefix)
  app.get('/realtime/notifications', {
    schema: {},
  }, async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const userId = request.authUser.userId

    // SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.flushHeaders?.()

    // Register this connection
    if (!sseSubscribers.has(userId)) {
      sseSubscribers.set(userId, new Set())
    }
    sseSubscribers.get(userId)!.add(reply)

    // Send initial connected event
    reply.raw.write(': connected\n\n')

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(':heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 30_000)

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      sseSubscribers.get(userId)?.delete(reply)
      if (sseSubscribers.get(userId)?.size === 0) {
        sseSubscribers.delete(userId)
      }
    })

    // Keep the request open — do not return
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve)
      request.raw.on('end', resolve)
    })
  })
}
