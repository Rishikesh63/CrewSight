"""
AI triage summarizer for CrewSight.

Uses NVIDIA NIM API (OpenAI-compatible) for text generation.
MCP-first: starts coral mcp-stdio and lets the LLM query Coral directly.
Falls back to direct prompt if MCP fails.
"""

import asyncio
import json
import logging
import os

from openai import OpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = logging.getLogger(__name__)

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL = "meta/llama-3.3-70b-instruct"

_SYSTEM = (
    "You are an OSS maintainer's intelligence assistant. "
    "Use the sql tool to query Coral data sources: "
    "gh.issues, hackernews.stories, reddit.posts, stackoverflow.questions. "
    "Find recent open issues and check community buzz. "
    "Write a prioritized triage briefing — bullet points, max 3 lines per issue."
)

_DETAIL_SYSTEM = (
    "You are an OSS maintainer's assistant. Analyze this GitHub issue and its "
    "community activity. Cover: what the issue is about, community sentiment, "
    "urgency, and a clear recommended next action. Be specific and actionable."
)

_MCP_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "sql",
            "description": (
                "Execute read-only SQL against Coral. "
                "Schemas: gh (issues, pull_requests), hackernews (stories), "
                "reddit (posts), stackoverflow (questions)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "SQL query to execute"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_catalog",
            "description": "List available Coral database tables and schemas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "schema": {"type": "string", "description": "Filter by schema name"},
                },
            },
        },
    },
]


def _get_client() -> OpenAI:
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY is not set.")
    return OpenAI(base_url=NVIDIA_BASE_URL, api_key=api_key)


# ---------------------------------------------------------------------------
# MCP triage (primary path)
# ---------------------------------------------------------------------------

async def _run_mcp_triage() -> tuple[str, list[dict]]:
    """Start coral mcp-stdio and run an agentic loop with NVIDIA LLM."""
    server = StdioServerParameters(command="coral", args=["mcp-stdio"])

    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tool_names = [t.name for t in (await session.list_tools()).tools]
            logger.info("Coral MCP tools: %s", tool_names)

            client = _get_client()
            messages = [
                {"role": "system", "content": _SYSTEM},
                {
                    "role": "user",
                    "content": (
                        "Run ONE sql query to get the 10 most recently updated open issues: "
                        "SELECT number, title, comments, updated_at FROM gh.issues WHERE state='open' ORDER BY updated_at DESC LIMIT 10. "
                        "Then run ONE more query for HN: SELECT title, points FROM hackernews.stories LIMIT 10. "
                        "Then write a short prioritized triage briefing."
                    ),
                },
            ]

            captured_calls: list[dict] = []

            for round_num in range(3):
                try:
                    response = client.chat.completions.create(
                        model=MODEL,
                        messages=messages,
                        tools=_MCP_TOOLS,
                        tool_choice="auto",
                        max_tokens=2048,
                    )
                except Exception as api_err:
                    logger.error("NVIDIA API error (round %d): %s", round_num, api_err)
                    raise

                choice = response.choices[0]
                msg = choice.message

                if choice.finish_reason == "stop" or not msg.tool_calls:
                    return msg.content or "No triage generated.", captured_calls

                # Execute MCP tool calls
                tool_results = []
                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}

                    logger.info("MCP [%d] %s: %s", round_num + 1, tool_name, str(args)[:120])

                    try:
                        result = await session.call_tool(tool_name, args)
                        content = "\n".join(
                            c.text for c in (result.content or []) if hasattr(c, "text")
                        )
                    except Exception as exc:
                        content = f"Tool error: {exc}"

                    # Capture for UI display
                    call_info: dict = {"tool": tool_name, "input": args}
                    if tool_name == "sql":
                        call_info["sql"] = args.get("query", "")
                        try:
                            rows = json.loads(content)
                            call_info["rows"] = len(rows) if isinstance(rows, list) else 1
                        except Exception:
                            call_info["rows"] = 0
                    captured_calls.append(call_info)

                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": content or "[]",
                    })

                # Add assistant message with tool calls, then tool results
                messages.append({"role": "assistant", "content": msg.content, "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg.tool_calls
                ]})
                messages.extend(tool_results)

    return "Triage complete.", captured_calls


def generate_triage(issues: list[dict]) -> tuple[str, list[dict]]:
    """Generate triage via Coral MCP + NVIDIA LLM. Falls back to direct prompt."""
    from coral_client import _CROSS_SOURCE_JOIN
    baseline_queries: list[dict] = [
        {"tool": "sql", "input": {}, "sql": _CROSS_SOURCE_JOIN.strip(), "rows": len(issues)}
    ]

    try:
        import sys
        loop = asyncio.ProactorEventLoop() if sys.platform == "win32" else asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            text, mcp_calls = loop.run_until_complete(_run_mcp_triage())
            return text, baseline_queries + mcp_calls
        finally:
            loop.close()
            asyncio.set_event_loop(None)
    except Exception as exc:
        if hasattr(exc, "exceptions"):
            for sub in exc.exceptions:  # type: ignore[attr-defined]
                logger.warning("MCP sub-exception: %s: %s", type(sub).__name__, sub)
        else:
            logger.warning("MCP triage failed (%s: %s)", type(exc).__name__, exc)
        return _direct_triage(issues), baseline_queries


def _direct_triage(issues: list[dict]) -> str:
    """Fallback: build context from pre-fetched data, call NVIDIA once."""
    if not issues:
        return "No open issues found."

    active = [i for i in issues if (i.get("activity_score") or 0) > 0]
    if not active:
        return (
            f"Found **{len(issues)} open issues** but none are being discussed "
            f"on Hacker News, Reddit, or Stack Overflow. Everything looks quiet! ✓"
        )

    lines = [f"{len(issues)} open issues; {len(active)} have external buzz.\n"]
    for issue in active[:20]:
        snippets = []
        if issue.get("hn_post"):
            snippets.append(f'HN: "{str(issue["hn_post"])[:80]}" ({issue.get("hn_points")} pts)')
        if issue.get("reddit_post"):
            snippets.append(f'Reddit: "{str(issue["reddit_post"])[:80]}" (↑{issue.get("reddit_score")})')
        if issue.get("so_question"):
            snippets.append(f'SO: "{str(issue["so_question"])[:80]}" (score {issue.get("so_score")})')
        lines.append(
            f"• #{issue.get('issue_number')}: {issue.get('issue')}\n"
            f"  Buzz {issue.get('activity_score')}/3 | {' | '.join(snippets)}"
        )

    try:
        client = _get_client()
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": "\n".join(lines)},
            ],
            max_tokens=1024,
        )
        return resp.choices[0].message.content or "No summary generated."
    except Exception as exc:
        return f"⚠️ AI summary unavailable: {exc}"


# ---------------------------------------------------------------------------
# Issue deep-dive
# ---------------------------------------------------------------------------

def generate_issue_detail(issue: dict) -> str:
    github_data = issue.get("github") or {}
    hn_data     = issue.get("hackernews") or []
    reddit_data = issue.get("reddit") or []
    so_data     = issue.get("stackoverflow") or []

    issue_title = (
        issue.get("issue_title")
        or github_data.get("title")
        or f"Issue #{issue.get('issue_number', '?')}"
    )

    parts = [f"# GitHub Issue: {issue_title}\n"]
    if github_data:
        parts.append(
            f"**State:** {github_data.get('state', 'unknown')}\n"
            f"**Created:** {str(github_data.get('created_at', ''))[:10]}\n"
            f"**URL:** {github_data.get('html_url', 'N/A')}\n"
            f"**Body:**\n{str(github_data.get('body') or '')[:800]}"
        )
    if hn_data:
        parts.append(f"\n## Hacker News ({len(hn_data)} stories)")
        for s in hn_data[:5]:
            parts.append(f"- [{s.get('points', 0)} pts] {s.get('title', '')} — {s.get('url', '')}")
    if reddit_data:
        parts.append(f"\n## Reddit ({len(reddit_data)} posts)")
        for p in reddit_data[:5]:
            parts.append(f"- [↑{p.get('score', 0)} r/{p.get('subreddit', '?')}] {p.get('title', '')}")
    if so_data:
        parts.append(f"\n## Stack Overflow ({len(so_data)} questions)")
        for q in so_data[:5]:
            answered = "✓" if q.get("is_answered") else "○"
            parts.append(f"- {answered} [{q.get('score', 0)} score] {q.get('title', '')}")
    if not hn_data and not reddit_data and not so_data:
        parts.append("\n## External activity\nNo matching discussions found.")

    try:
        client = _get_client()
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": _DETAIL_SYSTEM},
                {"role": "user", "content": "\n".join(parts)},
            ],
            max_tokens=1024,
        )
        return resp.choices[0].message.content or "No summary generated."
    except Exception as exc:
        logger.error("Issue detail generation failed: %s", exc, exc_info=True)
        return f"⚠️ AI summary unavailable: {exc}"
