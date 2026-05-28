'use client'

import { ExternalLinkIcon, CheckCircle2Icon } from 'lucide-react'
import type { Discussions } from '@/lib/types'
import type { ActiveView } from './StatCards'

interface Props {
  platform: Exclude<ActiveView, 'issues'>
  discussions: Discussions
}

interface NormalizedItem {
  key: string
  title: string
  url: string | null
  score: number
  meta: string
  badge?: string
  badgeGreen?: boolean
}

function normalize(platform: Props['platform'], discussions: Discussions): NormalizedItem[] {
  if (platform === 'hackernews') {
    return discussions.hackernews.map((s) => ({
      key: String(s.id),
      title: s.title,
      url: s.url,
      score: s.points,
      meta: `${s.points} pts · ${s.num_comments} comments · by ${s.author}`,
    }))
  }
  if (platform === 'reddit') {
    return discussions.reddit.map((p) => ({
      key: p.id,
      title: p.title,
      url: p.permalink,
      score: p.score,
      meta: `${p.score} pts · ${p.num_comments} comments · r/${p.subreddit}`,
      badge: `r/${p.subreddit}`,
    }))
  }
  // stackoverflow
  return discussions.stackoverflow.map((q) => ({
    key: String(q.id),
    title: q.title,
    url: q.url,
    score: q.score,
    meta: `${q.score} votes · ${q.answer_count} answers · by ${q.author}`,
    badge: q.is_answered ? 'Answered' : 'Unanswered',
    badgeGreen: q.is_answered,
  }))
}

const PLATFORM_META: Record<Props['platform'], { label: string; color: string; emptyMsg: string }> = {
  hackernews:    { label: 'Hacker News',    color: 'text-orange-400', emptyMsg: 'No HN stories found for this search term.' },
  reddit:        { label: 'Reddit',         color: 'text-red-400',    emptyMsg: 'No Reddit posts found for this search term.' },
  stackoverflow: { label: 'Stack Overflow', color: 'text-yellow-400', emptyMsg: 'No Stack Overflow questions found for this search term.' },
}

export default function DiscussionView({ platform, discussions }: Props) {
  const items = normalize(platform, discussions)
  const { label, color, emptyMsg } = PLATFORM_META[platform]

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">
          {label}
          <span className="ml-2 text-sm font-normal text-gray-500">({items.length})</span>
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">{emptyMsg}</div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden divide-y divide-gray-800">
          {items.map((item) => (
            <div key={item.key} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-900/50 transition-colors">
              {/* Score pill */}
              <div className="flex-shrink-0 w-12 text-center">
                <span className={`text-lg font-bold ${color}`}>{item.score}</span>
                <p className="text-[10px] text-gray-600 leading-none mt-0.5">score</p>
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 hover:underline line-clamp-2 transition-colors"
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="text-sm text-gray-300 line-clamp-2">{item.title}</p>
                )}
                <p className="text-xs text-gray-500 mt-1 truncate">{item.meta}</p>
              </div>

              {/* Badge + external link */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {item.badge && (
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                    ${item.badgeGreen
                      ? 'bg-green-900/30 border-green-700/40 text-green-300'
                      : 'bg-gray-800/60 border-gray-700/40 text-gray-400'}`}>
                    {item.badgeGreen && <CheckCircle2Icon className="h-3 w-3" />}
                    {item.badge}
                  </span>
                )}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                    aria-label="Open link"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
