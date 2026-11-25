# HTTPS Communication Systems

Website ↔ PenguinMod bridge, configured for deployment as a **Render Node.js Web Service**.

## Deploy with Render Blueprint (recommended)

1. Push this project to a GitHub repository. Keep your real `.env` file and secrets out of Git.
2. Open [Render](https://render.com/) and choose **New → Blueprint**.
3. Connect the GitHub repository containing this project.
4. Render reads `render.yaml`. Review the service, then deploy.
5. Render provides a public address similar to `https://https-communication-systems.onrender.com`.
6. Open that address to load the website. Check `/api/health` to confirm the service is responding.

The Blueprint config sets `npm install`, `npm start`, `NODE_ENV=production`, a generated `SESSION_SECRET`, and the health-check endpoint. The app listens on Render's `PORT` environment variable and binds to `0.0.0.0`.

## Manual Render setup

Create a **Web Service** from the GitHub repository:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `NODE_ENV=production`
- Environment variable: `SESSION_SECRET` — generate a long random secret
- Health check path: `/api/health`

## Local development

1. Install Node.js (20+).
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env` and set a private `SESSION_SECRET`.
4. Run `npm start`.
5. Open `http://127.0.0.1:8787`.

## PenguinMod extension

Starter extension: `penguinmod/website-bridge.js`.

After Render deploys, copy your exact Render URL into the extension's **set website server URL** block, then connect with the session ID, username and token shown by the website. Use the full `https://` URL; the extension calls the API over HTTPS.

The extension only accepts a small allowlist of structured commands. It does not run arbitrary JavaScript sent by the website. Review the code before loading it unsandboxed.

## Prototype limitations — read before public use

- Sessions and queued commands are currently stored in memory. A server restart or instance replacement clears them.
- This prototype is designed for one service instance; multiple instances do not share session state.
- A username is an identifier, not proof of account ownership. Production multi-user use needs real account authentication and persistent shared storage.
- Add rate limits, command expiration, and durable session ownership before inviting others.
- The REST polling bridge works over Render HTTPS. The server also reserves a `/bridge` WebSocket endpoint, but the current extension uses authenticated HTTP polling.
- Render's free service can spin down while idle. It is suitable for testing; dependable always-on responsiveness requires an always-on paid instance.

## API

- `GET /api/health` — health check
- `POST /api/sessions` — create a session
- `GET /api/session` — verify session (headers)
- `POST /api/commands` — queue allowlisted commands
- `GET /api/commands` — retrieve queued commands

Authenticated API requests use `x-session-id`, `x-username`, and `x-session-token` headers. Keep the token private.
