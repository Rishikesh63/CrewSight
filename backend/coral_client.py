"""
Coral query client for CrewSight.

ALL external data queries go through Coral via subprocess — we never call
external APIs directly. This module is the single gateway between the
FastAPI app and the Coral query layer.

Sources to configure before queries will work:
  coral source add --file sources/github_issues_spec.yaml
  coral source add --file sources/hackernews_spec.yaml
  coral source add --file sources/reddit_spec.yaml
  coral source add --file sources/stackoverflow_spec.yaml
"""

import json
import logging
import os
import subprocess
from typing import Any

from dotenv import load_dotenv

from cache import cache

load_dotenv()

logger = logging.getLogger(__name__)

CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))

_github_repo = os.getenv("GITHUB_REPO", "/")
_GITHUB_OWNER, _GITHUB_REPO = (_github_repo.split("/", 1) + [""])[:2]

# Search term derived from repo name (used for HN / Reddit / SO queries)
SEARCH_TERM = os.getenv("SEARCH_TERM", _GITHUB_REPO.replace("-", " "))


def _current_search_term() -> str:
    """
    Read search term dynamically from saved config so it reflects what the
    user set via the Settings page — not just the startup environment variable.
    """
    try:
        from config_manager import load_config
        cfg = load_config()
        for src in ("hackernews", "reddit", "stackoverflow"):
            term = (cfg.get(src) or {}).get("search_term", "")
            if term:
                return term
    except Exception:
        pass
    return SEARCH_TERM


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CoralError(Exception):
    """Raised when a Coral query fails or Coral is not installed."""
    pass


# ---------------------------------------------------------------------------
# Low-level query runner
# ---------------------------------------------------------------------------

def run_query(sql: str, timeout: int = 30) -> list[dict]:
    """
    Execute a SQL query against Coral and return results as a list of dicts.

    Args:
        sql: Valid SQL string (tables must be configured Coral sources)

    Returns:
        List of row dicts — empty list if the query returns no rows

    Raises:
        CoralError: On query failure, timeout, or if Coral is not installed
    """
    preview = sql[:120] + ("…" if len(sql) > 120 else "")
    logger.info(f"Coral query: {preview}")

    try:
        result = subprocess.run(
            ["coral", "sql", "--format", "json", sql],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        logger.error(f"Coral query timed out after {timeout} s")
        raise CoralError(f"Coral query timed out after {timeout} seconds")
    except FileNotFoundError:
        raise CoralError(
            "Coral CLI not found. Install it: brew install withcoral/tap/coral"
        )

    if result.returncode != 0:
        err = (result.stderr or result.stdout or "unknown error").strip()
        logger.error(f"Coral exited {result.returncode}: {err}")
        raise CoralError(f"Coral query failed (exit {result.returncode}): {err}")

    raw = result.stdout.strip()
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        rows = []
        for line in raw.splitlines():
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        if rows:
            return rows
        raise CoralError(f"Unexpected Coral output (not valid JSON): {raw[:200]}")

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("rows", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []


# ---------------------------------------------------------------------------
# GitHub issues
# ---------------------------------------------------------------------------

def get_issues() -> list[dict]:
    """
    Fetch open GitHub issues using the custom gh source (no pagination,
    returns 100 most recently updated issues).

    Returns:
        List of issue dicts with keys: issue_number, issue, state,
        created_at, updated_at, issue_url, github_comments, author
    """
    cache_key = "issues"
    cached = cache.get(cache_key)
    if cached is not None:
        logger.info(f"Cache hit: issues ({len(cached)} issues)")
        return cached

    try:
        rows = run_query(
            "SELECT number AS issue_number, title AS issue, state, "
            "created_at, updated_at, html_url AS issue_url, "
            "comments AS github_comments, user__login AS author "
            "FROM gh.issues "
            "WHERE state = 'open' "
            "ORDER BY updated_at DESC LIMIT 100"
        )
        cache.set(cache_key, rows, ttl_seconds=CACHE_TTL)
        logger.info(f"Fetched {len(rows)} GitHub issues")
        return rows
    except CoralError as exc:
        logger.error(f"GitHub issues query failed: {exc}")
        return []


# ---------------------------------------------------------------------------
# Discussion platform queries — each independent
# ---------------------------------------------------------------------------

def get_hn_stories() -> list[dict]:
    """
    Fetch recent Hacker News stories about the project via Algolia.
    Returns top 20 stories sorted by points.
    """
    cache_key = "hn_stories"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        rows = run_query(
            'SELECT "objectID", title, url, points, num_comments, '
            "created_at, author "
            "FROM hackernews.stories "
            "ORDER BY points DESC LIMIT 20"
        )
        rows = [
            {
                "id": r.get("objectID"),
                "title": r.get("title"),
                "url": r.get("url"),
                "points": r.get("points"),
                "num_comments": r.get("num_comments"),
                "created_at": r.get("created_at"),
                "author": r.get("author"),
            }
            for r in rows
        ]
        cache.set(cache_key, rows, ttl_seconds=CACHE_TTL)
        logger.info(f"Fetched {len(rows)} HN stories")
        return rows
    except CoralError as exc:
        logger.warning(f"HN stories skipped: {exc}")
        return []


def get_reddit_posts() -> list[dict]:
    """
    Fetch Reddit posts via direct urllib (Reddit blocks cloud IPs for the Coral proxy).
    Always uses urllib — no Coral dependency for data fetching.
    """
    cache_key = "reddit_posts"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        import requests as _requests
        term = _current_search_term()
        if not term:
            return []
        url = "https://www.reddit.com/search.json"
        resp = _requests.get(
            url,
            params={"q": term, "sort": "new", "limit": 25, "type": "link"},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        rows = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            if not post:
                continue
            permalink = post.get("permalink", "")
            if permalink and not permalink.startswith("http"):
                permalink = f"https://reddit.com{permalink}"
            rows.append({
                "id": post.get("id"), "title": post.get("title"),
                "url": post.get("url"), "score": post.get("score"),
                "num_comments": post.get("num_comments"),
                "subreddit": post.get("subreddit"),
                "permalink": permalink, "author": post.get("author"),
            })
        cache.set(cache_key, rows, ttl_seconds=CACHE_TTL)
        logger.info(f"Fetched {len(rows)} Reddit posts")
        return rows
    except Exception as exc:
        logger.warning(f"Reddit posts skipped: {exc}")
        return []


def get_so_questions() -> list[dict]:
    """
    Fetch recent Stack Overflow questions about the project.
    Returns top 20 questions sorted by activity.
    """
    cache_key = "so_questions"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        rows = run_query(
            "SELECT question_id, title, link, score, answer_count, "
            "is_answered, owner__display_name "
            "FROM stackoverflow.questions "
            "ORDER BY score DESC LIMIT 20"
        )
        rows = [
            {
                "id": r.get("question_id"),
                "title": r.get("title"),
                "url": r.get("link"),
                "score": r.get("score"),
                "answer_count": r.get("answer_count"),
                "is_answered": r.get("is_answered"),
                "author": r.get("owner__display_name"),
            }
            for r in rows
        ]
        cache.set(cache_key, rows, ttl_seconds=CACHE_TTL)
        logger.info(f"Fetched {len(rows)} SO questions")
        return rows
    except CoralError as exc:
        logger.warning(f"SO questions skipped: {exc}")
        return []


# ---------------------------------------------------------------------------
# Combined landscape — all sources in one call
# ---------------------------------------------------------------------------

_CROSS_SOURCE_JOIN = """
SELECT
  i.number      AS issue_number,
  i.title       AS issue,
  i.state,
  i.created_at,
  i.updated_at,
  i.html_url    AS issue_url,
  i.comments    AS github_comments,
  h.title       AS hn_post,
  h.url         AS hn_url,
  h.points      AS hn_points,
  s.title       AS so_question,
  s.link        AS so_url,
  s.score       AS so_score
FROM gh.issues i
LEFT JOIN hackernews.stories h
  ON LOWER(h.title) LIKE '%' || LOWER(i.title) || '%'
LEFT JOIN stackoverflow.questions s
  ON LOWER(s.title) LIKE '%' || LOWER(i.title) || '%'
WHERE i.state = 'open'
ORDER BY i.updated_at DESC
LIMIT 100
"""


def get_issue_landscape() -> list[dict]:
    """
    Fetch GitHub issues enriched with cross-platform activity.

    Primary: single cross-source SQL JOIN across gh, hackernews, reddit, stackoverflow.
    Fallback: fetch each source independently and join in Python.
    """
    cache_key = "issue_landscape"
    cached = cache.get(cache_key)
    if cached is not None:
        logger.info(f"Cache hit: issue_landscape ({len(cached)} issues)")
        return cached

    # Primary path — cross-source SQL JOIN (60 s timeout for multi-source fetch)
    try:
        rows = run_query(_CROSS_SOURCE_JOIN.strip(), timeout=60)
        if rows:
            # Deduplicate: LEFT JOIN may produce multiple rows per issue
            seen: set = set()
            deduped = []
            for row in rows:
                n = row.get("issue_number")
                if n in seen:
                    continue
                seen.add(n)
                # Reddit is fetched via urllib (not in JOIN) — add null placeholders
                row.setdefault("reddit_post", None)
                row.setdefault("reddit_url", None)
                row.setdefault("reddit_score", None)
                deduped.append(row)

            # Enrich with Reddit data from urllib (one API call, shared cache)
            reddit = get_reddit_posts()
            results = []
            for row in deduped:
                title = (row.get("issue") or "").lower()
                reddit_hit = next(
                    (p for p in reddit if title and title in (p.get("title") or "").lower()),
                    None,
                )
                row["reddit_post"]  = reddit_hit.get("title")     if reddit_hit else None
                row["reddit_url"]   = reddit_hit.get("permalink") if reddit_hit else None
                row["reddit_score"] = reddit_hit.get("score")     if reddit_hit else None
                row["activity_score"] = sum([
                    1 if row.get("hn_post") else 0,
                    1 if reddit_hit else 0,
                    1 if row.get("so_question") else 0,
                ])
                results.append(row)

            logger.info(f"Cross-source JOIN: {len(results)} issues")
            cache.set(cache_key, results, ttl_seconds=CACHE_TTL)
            return results
    except CoralError as exc:
        logger.warning(f"Cross-source JOIN failed, falling back to Python join: {exc}")

    # Fallback — fetch each source independently and join in Python
    issues = get_issues()
    if not issues:
        return []

    hn = get_hn_stories()
    reddit = get_reddit_posts()
    so = get_so_questions()

    results = []
    for issue in issues:
        title = (issue.get("issue") or "").lower()
        hn_hit     = next((s for s in hn     if title and title in (s.get("title") or "").lower()), None)
        reddit_hit = next((p for p in reddit  if title and title in (p.get("title") or "").lower()), None)
        so_hit     = next((q for q in so      if title and title in (q.get("title") or "").lower()), None)

        results.append({
            **issue,
            "hn_post":        hn_hit.get("title")     if hn_hit     else None,
            "hn_url":         hn_hit.get("url")        if hn_hit     else None,
            "hn_points":      hn_hit.get("points")     if hn_hit     else None,
            "reddit_post":    reddit_hit.get("title")  if reddit_hit else None,
            "reddit_url":     reddit_hit.get("permalink") if reddit_hit else None,
            "reddit_score":   reddit_hit.get("score")  if reddit_hit else None,
            "so_question":    so_hit.get("title")      if so_hit     else None,
            "so_url":         so_hit.get("url")        if so_hit     else None,
            "so_score":       so_hit.get("score")      if so_hit     else None,
            "activity_score": sum([
                1 if hn_hit else 0,
                1 if reddit_hit else 0,
                1 if so_hit else 0,
            ]),
        })

    cache.set(cache_key, results, ttl_seconds=CACHE_TTL)
    return results


def get_all_discussions() -> dict[str, list[dict]]:
    """
    Return all platform discussions as independent lists (not joined to issues).
    Used for the 'Buzz' panel in the dashboard.
    """
    cache_key = "all_discussions"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = {
        "hackernews":    get_hn_stories(),
        "reddit":        get_reddit_posts(),
        "stackoverflow": get_so_questions(),
    }
    cache.set(cache_key, result, ttl_seconds=CACHE_TTL)
    return result


# ---------------------------------------------------------------------------
# Issue detail
# ---------------------------------------------------------------------------

def get_issue_detail(issue_number: int) -> dict[str, Any]:
    """
    Deep-dive for a single GitHub issue — returns GitHub detail plus any
    HN/Reddit/SO content mentioning the issue title.
    """
    cache_key = f"issue_detail:{issue_number}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result: dict[str, Any] = {"issue_number": issue_number}

    # GitHub
    try:
        rows = run_query(
            f"SELECT * FROM gh.issues WHERE number = {issue_number} LIMIT 1"
        )
        result["github"] = rows[0] if rows else {}
    except CoralError as exc:
        logger.warning(f"GitHub detail query failed: {exc}")
        result["github"] = {}

    issue_title = (result["github"].get("title") or "").lower()
    safe = issue_title.replace("'", "''")

    # HN
    try:
        result["hackernews"] = run_query(
            f"SELECT title, url, points, num_comments, author FROM hackernews.stories "
            f"WHERE LOWER(title) LIKE LOWER('%{safe}%') LIMIT 10"
        ) if safe else []
    except CoralError:
        result["hackernews"] = []

    # Reddit
    try:
        raw = run_query(
            f"SELECT data__title, data__url, data__score, data__subreddit, data__permalink "
            f"FROM reddit.posts "
            f"WHERE LOWER(data__title) LIKE LOWER('%{safe}%') LIMIT 10"
        ) if safe else []
        result["reddit"] = [
            {
                "title": r.get("data__title"),
                "url": r.get("data__url"),
                "score": r.get("data__score"),
                "subreddit": r.get("data__subreddit"),
                "permalink": r.get("data__permalink"),
            }
            for r in raw
        ]
    except CoralError:
        result["reddit"] = []

    # Stack Overflow
    try:
        raw = run_query(
            f"SELECT title, link, score, answer_count FROM stackoverflow.questions "
            f"WHERE LOWER(title) LIKE LOWER('%{safe}%') LIMIT 10"
        ) if safe else []
        result["stackoverflow"] = [
            {
                "title": r.get("title"),
                "url": r.get("link"),
                "score": r.get("score"),
                "answer_count": r.get("answer_count"),
            }
            for r in raw
        ]
    except CoralError:
        result["stackoverflow"] = []

    cache.set(cache_key, result, ttl_seconds=CACHE_TTL)
    return result


# ---------------------------------------------------------------------------
# Source health check
# ---------------------------------------------------------------------------

def check_sources() -> dict[str, dict]:
    """
    Check which Coral sources are configured and responding.

    Returns:
        Dict mapping source name → {"active": bool, "error": str | None}
    """
    cache_key = "sources_status"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    test_queries = {
        "github":        "SELECT number FROM gh.issues LIMIT 1",
        "hackernews":    "SELECT title FROM hackernews.stories LIMIT 1",
        "stackoverflow": "SELECT title FROM stackoverflow.questions LIMIT 1",
    }

    sources: dict[str, dict] = {}
    for name, sql in test_queries.items():
        try:
            run_query(sql)
            sources[name] = {"active": True, "error": None}
        except CoralError as exc:
            sources[name] = {"active": False, "error": str(exc)[:120]}

    # Reddit: test actual connectivity with a lightweight request
    try:
        import requests as _req
        term = (_current_search_term() or "test").replace(" ", "+")
        r = _req.get(
            f"https://www.reddit.com/search.json?q={term}&limit=1",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=8,
        )
        r.raise_for_status()
        sources["reddit"] = {"active": True, "error": None}
    except Exception as exc:
        sources["reddit"] = {"active": False, "error": str(exc)[:120]}

    cache.set(cache_key, sources, ttl_seconds=60)
    return sources


# ---------------------------------------------------------------------------
# Schema learning
# ---------------------------------------------------------------------------

def get_schema() -> dict:
    """
    Query Coral's metadata catalogue: tables, columns, and table functions.
    coral.tables, coral.columns, coral.table_functions are Coral built-ins.
    """
    cache_key = "schema"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result: dict = {}

    try:
        result["tables"] = run_query(
            "SELECT schema_name, table_name "
            "FROM coral.tables "
            "ORDER BY schema_name, table_name"
        )
    except CoralError as exc:
        logger.warning(f"coral.tables query failed: {exc}")
        result["tables"] = []

    try:
        result["columns"] = run_query(
            "SELECT schema_name, table_name, column_name, data_type "
            "FROM coral.columns "
            "ORDER BY schema_name, table_name, column_name"
        )
    except CoralError as exc:
        logger.warning(f"coral.columns query failed: {exc}")
        result["columns"] = []

    try:
        result["table_functions"] = run_query(
            "SELECT schema_name, function_name "
            "FROM coral.table_functions "
            "ORDER BY schema_name, function_name"
        )
    except CoralError as exc:
        logger.warning(f"coral.table_functions query failed: {exc}")
        result["table_functions"] = []

    cache.set(cache_key, result, ttl_seconds=300)
    return result
