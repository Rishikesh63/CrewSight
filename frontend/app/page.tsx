'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import Header from './components/Header'
import SourceStatusBar from './components/SourceStatus'
import StatCards, { type ActiveView } from './components/StatCards'
import IssueTable from './components/IssueTable'
import DiscussionView from './components/DiscussionView'
import TriageSummary from './components/TriageSummary'

import {
  fetchIssues,
  fetchSummary,
  fetchSources,
  fetchDiscussions,
  triggerRefresh,
} from '@/lib/api'
import type { DashboardData, Discussions, SourceStatus } from '@/lib/types'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5
                 bg-gray-800 border border-gray-700 rounded-lg
                 text-sm text-gray-200 shadow-xl shadow-black/40
                 animate-fade-in"
    >
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 animate-pulse">
      {/* Fake header */}
      <div className="h-16 bg-gray-900 border-b border-gray-800" />
      {/* Fake source bar */}
      <div className="h-9 bg-gray-950 border-b border-gray-800" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-900 rounded-xl border border-gray-800" />
          ))}
        </div>
        {/* Issue table */}
        <div className="h-72 bg-gray-900 rounded-xl border border-gray-800" />
        {/* Summary */}
        <div className="h-48 bg-gray-900 rounded-xl border border-gray-800" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData]             = useState<DashboardData | null>(null)
  const [discussions, setDiscussions] = useState<Discussions | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('issues')
  const [sources, setSources]       = useState<SourceStatus[]>([])
  const [summary, setSummary]       = useState<string | null>(null)
  const [summaryAt, setSummaryAt]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const toastTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Data loader ───────────────────────────────────────────────────────────
  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError(null)

    try {
      const [issueData, summaryText, sourcesData, discussionsData] = await Promise.all([
        fetchIssues(),
        fetchSummary(),
        fetchSources(),
        fetchDiscussions(),
      ])
      setData(issueData)
      setSummary(summaryText)
      setSummaryAt(new Date().toISOString())
      setSources(sourcesData)
      setDiscussions(discussionsData)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unknown error — is the FastAPI backend running?'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Refresh handler (header button) ──────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    try {
      await triggerRefresh()
      await loadData()
      showToast('✓ Data refreshed')
    } catch {
      showToast('✗ Refresh failed — check backend connection')
    }
  }, [loadData, showToast])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData(true)
  }, [loadData])

  // ── Auto-refresh every 5 minutes ─────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      await loadData()
      showToast('↻ Auto-refreshed')
    }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadData, showToast])

  // Cleanup toast timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // ── Loading skeleton (first load only) ───────────────────────────────────
  if (loading && !data) return <LoadingSkeleton />

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950">

      {/* Toast notification */}
      {toast && <Toast message={toast} />}

      {/* Sticky header */}
      <Header
        lastUpdated={data?.last_updated ?? null}
        onRefresh={handleRefresh}
      />

      {/* Source connectivity pills */}
      <SourceStatusBar sources={sources} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Error banner ── */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-xl text-sm"
          >
            <span className="text-red-400 font-bold flex-shrink-0">⚠️ Backend unreachable</span>
            <span className="text-red-300">{error}</span>
            <span className="text-red-500 ml-auto flex-shrink-0">
              Make sure FastAPI is running on port 8000.
            </span>
          </div>
        )}

        {/* ── Stat cards ── */}
        <StatCards
          total={data?.total ?? 0}
          hnCount={discussions?.hackernews.length ?? 0}
          redditCount={discussions?.reddit.length ?? 0}
          soCount={discussions?.stackoverflow.length ?? 0}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        {/* ── Main content (switches based on active stat card) ── */}
        {activeView === 'issues' ? (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white">
                Open Issues
                {data && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({data.total})
                  </span>
                )}
              </h2>
              {data?.cached && (
                <span className="text-xs text-gray-600 bg-gray-800/60 px-2 py-0.5 rounded border border-gray-700">
                  cached
                </span>
              )}
            </div>
            <IssueTable issues={data?.issues ?? []} />
          </section>
        ) : (
          discussions && (
            <DiscussionView
              platform={activeView}
              discussions={discussions}
            />
          )
        )}

        {/* ── AI triage summary ── */}
        <TriageSummary summary={summary} generatedAt={summaryAt} />

      </main>
    </div>
  )
}
