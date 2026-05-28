'use client'

import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ExternalLinkIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import type { Issue } from '@/lib/types'

interface IssueTableProps {
  issues: Issue[]
}

export default function IssueTable({ issues }: IssueTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggle = (n: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })

  if (issues.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-400 text-base">No open issues found</p>
        <p className="text-gray-600 text-sm mt-2">
          Make sure the GitHub source is configured in Coral and the repo has open issues.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/80">
              <th className="w-10 px-3 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Issue
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                Age
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-orange-400 uppercase tracking-wide">
                🔶 HN
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-red-400 uppercase tracking-wide">
                🟠 Reddit
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-yellow-400 uppercase tracking-wide">
                🔷 SO
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Buzz
              </th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, idx) => {
              const expanded = expandedRows.has(issue.issue_number)
              return (
                <React.Fragment key={issue.issue_number}>
                  <tr
                    onClick={() => toggle(issue.issue_number)}
                    className={`
                      border-b border-gray-800/50 cursor-pointer
                      transition-colors duration-100
                      hover:bg-gray-800/60
                      ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/20'}
                      ${expanded ? 'bg-gray-800/40' : ''}
                    `}
                  >
                    <td className="px-3 py-3 text-gray-600">
                      {expanded
                        ? <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                        : <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                      }
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={issue.issue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline group max-w-xs"
                      >
                        <span className="truncate max-w-[300px] sm:max-w-[420px]">
                          <span className="text-gray-500 mr-1">#{issue.issue_number}</span>
                          {issue.issue.length > 60 ? issue.issue.slice(0, 60) + '…' : issue.issue}
                        </span>
                        <ExternalLinkIcon className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-70" aria-hidden="true" />
                      </a>
                    </td>

                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {relativeTime(issue.created_at)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {issue.hn_post
                        ? <ScoreBadge value={issue.hn_points} color="orange" />
                        : <Dash />}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {issue.reddit_post
                        ? <ScoreBadge value={issue.reddit_score} color="red" />
                        : <Dash />}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {issue.so_question
                        ? <ScoreBadge value={issue.so_score} color="yellow" />
                        : <Dash />}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <BuzzPill score={issue.activity_score} />
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="border-b border-gray-800/50 bg-gray-800/30">
                      <td colSpan={7} className="px-6 py-4">
                        <ExpandedDetail issue={issue} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso.slice(0, 10)
  }
}

function Dash() {
  return <span className="text-gray-700 select-none">—</span>
}

function ScoreBadge({ value, color }: { value: number | null; color: 'orange' | 'red' | 'yellow' }) {
  const styles = {
    orange: 'bg-orange-900/30 text-orange-300 border-orange-700/30',
    red:    'bg-red-900/30 text-red-300 border-red-700/30',
    yellow: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[color]}`}>
      {value != null ? `↑${value}` : '✓'}
    </span>
  )
}

function BuzzPill({ score }: { score: number }) {
  const styles: Record<number, string> = {
    0: 'bg-gray-900/30 text-gray-500 border-gray-700/30',
    1: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
    2: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
    3: 'bg-green-900/30 text-green-400 border-green-700/30',
  }
  const labels = ['None', 'Low', 'Med', 'Hot']
  const cls = styles[score] ?? styles[0]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {labels[score] ?? '—'}
    </span>
  )
}

function ExpandedDetail({ issue }: { issue: Issue }) {
  const hasActivity = issue.hn_post || issue.reddit_post || issue.so_question

  return (
    <div className="space-y-3">
      {issue.hn_post && (
        <ActivityBlock
          platform="🔶 Hacker News"
          color="text-orange-400"
          content={issue.hn_post}
          url={issue.hn_url}
          meta={issue.hn_points != null ? `${issue.hn_points} points` : undefined}
        />
      )}
      {issue.reddit_post && (
        <ActivityBlock
          platform="🟠 Reddit"
          color="text-red-400"
          content={issue.reddit_post}
          url={issue.reddit_url}
          meta={issue.reddit_score != null ? `↑${issue.reddit_score}` : undefined}
        />
      )}
      {issue.so_question && (
        <ActivityBlock
          platform="🔷 Stack Overflow"
          color="text-yellow-400"
          content={issue.so_question}
          url={issue.so_url}
          meta={issue.so_score != null ? `score ${issue.so_score}` : undefined}
        />
      )}
      {!hasActivity && (
        <p className="text-xs text-gray-500">
          No matching discussions found on HN, Reddit, or Stack Overflow.
        </p>
      )}
      <div className="pt-1 flex gap-2">
        <a
          href={issue.issue_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded
                     bg-blue-600/20 hover:bg-blue-600/30
                     border border-blue-600/40 text-blue-300
                     transition-colors duration-150"
        >
          <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
          View on GitHub
        </a>
        {issue.github_comments != null && issue.github_comments > 0 && (
          <span className="inline-flex items-center text-xs text-gray-500">
            {issue.github_comments} comment{issue.github_comments !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function ActivityBlock({
  platform,
  color,
  content,
  url,
  meta,
}: {
  platform: string
  color: string
  content: string
  url?: string | null
  meta?: string
}) {
  return (
    <div>
      <div className={`flex items-center gap-2 text-xs font-semibold ${color} mb-1`}>
        <span>{platform}</span>
        {meta && <span className="text-gray-500 font-normal">{meta}</span>}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-300 bg-gray-900/60 rounded px-3 py-2 border border-gray-700/50
                     hover:border-gray-600 leading-relaxed block transition-colors"
        >
          {content}
        </a>
      ) : (
        <p className="text-sm text-gray-300 bg-gray-900/60 rounded px-3 py-2 border border-gray-700/50 leading-relaxed">
          {content}
        </p>
      )}
    </div>
  )
}
