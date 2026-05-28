"""
Integration config manager for CrewSight.

Stores platform credentials and search terms in integration_config.json.
On save, syncs key values back to .env so coral_client.py picks them up.
"""

import json
import os
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "integration_config.json"
ENV_FILE = Path(__file__).parent / ".env"

_DEFAULTS: dict = {
    "github": {"token": "", "repo": "", "enabled": False},
    "hackernews": {"search_term": "", "enabled": False},
    "reddit": {"search_term": "", "enabled": False},
    "stackoverflow": {"search_term": "", "enabled": False},
}

_SECRET_KEYS = {"token"}


def _read_env() -> dict:
    """Parse .env file into a dict without importing dotenv."""
    if not ENV_FILE.exists():
        return {}
    result: dict = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                result[k.strip()] = v.strip()
    return result


def _env(key: str, env: dict) -> str:
    return env.get(key, os.getenv(key, "") or "")


def load_config() -> dict:
    """Load integration config, bootstrapping from .env on first run."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                data = json.load(f)
            for source, defaults in _DEFAULTS.items():
                if source not in data:
                    data[source] = defaults.copy()
                else:
                    for k, v in defaults.items():
                        data[source].setdefault(k, v)
            return data
        except (json.JSONDecodeError, IOError):
            pass

    return _seed_from_env()


def _seed_from_env() -> dict:
    """Build initial config by reading values from .env / environment."""
    env = _read_env()
    config: dict = {k: v.copy() for k, v in _DEFAULTS.items()}

    # GitHub
    repo, token = _env("GITHUB_REPO", env), _env("GITHUB_TOKEN", env)
    config["github"].update({"repo": repo, "token": token, "enabled": bool(repo and token)})

    # HN / Reddit / SO share the same search term
    term = _env("SEARCH_TERM", env)
    for src in ("hackernews", "reddit", "stackoverflow"):
        config[src].update({"search_term": term, "enabled": bool(term)})

    return config


def save_config(config: dict) -> None:
    """Persist integration config and sync key values back to .env."""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    _sync_env(config)


def _sync_env(config: dict) -> None:
    """Write relevant values back to .env so coral_client.py picks them up."""
    current = _read_env()

    gh = config.get("github", {})
    if gh.get("repo"):
        current["GITHUB_REPO"] = gh["repo"]
    if gh.get("token"):
        current["GITHUB_TOKEN"] = gh["token"]

    for src in ("hackernews", "reddit", "stackoverflow"):
        term = config.get(src, {}).get("search_term", "")
        if term:
            current["SEARCH_TERM"] = term
            break

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        for k, v in current.items():
            f.write(f"{k}={v}\n")


def get_masked_config() -> dict:
    """Return config with token secrets masked (safe for API responses)."""
    config = load_config()
    result = {}
    for source, values in config.items():
        result[source] = values.copy()
        for key in _SECRET_KEYS:
            raw = result[source].get(key, "")
            if raw:
                result[source][key] = raw[:4] + "••••" + raw[-4:] if len(raw) > 8 else "••••"
    return result
