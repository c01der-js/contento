import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { ZodTypeProvider} from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { registerSwagger } from './plugins/swagger.js'
import { registerAuth } from './plugins/auth.js'
import { registerActivityLogger } from './plugins/activity-logger.js'
import { healthRoutes } from './routes/health.js'
import { workspaceRoutes } from './routes/workspaces.js'
import { invitationRoutes } from './routes/invitations.js'
import { brandKitRoutes } from './routes/brand-kit.js'
import { contentRoutes } from './routes/content.js'
import { renderRoutes } from './routes/render.js'
import { socialRoutes } from './routes/social.js'
import { reviewRoutes } from './routes/review.js'
import { startMentionPoller } from './workers/mention-ingest.js'
import { abTestRoutes } from './routes/ab-tests.js'
import { goalRoutes } from './routes/goals.js'
import { projectRoutes } from './routes/projects.js'
import { taskRoutes } from './routes/tasks.js'
import { activityRoutes } from './routes/activity.js'
import { realtimeRoutes } from './routes/realtime.js'
import { analyticsRoutes } from './routes/analytics.js'
import { commentRoutes } from './routes/comments.js'
import { assetRoutes } from './routes/assets.js'
import { libraryRoutes } from './routes/library.js'
import { authRoutes } from './routes/auth.js'
import { authSocialRoutes } from './routes/auth-social.js'
import { integrationRoutes, notificationPreferenceRoutes } from './routes/integrations.js'
import { mentionRoutes } from './routes/mentions.js'
import { scriptEditingRoutes } from './routes/script-editing.js'
import { scheduleRoutes } from './routes/schedule.js'
import { quickActionRoutes } from './routes/quick-actions.js'
import { startAnalyticsIngester } from './workers/analytics-ingester.js'
import { videoRoutes } from './routes/video.js'
import { webhookRoutes } from './routes/webhooks.js'
import { trendFeedConfigRoutes } from './routes/trend-feed-configs.js'
import { companyPortraitRoutes } from './routes/company-portrait.js'
import { avatarPersonaRoutes } from './routes/avatar-persona.js'
import { campaignRoutes } from './routes/campaigns.js'
import { startCampaignProducer } from './jobs/campaign-producer.js'

export async function createServer() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Treat empty application/json bodies as undefined (avoids FST_ERR_CTP_EMPTY_JSON_BODY on
  // POST endpoints that intentionally take no body but the client always sends Content-Type).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const s = (body as string).trim()
    if (s === '') return done(null, undefined)
    try { done(null, JSON.parse(s)) } catch (e) { done(e as Error) }
  })

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const status = error.statusCode ?? 500
    if (status < 500) return reply.status(status).send({ error: error.message })
    app.log.error(error)
    return reply.status(500).send({ error: 'Internal Server Error' })
  })

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  })

  await registerSwagger(app)
  await registerAuth(app)
  await registerActivityLogger(app)

  await app.register(authRoutes)
  await app.register(healthRoutes)
  await app.register(workspaceRoutes, { prefix: '/workspaces' })
  await app.register(invitationRoutes, { prefix: '/workspaces' })
  await app.register(brandKitRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(contentRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(renderRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(socialRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(reviewRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(abTestRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(goalRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(projectRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(taskRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(activityRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(analyticsRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(commentRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(assetRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(libraryRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(authSocialRoutes)
  await app.register(integrationRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(notificationPreferenceRoutes)
  await app.register(mentionRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(scriptEditingRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(scheduleRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(quickActionRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(videoRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(trendFeedConfigRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(companyPortraitRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(avatarPersonaRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(campaignRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(webhookRoutes)
  await app.register(realtimeRoutes)

  // Start background workers after server is ready.
  // Skipped under vitest: the workers connect to Postgres/Redis on boot, which aren't
  // available in the unit-test env and surfaced as an unhandled Prisma rejection.
  app.addHook('onReady', () => {
    if (process.env['VITEST']) return
    startMentionPoller()
    startAnalyticsIngester()
    startCampaignProducer()
  })

  return app
}
