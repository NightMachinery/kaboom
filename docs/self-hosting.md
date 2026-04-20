# Self-hosting Kaboom

## Overview

This repo ships with a bare-metal self-host flow built around:

- a Vite-built static frontend in `dist/`
- a single Go backend for guest identity, rooms, and server-authoritative game state
- Caddy serving static files directly in production and proxying `/api*` + `/ws*`
- tmux-managed long-lived processes started by `self_host.zsh`

The self-hosted flow is intranet-friendly:

- no Docker
- no Supabase, Firebase, Vercel analytics, Google/Discord OAuth, or captcha
- no runtime dependence on external fonts or CDN assets
- WebSockets automatically use `ws://` on HTTP pages and `wss://` on HTTPS pages
- clipboard copy falls back to `document.execCommand('copy')` on plain HTTP

## Default URL and ports

Default public URL:

```text
http://kaboom.pinky.lilf.ir
```

Default ports:

- backend: `127.0.0.1:18084`
- Vite dev server: `127.0.0.1:4174`

If you pass a bare host like `kaboom.example.internal`, the script normalizes it to `http://kaboom.example.internal`.

## Prerequisites

- `tmux`
- `caddy`
- `go`
- `pnpm`
- `python3`
- `curl`
- `sha256sum`
- `ss`
- `nvm-load` available in login zsh shells

Node is loaded in zsh with:

```zsh
nvm-load
nvm use VERSION
```

This repo uses `.nvmrc` and `pnpm-lock.yaml`.

## Commands

```zsh
./self_host.zsh setup [public_url]
./self_host.zsh redeploy [public_url]
./self_host.zsh start [public_url]
./self_host.zsh stop
./self_host.zsh dev-start [public_url]
```

Behavior:

- `setup`: stops prod/dev sessions, installs deps if needed, builds backend/frontend, updates `~/Caddyfile`, reloads Caddy, then starts production.
- `redeploy`: rebuilds from the current local checkout and restarts production. It does **not** `git pull`.
- `start`: stops prod/dev sessions, refreshes the managed Caddy block, and starts production from existing artifacts.
- `stop`: kills all Kaboom tmux sessions.
- `dev-start`: stops prod/dev sessions, switches Caddy to dev proxy mode, starts the Go backend, and starts the Vite HMR server.

`start`, `redeploy`, and `dev-start` all stop both production and development tmux sessions first.

## tmux sessions and logs

Sessions:

- `kaboom-server`
- `kaboom-vite` (dev mode only)

Logs:

```text
.self-host/logs/
```

Examples:

```zsh
tmux ls
tmux attach -t kaboom-server
```

## Guest identity and migrate-device links

Self-hosted Kaboom uses local guest identity instead of OAuth.

Browser storage keeps:

- `kaboom_guest_token`
- `kaboom_guest_name`
- `kaboom_room_session:<ROOM_CODE>`

The backend uses:

- a long-lived browser guest token
- a room-scoped reconnect/session token

The room-scoped token:

- is different from the browser guest token
- does not reveal the underlying guest token
- is valid until the room closes
- can be copied to another device with the **Migrate device** button

Migration links use the current room URL with `?session=...`. When opened, that room-scoped session token is persisted locally for refresh/reconnect on the new device.

## Caddy behavior

The script manages this block in `~/Caddyfile`:

- `# BEGIN kaboom self-host`
- `# END kaboom self-host`

### Production mode

Caddy:

- reverse proxies `/api*` and `/ws*` to `127.0.0.1:18084`
- serves `dist/` directly with SPA fallback:
  - `root * <repo>/dist`
  - `try_files {path} /index.html`
  - `file_server`

### Development mode

Caddy:

- reverse proxies `/api*` and `/ws*` to `127.0.0.1:18084`
- reverse proxies everything else to the Vite dev server on `127.0.0.1:4174`

If you pass an explicit `https://...` URL, the generated Caddy block uses `tls internal` for HTTPS and also adds an HTTP fallback for the same host.

## Build preflight on this VPS

Before `pnpm install`, `pnpm build`, or `go build`, `self_host.zsh` runs a VPS health preflight that checks:

- no competing build processes
- load average
- available memory and swap
- IO and memory pressure
- free disk space

If thresholds fail, the script exits instead of forcing a build.

If you have already verified the VPS manually and want to bypass the safety gate, you can run:

```zsh
KABOOM_SKIP_PREFLIGHT=1 ./self_host.zsh setup
```

## Notes

- Production serves static files directly from Caddy; no extra static file server is used.
- `dev-start` provides frontend hot reload via Vite. The Go backend is started in tmux for iterative development.
- All URLs shown to players are derived from the current browser location at runtime.
