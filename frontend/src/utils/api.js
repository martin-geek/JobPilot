/**
 * JobPilot API Client
 * All API calls to the FastAPI backend.
 */

const BASE = '/api'

async function fetchJSON(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API Error ${res.status}: ${error}`)
  }
  return res.json()
}

// ── Dashboard ───────────────────────────────────────
export const api = {
  dashboard: {
    stats: () => fetchJSON('/dashboard/stats'),
    queue: () => fetchJSON('/dashboard/queue'),
    pipeline: () => fetchJSON('/dashboard/pipeline'),
    salarySummary: () => fetchJSON('/dashboard/salary-summary'),
    mapData: () => fetchJSON('/dashboard/map-data'),
    marketInsights: () => fetchJSON('/dashboard/market-insights'),
    activity: (limit = 50) => fetchJSON(`/dashboard/activity?limit=${limit}`),
  },

  // ── Jobs ─────────────────────────────────────────
  jobs: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString()
      return fetchJSON(`/jobs/?${qs}`)
    },
    get: (id) => fetchJSON(`/jobs/${id}`),
    updateStatus: (id, status, notes) =>
      fetchJSON(`/jobs/${id}/status?status=${status}${notes ? `&notes=${encodeURIComponent(notes)}` : ''}`, {
        method: 'PATCH',
      }),
    override: (id, newCategory, reason) =>
      fetchJSON(`/jobs/${id}/override`, {
        method: 'POST',
        body: JSON.stringify({ new_category: newCategory, reason }),
      }),
    delete: (id) => fetchJSON(`/jobs/${id}`, { method: 'DELETE' }),
  },

  // ── Applications ─────────────────────────────────
  applications: {
    list: (status) => fetchJSON(`/applications/${status ? `?status=${status}` : ''}`),
    update: (id, data) =>
      fetchJSON(`/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // ── Companies ────────────────────────────────────
  companies: {
    list: (watchlistOnly = false) =>
      fetchJSON(`/companies/?watchlist_only=${watchlistOnly}`),
    create: (data) =>
      fetchJSON('/companies/', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => fetchJSON(`/companies/${id}`, { method: 'DELETE' }),
  },

  // ── Search Queries ───────────────────────────────
  searchQueries: {
    list: () => fetchJSON('/search-queries/'),
    create: (data) =>
      fetchJSON('/search-queries/', { method: 'POST', body: JSON.stringify(data) }),
    toggle: (id) =>
      fetchJSON(`/search-queries/${id}/toggle`, { method: 'PATCH' }),
    delete: (id) =>
      fetchJSON(`/search-queries/${id}`, { method: 'DELETE' }),
  },

  // ── Settings ─────────────────────────────────────
  settings: {
    getAll: () => fetchJSON('/settings/'),
    update: (key, value) =>
      fetchJSON(`/settings/${key}?value=${encodeURIComponent(value)}`, {
        method: 'PUT',
      }),
  },

  // ── Pipeline ─────────────────────────────────────
  pipeline: {
    run: () => fetchJSON('/pipeline/run', { method: 'POST' }),
    status: () => fetchJSON('/pipeline/status'),
  },

  // ── Health ───────────────────────────────────────
  health: () => fetchJSON('/health'),
}
