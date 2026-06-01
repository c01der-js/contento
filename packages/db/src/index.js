export { PrismaClient } from './generated/client/index.js';
export { MembershipRole } from './generated/client/index.js';
export { VocabularyType } from './generated/client/index.js';
export { AssetKind } from './generated/client/index.js';
export { GoalType } from './generated/client/index.js';
export { TrendStatus, IdeaStatus, ScriptStatus } from './generated/client/index.js';
export { RenderJobStatus } from './generated/client/index.js';
export { PublicationStatus } from './generated/client/index.js';
export { IntegrationType, NotificationChannelType } from './generated/client/index.js';
import { PrismaClient } from './generated/client/index.js';
export const prisma = globalThis.__prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = prisma;
}
