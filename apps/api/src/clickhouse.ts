const CLICKHOUSE_URL = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123'

export async function clickhouseQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, string | number>,
): Promise<T[]> {
  const url = new URL(`${CLICKHOUSE_URL}/`)
  url.searchParams.set('default_format', 'JSONEachRow')
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(`param_${key}`, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: sql,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickHouse query error: ${text}`)
  }
  const text = await res.text()
  if (!text.trim()) return []
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as T)
}

export async function clickhouseInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const ndjson = rows.map(r => JSON.stringify(r)).join('\n')
  const res = await fetch(
    `${CLICKHOUSE_URL}/?query=${encodeURIComponent(`INSERT INTO ${table} FORMAT JSONEachRow`)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: ndjson,
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickHouse insert error: ${text}`)
  }
}
