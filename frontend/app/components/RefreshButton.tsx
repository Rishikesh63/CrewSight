'use client'

import { useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'

interface RefreshButtonProps {
  onRefresh: () => Promise<void>
}

export default function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleClick = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={refreshing}
      aria-label={refreshing ? 'Refreshing data…' : 'Refresh dashboard data'}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                 bg-gray-800 hover:bg-gray-700 active:bg-gray-600
                 border border-gray-700 hover:border-gray-600
                 text-sm text-gray-300 hover:text-white
                 transition-colors duration-150
                 disabled:opacity-50 disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <RefreshCwIcon
        className={`h-4 w-4 flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </span>
    </button>
  )
}
