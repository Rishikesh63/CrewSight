/**
 * CrewSight API client.
 *
 * All calls go to the FastAPI backend. BASE_URL is set via NEXT_PUBLIC_API_URL
 * (defaults to http://localhost:8000 for local development).
 *
 * Every function throws an ApiError with a descriptive message on failure —
 * callers should catch and display the message.
 */

import type {
  AllIntegrations,
  DashboardData,
  Discussions,
  IntegrationConfig,
  IssueDetailResponse,
  SourceStatus,
} from './types'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper
// ---------------------------------------------------------------------------

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`

  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    })
  } catch (err) {
    // Network-level error (backend not running, CORS blocked, etc.)
    throw new ApiError(
      0,
      `Cannot reach backend at ${BASE_URL}. Is the FastAPI server running?`,
    )
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}: ${res.statusText}`
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      // ignore parse errors on error responses
    }
    throw new ApiError(res.status, detail)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Fetch all open issues with cross-platform activity data.
 * Maps to GET /api/issues
 */
export async function fetchIssues(): Promise<DashboardData> {
  return fetchJSON<DashboardData>('/api/issues')
}

/**
 * Fetch the AI-generated triage briefing.
 * Maps to GET /api/summary
 */
export async function fetchSummary(): Promise<{ summary: string; mcp_queries: import('./types').MCPQuery[] }> {
  return fetchJSON<{ summary: string; mcp_queries: import('./types').MCPQuery[]; cached: boolean }>('/api/summary')
}

/**
 * Fetch a deep-dive view for a single issue by its GitHub issue number.
 * Maps to GET /api/issue/{issueNumber}
 */
export async function fetchIssueDetail(
  issueNumber: number,
): Promise<IssueDetailResponse> {
  return fetchJSON<IssueDetailResponse>(`/api/issue/${issueNumber}`)
}

/**
 * Fetch the status of all four Coral sources.
 * Maps to GET /api/sources
 */
export async function fetchSources(): Promise<SourceStatus[]> {
  const data = await fetchJSON<{ sources: SourceStatus[] }>('/api/sources')
  return data.sources
}

/**
 * Clear all backend caches and force a fresh data fetch on the next request.
 * Maps to POST /api/refresh
 */
export async function triggerRefresh(): Promise<void> {
  await fetchJSON<{ status: string }>('/api/refresh', { method: 'POST' })
}

/**
 * Fetch independent HN / Reddit / SO discussions about the project.
 * Maps to GET /api/discussions
 */
export async function fetchDiscussions(): Promise<Discussions> {
  return fetchJSON<Discussions>('/api/discussions')
}

/**
 * Fetch current integration config (secrets are masked).
 * Maps to GET /api/config
 */
export async function fetchConfig(): Promise<AllIntegrations> {
  return fetchJSON<AllIntegrations>('/api/config')
}

/**
 * Save config for one integration source.
 * Maps to POST /api/config/{source}
 */
export async function saveIntegration(
  source: string,
  config: Partial<IntegrationConfig>,
): Promise<void> {
  await fetchJSON(`/api/config/${source}`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

/**
 * Disable an integration source.
 * Maps to DELETE /api/config/{source}
 */
export async function disableIntegration(source: string): Promise<void> {
  await fetchJSON(`/api/config/${source}`, { method: 'DELETE' })
}

/**
 * Run an arbitrary Coral SQL query (for debugging / exploration).
 * Maps to POST /api/query
 *
 * @param sql - Any valid Coral SQL string
 */
export async function runQuery(sql: string): Promise<unknown[]> {
  const data = await fetchJSON<{ results: unknown[]; count: number }>('/api/query', {
    method: 'POST',
    body: JSON.stringify({ sql }),
  })
  return data.results
}
