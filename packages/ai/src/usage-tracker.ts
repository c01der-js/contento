const CLICKHOUSE_URL = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123'

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-7': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
}

interface UsageData {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

function calcCost(model: string, usage: UsageData): number {
  const p = PRICING[model]
  if (!p) return 0
  const inputCost = (usage.input_tokens / 1_000_000) * p.input
  const outputCost = (usage.output_tokens / 1_000_000) * p.output
  const cacheWriteCost = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cacheWrite
  const cacheReadCost = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead
  return inputCost + outputCost + cacheWriteCost + cacheReadCost
}

export function trackUsage(
  workspaceId: string,
  agent: string,
  model: string,
  usage: UsageData,
): void {
  const row = {
    workspace_id: workspaceId,
    agent,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cost_usd: calcCost(model, usage),
    called_at: new Date().toISOString().replace('T', ' ').split('.')[0],
  }

  const ndjson = JSON.stringify(row)
  void fetch(
    `${CLICKHOUSE_URL}/?query=${encodeURIComponent('INSERT INTO llm_usage_events FORMAT JSONEachRow')}`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-ndjson' }, body: ndjson },
  ).catch((err: unknown) => {
    console.error('[trackUsage] failed:', err)
  })
}
