"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts"
import {
  api, type Kpis, type TimeseriesRow, type FunnelStep, type TopSku, type EventRow,
} from "../lib/api"

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fromInputDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`)
}

type State = {
  kpis: Kpis | null
  series: TimeseriesRow[]
  funnel: FunnelStep[]
  skus: TopSku[]
  recent: EventRow[]
}

const EMPTY: State = { kpis: null, series: [], funnel: [], skus: [], recent: [] }
const DATE_RANGE_ERROR = "A data inicial deve ser anterior à data final para carregar as metricas."

export default function Dashboard() {
  const today = useMemo(() => new Date(), [])
  const [start, setStart] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 30)
    return toInputDate(d)
  })
  const [end, setEnd] = useState(() => toInputDate(today))
  const [filterType, setFilterType] = useState<string>("")
  const [state, setState] = useState<State>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthy, setHealthy] = useState(true)
  const dateRangeInvalid = useMemo(() => fromInputDate(start) >= fromInputDate(end), [start, end])

  const load = useCallback(async () => {
    const s = fromInputDate(start)
    const e = fromInputDate(end)
    if (s >= e) {
      setError(DATE_RANGE_ERROR)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [kpis, series, funnel, skus, recent] = await Promise.all([
        api.kpis(s, e),
        api.timeseries(s, e),
        api.funnel(s, e),
        api.topSkus(s, e),
        api.recent(filterType || undefined, 20),
      ])
      setState({ kpis, series, funnel, skus, recent })
      setHealthy(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao carregar dados")
      setHealthy(false)
    } finally {
      setLoading(false)
    }
  }, [start, end, filterType])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => {
      api.health().then(h => setHealthy(h.db === "ok")).catch(() => setHealthy(false))
    }, 15000)
    return () => clearInterval(id)
  }, [])

  const seriesByBucket = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>()
    for (const r of state.series) {
      const key = r.bucket.slice(0, 10)
      const entry = map.get(key) || { bucket: key }
      entry[r.event_type] = r.total
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.bucket).localeCompare(String(b.bucket)),
    )
  }, [state.series])

  const maxFunnel = state.funnel[0]?.total || 1
  const showRetry = error !== DATE_RANGE_ERROR

  return (
    <div className="container">
      <header className="topbar">
        <div>
          <h1>Event Analytics</h1>
          <div className="status">
            <span className={`dot ${healthy ? "" : "down"}`} />
            {healthy ? "online" : "API indisponivel - exibindo ultimo estado"}
          </div>
        </div>
        <div className="controls">
          <label>
            Inicio
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Fim
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            Tipo (tabela)
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">todos</option>
              <option value="page_view">page_view</option>
              <option value="signup">signup</option>
              <option value="purchase">purchase</option>
            </select>
          </label>
          <label>
            &nbsp;
            <button onClick={load} disabled={loading || dateRangeInvalid}>
              {loading ? "carregando..." : "atualizar"}
            </button>
          </label>
        </div>
      </header>

      {dateRangeInvalid && (
        <div className="input-error">{DATE_RANGE_ERROR}</div>
      )}

      {error && (
        <div className="error">
          <span>{showRetry ? `falha: ${error}` : error}</span>
          {showRetry && <button onClick={load}>tentar novamente</button>}
        </div>
      )}

      <section className="grid-kpi">
        <KpiCard label="Page views" value={state.kpis?.page_views ?? 0} />
        <KpiCard label="Signups" value={state.kpis?.signups ?? 0}
          sub={`taxa ${pct(state.kpis?.signup_rate)}`} />
        <KpiCard label="Purchases" value={state.kpis?.purchases ?? 0}
          sub={`taxa ${pct(state.kpis?.purchase_rate)}`} />
        <KpiCard label="Receita" value={brl(state.kpis?.revenue ?? 0)} />
        <KpiCard label="Usuarios unicos" value={state.kpis?.unique_users ?? 0} />
      </section>

      <section className="grid-charts">
        <div className="card">
          <h2>Volume por dia</h2>
          {seriesByBucket.length === 0 ? (
            <div className="loading">sem dados no periodo</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesByBucket}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ background: "#131a26", border: "1px solid #1f2937" }} />
                <Legend />
                <Line type="monotone" dataKey="page_view" stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="signup" stroke="#eab308" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="purchase" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2>Funil</h2>
          {state.funnel.map((f) => (
            <div key={f.step} className="funnel-row">
              <span className="lbl">{f.step}</span>
              <div className="bar">
                <div className="fill" style={{ width: `${(f.total / maxFunnel) * 100}%` }} />
              </div>
              <span className="num">{f.total.toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-tables">
        <div className="card">
          <h2>Top SKUs</h2>
          {state.skus.length === 0 ? (
            <div className="loading">sem compras no periodo</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Compras</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {state.skus.map((s) => (
                  <tr key={s.sku}>
                    <td>{s.sku}</td>
                    <td>{s.total}</td>
                    <td>{brl(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Ultimos eventos{filterType ? ` (${filterType})` : ""}</h2>
          {state.recent.length === 0 ? (
            <div className="loading">sem eventos</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {state.recent.map((e) => (
                  <tr key={e.event_id}>
                    <td>{new Date(e.occurred_at).toLocaleString("pt-BR")}</td>
                    <td><span className="badge">{e.event_type}</span></td>
                    <td>{e.user_id || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

function pct(v: number | undefined) {
  if (!v || !Number.isFinite(v)) return "0%"
  return `${(v * 100).toFixed(1)}%`
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
