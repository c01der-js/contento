export { PrismaClient, type Prisma } from './generated/client/index.js'
export type { Workspace, User, Membership, Invitation } from './generated/client/index.js'
export { MembershipRole } from './generated/client/index.js'
export type { BrandTone, BrandPillar, BrandVocabulary, Persona, VisualIdentity, Competitor, GoldenExample } from './generated/client/index.js'
export { VocabularyType } from './generated/client/index.js'
export type { Trend, Idea, Script, Hook } from './generated/client/index.js'
export { TrendStatus, IdeaStatus, ScriptStatus } from './generated/client/index.js'
export type { RenderJob } from './generated/client/index.js'
export { RenderJobStatus } from './generated/client/index.js'
export type { SocialAccount, Publication } from './generated/client/index.js'
export { PublicationStatus } from './generated/client/index.js'
export type { TabooTopic } from './generated/client/index.js'
export type { Project, Task, ActivityLog } from './generated/client/index.js'
export { TaskStatus, ActivityAction } from './generated/client/index.js'
export type { Notification, NotificationChannel, NotificationPreference } from './generated/client/index.js'
export { NotificationType, NotificationChannelType } from './generated/client/index.js'
export type { TrendFeedback, Comment, ScriptVersion, Mention } from './generated/client/index.js'
export { TrendFeedbackSignal, CommentEntityType, LengthVariant, TrendLifecycle } from './generated/client/index.js'
export { AbTestStatus, AbTestKind } from './generated/client/index.js'
export type { AbTest, AbVariant } from './generated/client/index.js'
export type { Asset, Goal, AntiExample, Integration, SocialAccountSnapshot } from './generated/client/index.js'
export { AssetKind, GoalType, IdeaGoal } from './generated/client/index.js'
export { AvatarPersonaStatus } from './generated/client/index.js'
export type { AvatarPersona } from './generated/client/index.js'

import { PrismaClient } from './generated/client/index.js'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
