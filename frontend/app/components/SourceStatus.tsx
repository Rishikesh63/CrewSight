'use client'

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { SourceStatus } from '@/lib/types'

interface SourceStatusProps {
  sources: SourceStatus[]
}

const SOURCE_META: Record<string, { label: string; icon: string }> = {
  github:        { label: 'GitHub',        icon: '🐙' },
  hackernews:    { label: 'Hacker News',   icon: '🔶' },
  reddit:        { label: 'Reddit',        icon: '🟠' },
  stackoverflow: { label: 'Stack Overflow', icon: '🔷' },
}

export default function SourceStatusBar({ sources }: SourceStatusProps) {
  return (
    <div className="bg-gray-950 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 font-medium mr-1">Sources</span>

          {sources.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking…
            </span>
          ) : (
            sources.map((source) => (
              <SourcePill key={source.name} source={source} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function SourcePill({ source }: { source: SourceStatus }) {
  const meta = SOURCE_META[source.name] ?? { label: source.name, icon: '🔌' }

  if (source.active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/30 border border-green-700/40 text-xs text-green-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {meta.icon} {meta.label}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-900/20 border border-red-700/30 text-xs text-red-400 cursor-help"
      title={source.error ?? `${meta.label} is not configured`}
    >
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {meta.icon} {meta.label}
    </span>
  )
}
