# ── CrewSight Backend — Fly.io Dockerfile ────────────────────────────────────
#
# Key concern: Coral stores source configs in ~/.coral/
# We mount a Fly.io volume there so credentials survive deploys.
# See fly.toml [[mounts]] and the "First deploy" section in README.

FROM python:3.11-slim

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl ca-certificates \
       gnome-keyring libsecret-1-0 dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

# ── Install Coral CLI ─────────────────────────────────────────────────────────
ENV PATH="/root/.local/bin:${PATH}"
RUN curl -fsSL https://withcoral.com/install.sh | sh \
    && coral --version

# ── Python app ────────────────────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make startup script executable
RUN chmod +x start.sh

EXPOSE 8000

# start.sh waits for the Coral config volume, then launches uvicorn
CMD ["./start.sh"]
