'use client'

import Link from 'next/link'
import { AnchorIcon, Settings2Icon } from 'lucide-react'
import RefreshButton from './RefreshButton'

interface HeaderProps {
  lastUpdated: string | null
  onRefresh: () => Promise<void>
}

function formatTime(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function Header({ lastUpdated, onRefresh }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 shadow-lg shadow-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* ── Left: Logo + wordmark ── */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 p-2 bg-blue-600 rounded-lg">
            <AnchorIcon className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white leading-none tracking-tight">
              CrewSight
            </h1>
            <p className="text-xs text-gray-400 leading-none mt-0.5 hidden sm:block">
              your crew&apos;s intelligence
            </p>
          </div>
          {/* Coral badge */}
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 ml-2 rounded text-xs bg-gray-800 border border-gray-700 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
            Powered by Coral
          </span>
        </div>

        {/* ── Right: timestamp + refresh + settings ── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:block text-right">
            <p className="text-xs text-gray-500 leading-none">Last refreshed</p>
            <p className="text-xs text-gray-300 font-mono leading-none mt-0.5">
              {formatTime(lastUpdated)}
            </p>
          </div>
          <RefreshButton onRefresh={onRefresh} />
          <Link
            href="/settings"
            title="Integrations"
            className="p-2 rounded-lg border border-gray-700 text-gray-400
                       hover:text-white hover:border-gray-500 transition-colors"
          >
            <Settings2Icon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

      </div>
    </header>
  )
}
