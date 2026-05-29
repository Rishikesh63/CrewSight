#!/usr/bin/env bash
# ── CrewSight startup script ─────────────────────────────────────────────────
# Runs inside the Fly.io container before uvicorn starts.
# The Coral config volume is mounted at /data/coral — we symlink it to ~/.coral
# so the Coral CLI finds its source configurations.

set -e

CORAL_DATA_DIR="/data/coral"
CORAL_HOME="$HOME/.coral"

# ── Link persistent Coral config volume ──────────────────────────────────────
# Fly.io mounts the volume at /data. We keep Coral's config there so source
# credentials survive container restarts and new deploys.
if [ -d "$CORAL_DATA_DIR" ]; then
    echo "[start.sh] Coral config volume found at $CORAL_DATA_DIR"

    # Remove default ~/.coral if it's a plain directory (first boot)
    if [ -d "$CORAL_HOME" ] && [ ! -L "$CORAL_HOME" ]; then
        # Preserve any files that were baked in, then replace with symlink
        cp -rn "$CORAL_HOME/." "$CORAL_DATA_DIR/" 2>/dev/null || true
        rm -rf "$CORAL_HOME"
    fi

    # Create symlink if it doesn't already exist
    if [ ! -L "$CORAL_HOME" ]; then
        ln -s "$CORAL_DATA_DIR" "$CORAL_HOME"
        echo "[start.sh] Linked $CORAL_HOME -> $CORAL_DATA_DIR"
    fi
else
    echo "[start.sh] WARNING: Coral data volume not found at $CORAL_DATA_DIR"
    echo "[start.sh] Coral source configs will NOT persist across deploys."
    echo "[start.sh] Run: fly volumes create coral_data --size 1 --region <region>"
fi

# ── Start D-Bus + GNOME Keyring (needed for coral source add on Linux) ───────
if command -v dbus-launch &>/dev/null; then
    eval $(dbus-launch --sh-syntax) 2>/dev/null || true
fi
if command -v gnome-keyring-daemon &>/dev/null; then
    eval $(gnome-keyring-daemon --start --components=secrets 2>/dev/null) || true
    export GNOME_KEYRING_CONTROL GNOME_KEYRING_PID SSH_AUTH_SOCK
fi

# ── Show configured sources (informational) ──────────────────────────────────
echo "[start.sh] Coral sources:"
coral source list 2>/dev/null || echo "  (none configured yet)"

# ── Start the FastAPI server ──────────────────────────────────────────────────
PORT="${PORT:-8000}"
echo "[start.sh] Starting uvicorn on 0.0.0.0:$PORT"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
