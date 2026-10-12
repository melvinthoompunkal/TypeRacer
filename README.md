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
2. Add a service from the repository. Railway detects the root `Dockerfile` and builds the production image automatically.
3. Under **Settings -> Networking**, generate a public domain.
4. Set the service health-check path to `/health`. No variables are required because Railway supplies `PORT`.

Keep the service at **one replica**. Matchmaking rooms and Socket.IO session state are held in this process's memory, so multiple replicas require a shared room store and a Socket.IO-compatible cross-replica adapter first.

The Docker image builds both workspaces, contains only production dependencies and compiled output, runs as a non-root user, and checks `/health` internally. If deploying without Docker, Railway's Railpack can also use `npm run build` as the build command and `npm start` as the start command.

The client uses relative `/api` and Socket.IO URLs in production, so changing the Railway domain requires no code changes.

Quick matches wait 3–5 seconds for human racers, fill open slots with 60–90 WPM server-simulated bots, run a synchronized countdown, and stream authoritative progress, WPM, accuracy, and finish order. Private rooms use four-letter codes and host-controlled starts. Rematches keep the human group together and reroll every bot.

## Configuration

Copy `.env.example` values into your shell or hosting provider when overrides are needed:

- `PORT`: Express and Socket.IO port; defaults to `3001`.
- `HOST`: bind address; defaults to `0.0.0.0` for containers and Railway.
- `CLIENT_ORIGINS`: comma-separated origins if the client is hosted separately later.
- `DEV_SERVER_URL`: Vite's local proxy target; defaults to `http://localhost:3001`.

Game rooms remain in server memory as specified. The upcoming room manager will keep storage behind a dedicated module, allowing Redis or another provider to replace it later without changing HTTP routes or client events.
