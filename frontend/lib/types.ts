// ---------------------------------------------------------------------------
// CrewSight — shared TypeScript interfaces
// ---------------------------------------------------------------------------

export interface Issue {
  issue: string
  state: string
  created_at: string
  updated_at?: string
  issue_url: string
  issue_number: number
  github_comments?: number
  author?: string
  // Cross-platform matches (null = no match found)
  hn_post: string | null
  hn_url: string | null
  hn_points: number | null
  reddit_post: string | null
  reddit_url: string | null
  reddit_score: number | null
  so_question: string | null
  so_url: string | null
  so_score: number | null
  // 0–3: one point per platform (HN, Reddit, SO) where issue title appears
  activity_score: number
}

export interface HNStory {
  id: string
  title: string
  url: string | null
  points: number
  num_comments: number
  created_at: string
  author: string
}

export interface RedditPost {
  id: string
  title: string
  url: string
  score: number
  num_comments: number
  subreddit: string
  permalink: string
  author: string
}

export interface SOQuestion {
  id: number
  title: string
  url: string
  score: number
  answer_count: number
  is_answered: boolean
  author: string
}

export interface Discussions {
  hackernews: HNStory[]
  reddit: RedditPost[]
  stackoverflow: SOQuestion[]
}

export interface SourceStatus {
  name: string
  active: boolean
  error?: string | null
}

export interface DashboardData {
  issues: Issue[]
  total: number
  cached: boolean
  last_updated: string
}

export interface IssueDetail {
  issue_number: number
  issue_title: string
  github: Record<string, unknown>
  hackernews: Record<string, unknown>[]
  reddit: Record<string, unknown>[]
  stackoverflow: Record<string, unknown>[]
  meta?: Issue
}

export interface IssueDetailResponse {
  issue: IssueDetail
  summary: string
}

export interface MCPQuery {
  tool: string
  input: Record<string, unknown>
  sql?: string
  rows?: number
}

export interface IntegrationConfig {
  token?: string
  repo?: string
  search_term?: string
  enabled: boolean
}

export interface AllIntegrations {
  github: IntegrationConfig
  hackernews: IntegrationConfig
  reddit: IntegrationConfig
  stackoverflow: IntegrationConfig
}
