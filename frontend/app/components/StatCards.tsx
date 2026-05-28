'use client'

import {
  GitPullRequestIcon,
  FlameIcon,
  MessageSquareIcon,
  HelpCircleIcon,
  type LucideIcon,
} from 'lucide-react'

export type ActiveView = 'issues' | 'hackernews' | 'reddit' | 'stackoverflow'

interface StatCardsProps {
  total: number
  hnCount: number
  redditCount: number
  soCount: number
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
}

interface CardConfig {
  viewKey: ActiveView
  label: string
  value: number
  Icon: LucideIcon
  color: string
  bg: string
  border: string
  activeBorder: string
  iconBg: string
}

export default function StatCards({
  total, hnCount, redditCount, soCount, activeView, onViewChange,
}: StatCardsProps) {
  const cards: CardConfig[] = [
    {
      viewKey: 'issues',
      label:   'Open Issues',
      value:   total,
      Icon:    GitPullRequestIcon,
      color:   'text-blue-400',
      bg:      'bg-blue-950/40',
      border:  'border-blue-800/40',
      activeBorder: 'border-blue-500',
      iconBg:  'bg-blue-900/50',
    },
    {
      viewKey: 'hackernews',
      label:   'On Hacker News',
      value:   hnCount,
      Icon:    FlameIcon,
      color:   'text-orange-400',
      bg:      'bg-orange-950/40',
      border:  'border-orange-800/40',
      activeBorder: 'border-orange-500',
      iconBg:  'bg-orange-900/50',
    },
    {
      viewKey: 'reddit',
      label:   'On Reddit',
      value:   redditCount,
      Icon:    MessageSquareIcon,
      color:   'text-red-400',
      bg:      'bg-red-950/40',
      border:  'border-red-800/40',
      activeBorder: 'border-red-500',
      iconBg:  'bg-red-900/50',
    },
    {
      viewKey: 'stackoverflow',
      label:   'On Stack Overflow',
      value:   soCount,
      Icon:    HelpCircleIcon,
      color:   'text-yellow-400',
      bg:      'bg-yellow-950/40',
      border:  'border-yellow-800/40',
      activeBorder: 'border-yellow-500',
      iconBg:  'bg-yellow-900/50',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ viewKey, label, value, Icon, color, bg, border, activeBorder, iconBg }) => {
        const isActive = activeView === viewKey
        return (
          <button
            key={viewKey}
            onClick={() => onViewChange(viewKey)}
            className={`${bg} border ${isActive ? activeBorder : border} rounded-xl p-4
                        flex items-center gap-4 text-left w-full
                        transition-all hover:scale-[1.01] hover:brightness-110
                        ${isActive ? 'ring-1 ring-inset ' + activeBorder : ''}`}
          >
            <div className={`${iconBg} p-2.5 rounded-lg flex-shrink-0`}>
              <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 truncate">{label}</p>
              <p className={`text-3xl font-bold ${color} leading-tight`}>{value}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
