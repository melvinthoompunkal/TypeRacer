# TypeRacer

A dark, mobile-friendly multiplayer typing race game with solo practice, quick matches against human-like server bots, private room codes, and rematches.

## Run locally

```bash
npm install
npm run dev
```

The client runs at `http://localhost:5173` and proxies API requests to the server at `http://localhost:3001`.

## Production

```bash
npm run build
npm start
```

The Express server serves both the API and built React client from one port. It binds to `0.0.0.0`, reads Railway's `PORT` automatically, and defaults to `3001` locally.

Health check: `GET /health` returns `ok`.

## Railway

1. Push this folder to a Git repository and create a Railway project from it.
2. Railway's Railpack detects this Node workspace and its package scripts automatically.
3. If commands need to be entered manually, use `npm run build` for Build and `npm start` for Start.
4. Set the service health-check path to `/health`. No variables are required because Railway supplies `PORT`.

The client uses relative `/api` and Socket.IO URLs in production, so changing the Railway domain requires no code changes.

Quick matches wait 3–5 seconds for human racers, fill open slots with 60–90 WPM server-simulated bots, run a synchronized countdown, and stream authoritative progress, WPM, accuracy, and finish order. Private rooms use four-letter codes and host-controlled starts. Rematches keep the human group together and reroll every bot.

## Configuration

Copy `.env.example` values into your shell or hosting provider when overrides are needed:

- `PORT`: Express and Socket.IO port; defaults to `3001`.
- `HOST`: bind address; defaults to `0.0.0.0` for containers and Railway.
- `CLIENT_ORIGINS`: comma-separated origins if the client is hosted separately later.
- `DEV_SERVER_URL`: Vite's local proxy target; defaults to `http://localhost:3001`.

Game rooms remain in server memory as specified. The upcoming room manager will keep storage behind a dedicated module, allowing Redis or another provider to replace it later without changing HTTP routes or client events.
