'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  XCircleIcon,
  SaveIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  ExternalLinkIcon,
} from 'lucide-react'
import { fetchConfig, fetchSources, saveIntegration, disableIntegration } from '@/lib/api'
import type { AllIntegrations, SourceStatus } from '@/lib/types'

// ---------------------------------------------------------------------------
// Platform metadata
// ---------------------------------------------------------------------------

const PLATFORMS = [
  {
    id: 'github' as const,
    name: 'GitHub',
    icon: '🐙',
    description: 'Track open issues from any public repository. No token needed.',
    color: 'border-gray-700 hover:border-gray-600',
    accentBg: 'bg-gray-800/60',
    fields: [
      { key: 'repo', label: 'Repository', placeholder: 'owner/repo  (e.g. zed-industries/zed)', secret: false },
    ],
    coralCmd: (cfg: Record<string, string>) =>
      `coral source add --file sources/github_issues_spec.yaml\n# Enter when prompted:\n#   GITHUB_OWNER     → ${(cfg.repo || 'owner/repo').split('/')[0]}\n#   GITHUB_REPO_NAME → ${(cfg.repo || 'owner/repo').split('/')[1] || 'repo'}`,
  },
  {
    id: 'hackernews' as const,
    name: 'Hacker News',
    icon: '🔶',
    description: 'Surface HN stories and comments discussing your project. No API key needed.',
    color: 'border-orange-900/40 hover:border-orange-700/50',
    accentBg: 'bg-orange-950/20',
    fields: [
      { key: 'search_term', label: 'Search Term', placeholder: 'e.g. zed editor', secret: false },
    ],
    coralCmd: (cfg: Record<string, string>) =>
      `coral source add --file sources/hackernews_spec.yaml\n# Enter when prompted:\n#   HN_SEARCH_TERM → ${cfg.search_term || '<search term>'}`,
  },
  {
    id: 'reddit' as const,
    name: 'Reddit',
    icon: '🟠',
    description: 'Find Reddit posts about your project across all subreddits. No API key needed.',
    color: 'border-red-900/40 hover:border-red-700/50',
    accentBg: 'bg-red-950/20',
    fields: [
      { key: 'search_term', label: 'Search Term', placeholder: 'e.g. zed editor', secret: false },
    ],
    coralCmd: (cfg: Record<string, string>) =>
      `coral source add --file sources/reddit_spec.yaml\n# Enter when prompted:\n#   REDDIT_SEARCH_TERM → ${cfg.search_term || '<search term>'}`,
  },
  {
    id: 'stackoverflow' as const,
    name: 'Stack Overflow',
    icon: '🔷',
    description: 'Find questions about your project on Stack Overflow. No API key needed.',
    color: 'border-yellow-900/40 hover:border-yellow-700/50',
    accentBg: 'bg-yellow-950/20',
    fields: [
      { key: 'search_term', label: 'Search Term', placeholder: 'e.g. zed editor', secret: false },
    ],
    coralCmd: (cfg: Record<string, string>) =>
      `coral source add --file sources/stackoverflow_spec.yaml\n# Enter when prompted:\n#   SO_SEARCH_TERM → ${cfg.search_term || '<search term>'}`,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [config, setConfig] = useState<AllIntegrations | null>(null)
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchConfig(), fetchSources()])
      .then(([cfg, srcs]) => {
        setConfig(cfg)
        setSources(srcs)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (source: string, values: Record<string, string>) => {
    setSaving(source)
    setError(null)
    try {
      await saveIntegration(source, values)
      setSaved(source)
      setTimeout(() => setSaved(null), 2500)
      // Refresh config + source status after Coral registration
      const [updated, updatedSources] = await Promise.all([fetchConfig(), fetchSources()])
      setConfig(updated)
      setSources(updatedSources)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  const handleDisable = async (source: string) => {
    try {
      // Optimistically mark as disconnected immediately
      setSources(prev => prev.map(s => s.name === source ? { ...s, active: false } : s))
      await disableIntegration(source)
      const [updated, updatedSources] = await Promise.all([fetchConfig(), fetchSources()])
      setConfig(updated)
      setSources(updatedSources)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disable')
    }
  }

  const sourceStatus = (name: string) =>
    sources.find((s) => s.name === name)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 text-gray-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 shadow-lg shadow-black/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="h-4 w-px bg-gray-700" />
          <h1 className="text-base font-semibold text-white">Integrations</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-sm text-gray-400">
            Configure the data sources CrewSight queries via Coral. Saving automatically
            registers the source — the status badge will update to <span className="text-green-400">Connected</span> once done.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {PLATFORMS.map((platform) => {
            const cfg = config?.[platform.id] ?? { enabled: false }
            const status = sourceStatus(platform.id)
            return (
              <IntegrationCard
                key={platform.id}
                platform={platform}
                config={cfg as Record<string, string> & { enabled: boolean }}
                status={status}
                saving={saving === platform.id}
                saved={saved === platform.id}
                onSave={(values) => handleSave(platform.id, values)}
                onDisable={() => handleDisable(platform.id)}
              />
            )
          })}
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Integration card
// ---------------------------------------------------------------------------

interface PlatformDef {
  id: string
  name: string
  icon: string
  description: string
  color: string
  accentBg: string
  fields: { key: string; label: string; placeholder: string; secret: boolean }[]
  coralCmd: (cfg: Record<string, string>) => string
}

function IntegrationCard({
  platform,
  config,
  status,
  saving,
  saved,
  onSave,
  onDisable,
}: {
  platform: PlatformDef
  config: Record<string, string> & { enabled: boolean }
  status: SourceStatus | undefined
  saving: boolean
  saved: boolean
  onSave: (values: Record<string, string>) => void
  onDisable: () => void
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [showCmd, setShowCmd] = useState(false)

  // Init form values from config when card opens
  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {}
      for (const f of platform.fields) {
        // Never pre-fill secret fields — user must re-enter to update
        initial[f.key] = f.secret ? '' : (config[f.key] ?? '')
      }
      setValues(initial)
    }
  }, [open, config, platform.fields])

  const coralCommand = platform.coralCmd(values)
  const isConnected = status?.active === true

  return (
    <div className={`border rounded-xl transition-colors ${platform.color} ${open ? 'border-opacity-100' : ''}`}>
      {/* Card header */}
      <div className="p-5 flex items-start gap-4">
        <div className={`${platform.accentBg} p-3 rounded-lg text-2xl flex-shrink-0`}>
          {platform.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-white">{platform.name}</h2>
            <StatusBadge active={isConnected} error={status?.error} />
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{platform.description}</p>

          {/* Show current values when closed */}
          {!open && config.enabled && (
            <div className="flex flex-wrap gap-3 mt-2">
              {platform.fields.map((f) => config[f.key] && (
                <span key={f.key} className="text-xs text-gray-500">
                  <span className="text-gray-600">{f.label}:</span>{' '}
                  <span className="text-gray-300 font-mono">{config[f.key]}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!open && isConnected && (
            <button
              onClick={onDisable}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50
                         text-red-400 hover:text-red-300 hover:border-red-700
                         transition-colors duration-150"
            >
              Disconnect
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700
                       text-gray-300 hover:text-white hover:border-gray-500
                       transition-colors duration-150"
          >
            {open ? 'Close' : 'Configure'}
          </button>
        </div>
      </div>

      {/* Expanded form */}
      {open && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          {platform.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                {field.label}
              </label>
              <div className="relative">
                <input
                  type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-sm text-white placeholder-gray-600
                             focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                             transition-colors font-mono"
                />
                {field.secret && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets((v) => ({ ...v, [field.key]: !v[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    aria-label="Toggle visibility"
                  >
                    {showSecrets[field.key]
                      ? <EyeOffIcon className="h-4 w-4" />
                      : <EyeIcon className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onSave(values)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                         bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                         text-white transition-colors duration-150"
            >
              {saving
                ? <Loader2Icon className="h-4 w-4 animate-spin" />
                : saved
                  ? <CheckCircle2Icon className="h-4 w-4 text-green-300" />
                  : <SaveIcon className="h-4 w-4" />}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
            </button>

            {config.enabled && (
              <button
                onClick={onDisable}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Disable
              </button>
            )}
          </div>

          {/* Coral setup command */}
          <div className="pt-2">
            <button
              onClick={() => setShowCmd((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ExternalLinkIcon className="h-3 w-3" />
              {showCmd ? 'Hide' : 'Show'} Coral setup command
            </button>

            {showCmd && (
              <div className="mt-2 relative">
                <pre className="bg-gray-950 border border-gray-800 rounded-lg px-4 py-3
                               text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">
                  {coralCommand}
                </pre>
                <CopyButton text={coralCommand} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function StatusBadge({ active, error }: { active: boolean; error?: string | null }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-green-900/30 border border-green-700/40 text-xs text-green-300">
        <CheckCircle2Icon className="h-3 w-3" />
        Connected
      </span>
    )
  }
  return (
    <span
      title={error ?? 'Not connected — run the Coral setup command below'}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                 bg-gray-800/60 border border-gray-700/40 text-xs text-gray-500 cursor-help"
    >
      <XCircleIcon className="h-3 w-3" />
      Not connected
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 px-2 py-1 rounded text-xs
                 bg-gray-800 hover:bg-gray-700 border border-gray-700
                 text-gray-400 hover:text-white transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
