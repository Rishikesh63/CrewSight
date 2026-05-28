'use client'

import { useState } from 'react'
import { SparklesIcon, RefreshCwIcon } from 'lucide-react'
import { fetchSummary } from '@/lib/api'

interface TriageSummaryProps {
  summary: string | null
  generatedAt: string | null
}

export default function TriageSummary({
  summary: initialSummary,
  generatedAt: initialGeneratedAt,
}: TriageSummaryProps) {
  const [summary, setSummary] = useState(initialSummary)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const regenerate = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchSummary()
      setSummary(fresh)
      setGeneratedAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (iso: string | null): string => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <SparklesIcon className="h-5 w-5 text-purple-400 flex-shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-white leading-none">
            AI Triage Summary
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40 flex-shrink-0">
            Powered by Claude
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {generatedAt && (
            <span className="hidden sm:block text-xs text-gray-500">
              at {formatTime(generatedAt)}
            </span>
          )}
          <button
            onClick={regenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded
                       bg-gray-800 hover:bg-gray-700 border border-gray-700
                       text-xs text-gray-300 hover:text-white
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCwIcon
              className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-5">
        {loading ? (
          /* Skeleton lines while generating */
          <div className="space-y-2.5 animate-pulse" aria-label="Generating summary…">
            {[90, 80, 95, 70, 85, 60, 75].map((w, i) => (
              <div
                key={i}
                className="h-3.5 bg-gray-800 rounded"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : summary ? (
          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {summary}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No summary yet. Click <strong className="text-gray-400">Regenerate</strong> to
            generate an AI triage briefing for your open issues.
          </p>
        )}
      </div>

    </div>
  )
}
