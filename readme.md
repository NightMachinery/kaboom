# Kaboom

Self-hosted Kaboom for local and intranet play.

## Highlights

- bare-metal self-hosting with `self_host.zsh`
- single Go backend for room/session/game state
- production frontend served directly by Caddy
- local guest identity instead of OAuth
- built-in playsets only
- HTTP-friendly clipboard and adaptive `ws` / `wss`

## Development

1. Load Node in zsh:
   ```zsh
   nvm-load
   nvm use $(cat .nvmrc)
   ```
2. Install dependencies:
   ```zsh
   pnpm install --frozen-lockfile
   ```
3. Run the frontend dev server:
   ```zsh
   pnpm dev
   ```
4. Run the Go backend:
   ```zsh
   go run ./server
   ```

## Self-hosting

See [`docs/self-hosting.md`](docs/self-hosting.md).
