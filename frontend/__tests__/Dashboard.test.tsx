import { render, screen, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import Dashboard from "../components/Dashboard"

beforeEach(() => {
  const mockFetch = vi.fn(async (url: string) => {
    const u = String(url)
    let body: unknown = {}
    if (u.includes("/metrics/kpis")) {
      body = {
        page_views: 1000, signups: 50, purchases: 10,
        revenue: 2500.5, unique_users: 120,
        signup_rate: 0.05, purchase_rate: 0.2,
      }
    } else if (u.includes("/metrics/timeseries")) {
      body = [
        { bucket: "2026-01-01T00:00:00+00:00", event_type: "page_view", total: 500 },
        { bucket: "2026-01-01T00:00:00+00:00", event_type: "signup", total: 25 },
      ]
    } else if (u.includes("/metrics/funnel")) {
      body = [
        { step: "page_view", total: 1000 },
        { step: "signup", total: 50 },
        { step: "purchase", total: 10 },
      ]
    } else if (u.includes("/metrics/top-skus")) {
      body = [{ sku: "SKU-001", total: 5, revenue: 1200 }]
    } else if (u.includes("/events")) {
      body = []
    } else if (u.includes("/health")) {
      body = { status: "ok", db: "ok" }
    }
    return { ok: true, status: 200, json: async () => body, text: async () => "" } as Response
  })
  vi.stubGlobal("fetch", mockFetch)
})

describe("Dashboard", () => {
  it("renders KPIs after loading", async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText("Page views")).toBeInTheDocument()
      expect(screen.getByText("1.000")).toBeInTheDocument()
    })
  })

  it("shows error banner when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return { ok: false, status: 500, statusText: "err", json: async () => ({}), text: async () => "boom" } as Response
    }))
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText(/falha:/i)).toBeInTheDocument()
    })
  })
})
