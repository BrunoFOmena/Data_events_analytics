const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type Kpis = {
  page_views: number
  signups: number
  purchases: number
  revenue: number
  unique_users: number
  signup_rate: number
  purchase_rate: number
}

export type TimeseriesRow = {
  bucket: string
  event_type: string
  total: number
}

export type FunnelStep = {
  step: string
  total: number
}

export type TopSku = {
  sku: string
  total: number
  revenue: number
}

export type EventRow = {
  event_id: string
  event_type: string
  occurred_at: string
  user_id: string | null
  properties: Record<string, unknown>
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store", ...init })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`API ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

function qs(start: Date, end: Date, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
  })
  return p.toString()
}

export const api = {
  kpis: (start: Date, end: Date) =>
    fetchJson<Kpis>(`/metrics/kpis?${qs(start, end)}`),
  timeseries: (start: Date, end: Date, granularity = "day") =>
    fetchJson<TimeseriesRow[]>(`/metrics/timeseries?${qs(start, end, { granularity })}`),
  funnel: (start: Date, end: Date) =>
    fetchJson<FunnelStep[]>(`/metrics/funnel?${qs(start, end)}`),
  topSkus: (start: Date, end: Date, limit = 5) =>
    fetchJson<TopSku[]>(`/metrics/top-skus?${qs(start, end, { limit })}`),
  recent: (eventType?: string, limit = 20) => {
    const p = new URLSearchParams({ limit: String(limit) })
    if (eventType) p.set("event_type", eventType)
    return fetchJson<EventRow[]>(`/events?${p.toString()}`)
  },
  health: () => fetchJson<{ status: string; db: string }>(`/health`),
}
