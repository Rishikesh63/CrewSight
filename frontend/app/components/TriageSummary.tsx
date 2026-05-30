'use client'

import { useState } from 'react'
import { SparklesIcon, RefreshCwIcon, ChevronDownIcon, ChevronUpIcon, DatabaseIcon } from 'lucide-react'
import { fetchSummary } from '@/lib/api'

interface MCPQuery {
  tool: string
  input: Record<string, unknown>
  sql?: string
  rows?: number
}

interface TriageSummaryProps {
  summary: string | null
  generatedAt: string | null
  mcpQueries?: MCPQuery[]
}

const TOOL_LABEL: Record<string, string> = {
  sql:            'SQL query',
  list_catalog:   'Discovered tables',
  search_catalog: 'Searched catalog',
  describe_table: 'Inspected table',
  list_columns:   'Listed columns',
}

export default function TriageSummary({
  summary: initialSummary,
  generatedAt: initialGeneratedAt,
  mcpQueries: initialQueries = [],
}: TriageSummaryProps) {
  const [summary, setSummary]       = useState(initialSummary)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [mcpQueries, setMcpQueries] = useState<MCPQuery[]>(initialQueries)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showQueries, setShowQueries] = useState(true)

  const regenerate = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchSummary()
      setSummary(fresh.summary)
      setMcpQueries(fresh.mcp_queries ?? [])
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
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  const sqlQueries = mcpQueries.filter(q => q.tool === 'sql' && q.sql)
  const otherCalls = mcpQueries.filter(q => q.tool !== 'sql')

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <SparklesIcon className="h-5 w-5 text-purple-400 flex-shrink-0" />
          <h2 className="text-base font-semibold text-white leading-none">AI Triage Summary</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40">
            Powered by Claude + Coral MCP
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {generatedAt && (
            <span className="hidden sm:block text-xs text-gray-500">at {formatTime(generatedAt)}</span>
          )}
          <button
            onClick={regenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded
                       bg-gray-800 hover:bg-gray-700 border border-gray-700
                       text-xs text-gray-300 hover:text-white
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCwIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* ── MCP queries panel ── */}
      {mcpQueries.length > 0 && (
        <div className="border-b border-gray-800">
          <button
            onClick={() => setShowQueries(v => !v)}
            className="w-full flex items-center gap-2 px-6 py-2.5 text-left
                       hover:bg-gray-800/40 transition-colors"
          >
            <DatabaseIcon className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
            <span className="text-xs text-cyan-400 font-medium">
              Claude queried Coral via MCP
              {sqlQueries.length > 0 && ` · ${sqlQueries.length} SQL ${sqlQueries.length === 1 ? 'query' : 'queries'}`}
              {otherCalls.length > 0 && ` · ${otherCalls.length} catalog ${otherCalls.length === 1 ? 'call' : 'calls'}`}
            </span>
            {showQueries
              ? <ChevronUpIcon className="h-3 w-3 text-gray-500 ml-auto" />
              : <ChevronDownIcon className="h-3 w-3 text-gray-500 ml-auto" />}
          </button>

          {showQueries && (
            <div className="px-6 pb-4 space-y-2">
              {mcpQueries.map((q, i) => (
                <div key={i} className="rounded-lg bg-gray-950 border border-gray-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60">
                    <span className="text-[10px] font-medium text-cyan-500 uppercase tracking-wide">
                      {TOOL_LABEL[q.tool] ?? q.tool}
                    </span>
                    {q.rows !== undefined && (
                      <span className="ml-auto text-[10px] text-gray-500">
                        {q.rows} {q.rows === 1 ? 'row' : 'rows'}
                      </span>
                    )}
                  </div>
                  <pre className="px-3 py-2 text-[11px] text-green-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {q.sql ?? JSON.stringify(q.input, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Summary body ── */}
      <div className="px-6 py-5">
        {loading ? (
          <div className="space-y-2.5 animate-pulse">
            {[90, 80, 95, 70, 85, 60, 75].map((w, i) => (
              <div key={i} className="h-3.5 bg-gray-800 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : summary ? (
          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{summary}</div>
        ) : (
          <p className="text-gray-500 text-sm">
            No summary yet. Click <strong className="text-gray-400">Regenerate</strong> to
            generate an AI triage briefing powered by Coral MCP.
          </p>
        )}
      </div>

    </div>
  )
}
