"""
CrewSight FastAPI backend.

Cross-platform OSS intelligence: GitHub issues + Hacker News + Reddit + Stack Overflow
— all queried via Coral SQL. All data queries go through coral_client.py.

Run locally:
    cd backend
    uvicorn main:app --reload --port 8000
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cache import cache
from config_manager import get_masked_config, load_config, save_config
from coral_client import (
    CoralError,
    check_sources,
    get_all_discussions,
    get_issue_detail,
    get_issue_landscape,
    get_schema,
    run_query,
)
from summarizer import generate_issue_detail, generate_triage

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CrewSight API",
    description=(
        "OSS intelligence dashboard — "
        "query GitHub, Hacker News, Reddit, and Stack Overflow via Coral SQL."
    ),
    version="2.0.0",
)

# Allow all origins so the Next.js frontend (Vercel / localhost:3000) can call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with method, path, status, and duration."""
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d (%.1f ms)",
        request.method, request.url.path, response.status_code, ms,
    )
    return response


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    sql: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
async def health():
    """
    Health check. Also returns source connectivity status.
    Safe to call frequently — source status is cached for 60 s.
    """
    try:
        sources = check_sources()
    except Exception as exc:
        logger.warning("Health check: could not retrieve source status: %s", exc)
        sources = {}
    return {"status": "ok", "sources": sources, "timestamp": _now()}


@app.get("/api/issues", tags=["data"])
async def get_issues():
    """
    Fetch all open GitHub issues with their cross-platform activity.

    Runs the full Coral JOIN query (or falls back to per-source queries).
    Results are cached for CACHE_TTL seconds (default 5 min).

    Returns:
        {
          "issues":       list of issue objects,
          "total":        int,
          "cached":       bool — true if served from cache,
          "last_updated": ISO-8601 timestamp
        }
    """
    try:
        was_cached = cache.get("issue_landscape") is not None
        issues = await asyncio.to_thread(get_issue_landscape)
        return {
            "issues": issues,
            "total": len(issues),
            "cached": was_cached,
            "last_updated": _now(),
        }
    except CoralError as exc:
        logger.error("GET /api/issues CoralError: %s", exc)
        raise HTTPException(status_code=503, detail=f"Coral query failed: {exc}")
    except Exception as exc:
        logger.error("GET /api/issues unexpected error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/summary", tags=["ai"])
async def get_summary():
    """
    Return the AI-generated triage briefing (cached for CACHE_TTL seconds).

    On a cache miss, fetches fresh issues from Coral and calls Claude.
    Generating a summary takes ~3-5 seconds — subsequent calls within the
    TTL window return instantly from cache.

    Returns:
        {"summary": str, "cached": bool}
    """
    cache_key = "triage_summary"
    try:
        cached_val = cache.get(cache_key)
        if cached_val is not None:
            return {"summary": cached_val, "cached": True}

        issues = await asyncio.to_thread(get_issue_landscape)
        summary = await asyncio.to_thread(generate_triage, issues)
        cache.set(cache_key, summary)
        return {"summary": summary, "cached": False}
    except CoralError as exc:
        logger.error("GET /api/summary CoralError: %s", exc)
        raise HTTPException(status_code=503, detail=f"Coral query failed: {exc}")
    except Exception as exc:
        logger.error("GET /api/summary unexpected error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/issue/{issue_number}", tags=["data"])
async def get_issue(issue_number: int):
    """
    Deep-dive into a single issue with full cross-platform context + AI analysis.

    Args:
        issue_number: The GitHub issue number (integer)

    Returns:
        {"issue": {...detail...}, "summary": "AI deep-dive text"}
    """
    cache_key = f"issue_deep:{issue_number}"
    try:
        cached_val = cache.get(cache_key)
        if cached_val is not None:
            return cached_val

        landscape = await asyncio.to_thread(get_issue_landscape)
        meta = next(
            (i for i in landscape if i.get("issue_number") == issue_number),
            None,
        )
        if meta is None:
            raise HTTPException(
                status_code=404,
                detail=f"Issue #{issue_number} not found (it may not be open or not in the Coral cache).",
            )

        detail = await asyncio.to_thread(get_issue_detail, issue_number)
        detail["meta"] = meta
        summary = await asyncio.to_thread(generate_issue_detail, detail)

        result: dict[str, Any] = {"issue": detail, "summary": summary}
        cache.set(cache_key, result)
        return result

    except HTTPException:
        raise
    except CoralError as exc:
        logger.error("GET /api/issue/%d CoralError: %s", issue_number, exc)
        raise HTTPException(status_code=503, detail=f"Coral query failed: {exc}")
    except Exception as exc:
        logger.error("GET /api/issue/%d unexpected: %s", issue_number, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/sources", tags=["meta"])
async def get_sources():
    """
    Return the connectivity status of all four Coral sources.

    Each source is validated with a lightweight test query.
    Results are cached for 60 seconds.

    Returns:
        {"sources": [{"name": str, "active": bool, "error": str | null}]}
    """
    try:
        statuses = check_sources()
        return {
            "sources": [
                {"name": name, "active": info["active"], "error": info.get("error")}
                for name, info in statuses.items()
            ]
        }
    except Exception as exc:
        logger.error("GET /api/sources error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve source status")


@app.get("/api/discussions", tags=["data"])
async def get_discussions():
    """
    Fetch independent discussions from Hacker News, Reddit, and Stack Overflow
    about the configured project. Content is NOT joined to GitHub issues —
    each platform returns its own most relevant/recent posts.

    Returns:
        {
          "hackernews":    list of HN stories,
          "reddit":        list of Reddit posts,
          "stackoverflow": list of SO questions
        }
    """
    try:
        return await asyncio.to_thread(get_all_discussions)
    except Exception as exc:
        logger.error("GET /api/discussions error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/config", tags=["config"])
async def get_config():
    """
    Return current integration config with secrets masked.
    Used by the settings UI to populate form fields.
    """
    return get_masked_config()


def _register_coral_source(source: str, cfg: dict) -> tuple[bool, str]:
    """
    Register (or re-register) a Coral source by running coral source add
    with credentials passed as environment variables — no interactive prompts.
    """
    import subprocess as _sp
    from pathlib import Path as _Path

    _SPEC = {
        "github":        "sources/github_issues_spec.yaml",
        "hackernews":    "sources/hackernews_spec.yaml",
        "reddit":        "sources/reddit_spec.yaml",
        "stackoverflow": "sources/stackoverflow_spec.yaml",
    }
    _SCHEMA = {"github": "gh", "hackernews": "hackernews", "reddit": "reddit", "stackoverflow": "stackoverflow"}
    _ENV_VARS: dict[str, Any] = {
        "github": lambda c: {
            "GITHUB_OWNER":     c.get("repo", "/").split("/")[0],
            "GITHUB_REPO_NAME": (c.get("repo", "/").split("/") + [""])[1],
        },
        "hackernews":    lambda c: {"HN_SEARCH_TERM":     c.get("search_term", "")},
        "reddit":        lambda c: {"REDDIT_SEARCH_TERM": c.get("search_term", "")},
        "stackoverflow": lambda c: {"SO_SEARCH_TERM":     c.get("search_term", "")},
    }

    spec = _SPEC.get(source)
    if not spec:
        return False, f"Unknown source: {source}"

    ev   = _ENV_VARS[source](cfg)
    env  = {**os.environ, **ev}
    cwd  = str(_Path(__file__).parent)

    # Remove existing registration (ignore failure if not registered)
    _sp.run(["coral", "source", "remove", _SCHEMA[source]], env=env,
            capture_output=True, cwd=cwd)

    result = _sp.run(
        ["coral", "source", "add", "--file", spec],
        env=env, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=30, cwd=cwd,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "unknown error").strip()
        logger.warning("coral source add failed for %s: %s", source, err)
        return False, err

    logger.info("Coral source registered: %s", source)
    return True, "registered"


@app.post("/api/config/{source}", tags=["config"])
async def update_config(source: str, body: dict):
    """
    Update config for a single integration source and register it with Coral.

    Body keys vary by source:
      github:        { token, repo }
      hackernews:    { search_term }
      reddit:        { search_term }
      stackoverflow: { search_term }

    Saves to integration_config.json, syncs to .env, registers Coral source,
    clears all caches.
    """
    valid_sources = {"github", "hackernews", "reddit", "stackoverflow"}
    if source not in valid_sources:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}. Valid: {valid_sources}")

    config = load_config()
    for k, v in body.items():
        if k == "enabled":
            continue
        # Don't overwrite a stored secret with an empty value (masked field was sent as-is)
        if not v and config[source].get(k):
            continue
        config[source][k] = v
    config[source]["enabled"] = True
    save_config(config)
    cache.clear()

    # Register with Coral in background thread (coral source add is blocking)
    ok, msg = await asyncio.to_thread(_register_coral_source, source, config[source])
    logger.info("Config updated for source: %s (coral: %s)", source, msg)
    return {"status": "updated", "source": source, "coral": "registered" if ok else msg}


@app.delete("/api/config/{source}", tags=["config"])
async def disable_config(source: str):
    """Disable an integration source (keeps stored values, just marks as disabled)."""
    config = load_config()
    if source not in config:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
    config[source]["enabled"] = False
    save_config(config)
    cache.clear()
    return {"status": "disabled", "source": source}


@app.get("/api/schema", tags=["meta"])
async def get_schema_endpoint():
    """
    Discover all registered Coral sources and tables via schema introspection.
    Queries coral.tables — Coral's built-in metadata catalogue.
    """
    try:
        rows = await asyncio.to_thread(get_schema)
        return {"tables": rows, "count": len(rows)}
    except Exception as exc:
        logger.error("GET /api/schema error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Schema query failed")


@app.get("/proxy/reddit", tags=["proxy"])
async def reddit_proxy(q: str = ""):
    """
    Flattens Reddit's nested API response so Coral can query it as a flat table.
    Reddit wraps every post in {kind, data: {...}} which Coral DSL v3 can't reach.
    This proxy unwraps it and returns a plain array under a 'posts' key.
    """
    import urllib.request as _urllib
    import json as _json

    term = (q or "").replace(" ", "+")
    if not term:
        return {"posts": []}

    try:
        req = _urllib.Request(
            f"https://www.reddit.com/search.json?q={term}&sort=new&limit=25&type=link",
            headers={"User-Agent": "CrewSight/1.0"},
        )
        with _urllib.urlopen(req, timeout=15) as resp:
            data = _json.loads(resp.read())
    except Exception as exc:
        logger.warning("Reddit proxy fetch failed: %s", exc)
        return {"posts": []}

    posts = []
    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {})
        if not post:
            continue
        permalink = post.get("permalink", "")
        if permalink and not permalink.startswith("http"):
            permalink = f"https://reddit.com{permalink}"
        posts.append({
            "id":           post.get("id"),
            "title":        post.get("title"),
            "url":          post.get("url"),
            "score":        post.get("score"),
            "num_comments": post.get("num_comments"),
            "subreddit":    post.get("subreddit"),
            "permalink":    permalink,
            "author":       post.get("author"),
        })

    return {"posts": posts}


@app.post("/api/refresh", tags=["meta"])
async def refresh():
    """
    Clear all caches so the next request fetches fresh data from Coral.

    Call this after making changes to your Coral sources or when you
    want to force an immediate data update.

    Returns:
        {"status": "refreshed", "timestamp": ISO-8601}
    """
    cache.clear()
    logger.info("All caches cleared via POST /api/refresh")
    return {"status": "refreshed", "timestamp": _now()}


@app.post("/api/query", tags=["debug"])
async def run_custom_query(body: QueryRequest):
    """
    Execute an arbitrary Coral SQL query.

    Useful for exploring your data sources and debugging JOIN conditions
    before they're baked into the dashboard.

    Body:   {"sql": "SELECT * FROM github.issues LIMIT 5"}
    Returns: {"results": [...], "count": int}
    """
    if not body.sql.strip():
        raise HTTPException(status_code=400, detail="sql must not be empty")

    try:
        results = run_query(body.sql)
        return {"results": results, "count": len(results)}
    except CoralError as exc:
        logger.error("POST /api/query CoralError: %s", exc)
        raise HTTPException(status_code=400, detail=f"Coral query error: {exc}")
    except Exception as exc:
        logger.error("POST /api/query unexpected: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
