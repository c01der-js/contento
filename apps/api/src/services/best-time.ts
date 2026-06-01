import { clickhouseQuery } from '../clickhouse.js'

export interface HourlyScore {
  hour: number    // 0-23
  avgER: number   // engagement rate
  postCount: number
}

// Static defaults returned when no ClickHouse data is available
const STATIC_DEFAULTS: HourlyScore[] = [
  { hour: 9, avgER: 0, postCount: 0 },
  { hour: 12, avgER: 0, postCount: 0 },
  { hour: 15, avgER: 0, postCount: 0 },
  { hour: 18, avgER: 0, postCount: 0 },
  { hour: 19, avgER: 0, postCount: 0 },
]

export async function getBestPostingTimes(
  workspaceId: string,
  platform: string,
): Promise<HourlyScore[]> {
  try {
    const rows = await clickhouseQuery<{ hour: string; avgER: string; postCount: string }>(
      `SELECT
         toHour(published_at) as hour,
         avg(er) as avgER,
         count() as postCount
       FROM publication_events
       WHERE workspace_id = {workspaceId:String}
         AND platform = {platform:String}
       GROUP BY hour
       ORDER BY avgER DESC
       LIMIT 5`,
      { workspaceId, platform },
    )

    if (rows.length === 0) {
      return STATIC_DEFAULTS
    }

    return rows.map((r) => ({
      hour: Number(r.hour),
      avgER: Number(r.avgER),
      postCount: Number(r.postCount),
    }))
  } catch {
    // ClickHouse unavailable or no data — return static defaults
    return STATIC_DEFAULTS
  }
}
