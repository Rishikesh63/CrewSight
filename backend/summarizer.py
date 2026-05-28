"""
AI triage summarizer for CrewSight.

MCP-first: starts `coral mcp-stdio`, discovers live tools (sql, list_catalog,
search_catalog, describe_table, list_columns), and lets Claude query Coral
directly via the MCP protocol. Falls back to a direct prompt if MCP fails.
"""

import asyncio
import json
import logging
import os

import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"

_MCP_SYSTEM = (
    "You are an OSS maintainer's intelligence assistant with live SQL access to the "
    "project's data via Coral. Use list_catalog to discover tables, then sql to query "
    "gh.issues, hackernews.stories, reddit.posts, and stackoverflow.questions. "
    "Find recent open issues and check which are being discussed externally. "
    "Write a prioritized triage briefing — bullet points, max 3 lines per issue, "
    "skip issues with no external activity."
)

_DETAIL_SYSTEM = (
    "You are an OSS maintainer's assistant. Analyze this GitHub issue and its "
    "community activity on Hacker News, Reddit, and Stack Overflow. "
    "Cover: what the issue is about, community discussion, sentiment and urgency, "
    "and a clear recommended next action. Be specific and actionable."
)


def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set.")
    return anthropic.Anthropic(api_key=api_key)


# ---------------------------------------------------------------------------
# MCP-based triage (primary path)
# ---------------------------------------------------------------------------

async def _run_mcp_triage() -> str:
    """
    Start coral mcp-stdio, discover its tools, run an agentic Claude loop
    that queries Coral directly via the MCP sql / catalog tools.
    """
    server = StdioServerParameters(command="coral", args=["mcp-stdio"])

    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Discover Coral's MCP tools (sql, list_catalog, search_catalog, etc.)
            tools_response = await session.list_tools()
            tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema or {
                        "type": "object", "properties": {}
                    },
                }
                for t in tools_response.tools
            ]
            logger.info("Coral MCP tools: %s", [t["name"] for t in tools])

            client = _get_client()
            messages: list[dict] = [{
                "role": "user",
                "content": (
                    "Use list_catalog to discover available tables, then query "
                    "gh.issues for recent open items and cross-reference with "
                    "hackernews.stories, reddit.posts, and stackoverflow.questions "
                    "to find community buzz. Write a prioritized triage briefing."
                ),
            }]

            for round_num in range(6):
                response = client.messages.create(
                    model=MODEL,
                    max_tokens=2048,
                    system=_MCP_SYSTEM,
                    tools=tools,
                    messages=messages,
                )

                if response.stop_reason == "end_turn":
                    return "".join(
                        b.text for b in response.content if hasattr(b, "text")
                    ) or "No triage generated."

                # Execute each MCP tool call
                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    logger.info(
                        "MCP [%d] %s: %s",
                        round_num + 1,
                        block.name,
                        json.dumps(block.input or {})[:120],
                    )
                    try:
                        result = await session.call_tool(
                            block.name, block.input or {}
                        )
                        # Flatten MCP content blocks to a string
                        content = "\n".join(
                            c.text
                            for c in (result.content or [])
                            if hasattr(c, "text")
                        )
                    except Exception as exc:
                        content = f"Tool error: {exc}"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content or "[]",
                    })

                if not tool_results:
                    break

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

    return "Triage complete."


def generate_triage(issues: list[dict]) -> str:
    """
    Generate triage via Coral MCP (primary), fall back to direct prompt.
    Called from a thread pool (asyncio.to_thread), so asyncio.run() is safe.
    """
    try:
        return asyncio.run(_run_mcp_triage())
    except Exception as exc:
        logger.warning("MCP triage failed (%s), using direct fallback", exc)
        return _direct_triage(issues)


def _direct_triage(issues: list[dict]) -> str:
    """Fallback: build context from pre-fetched data, call Claude once."""
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
            snippets.append(
                f'HN: "{str(issue["hn_post"])[:80]}" ({issue.get("hn_points")} pts)'
            )
        if issue.get("reddit_post"):
            snippets.append(
                f'Reddit: "{str(issue["reddit_post"])[:80]}" (↑{issue.get("reddit_score")})'
            )
        if issue.get("so_question"):
            snippets.append(
                f'SO: "{str(issue["so_question"])[:80]}" (score {issue.get("so_score")})'
            )
        lines.append(
            f"• #{issue.get('issue_number')}: {issue.get('issue')}\n"
            f"  Buzz {issue.get('activity_score')}/3 | {' | '.join(snippets)}"
        )

    try:
        client = _get_client()
        msg = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=_MCP_SYSTEM,
            messages=[{"role": "user", "content": "\n".join(lines)}],
        )
        return msg.content[0].text
    except Exception as exc:
        return f"⚠️ AI summary unavailable: {exc}"


# ---------------------------------------------------------------------------
# Issue deep-dive (always direct — pre-fetched data)
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
            parts.append(
                f"- [{s.get('points', 0)} pts] {s.get('title', '')} — {s.get('url', '')}"
            )
    if reddit_data:
        parts.append(f"\n## Reddit ({len(reddit_data)} posts)")
        for p in reddit_data[:5]:
            parts.append(
                f"- [↑{p.get('score', 0)} r/{p.get('subreddit', '?')}] {p.get('title', '')}"
            )
    if so_data:
        parts.append(f"\n## Stack Overflow ({len(so_data)} questions)")
        for q in so_data[:5]:
            answered = "✓" if q.get("is_answered") else "○"
            parts.append(
                f"- {answered} [{q.get('score', 0)} score] {q.get('title', '')}"
            )
    if not hn_data and not reddit_data and not so_data:
        parts.append("\n## External activity\nNo matching discussions found.")

    try:
        client = _get_client()
        msg = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=_DETAIL_SYSTEM,
            messages=[{"role": "user", "content": "\n".join(parts)}],
        )
        return msg.content[0].text
    except Exception as exc:
        logger.error("Issue detail generation failed: %s", exc, exc_info=True)
        return f"⚠️ AI summary unavailable: {exc}"
