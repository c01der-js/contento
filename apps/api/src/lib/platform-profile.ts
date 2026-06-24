import { prisma } from '@contento/db'
import {
  getPlatformProfile,
  platformProfileFromRow,
  type PlatformProfile,
  type PlatformProfileRow,
} from '@contento/shared'

/**
 * Resolve the effective PlatformProfile for a workspace + platform: the stored per-workspace
 * override row if one exists, otherwise the static default from @contento/shared.
 */
export async function resolvePlatformProfile(
  workspaceId: string,
  platform: string,
): Promise<PlatformProfile> {
  const row = await prisma.platformProfile.findUnique({
    where: { workspaceId_platform: { workspaceId, platform } },
  })
  return row ? platformProfileFromRow(row as PlatformProfileRow) : getPlatformProfile(platform)
}
