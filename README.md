# Self-Evolving Multi-Agent Intelligence Platform

Full-stack implementation of a multi-agent debate system with prompt evolution and cost tracking.

## Structure
- `backend/` Node.js + TypeScript Express API
- `frontend/` React + Vite dashboard

## Running Backend
```
cd backend
npm install
npm run dev
```
Set environment variables as needed:
- `PORT` (default 3001)
- `ASK_API_KEY` (optional) if set, `/api/ask` requires `x-ask-key`
- `ADMIN_API_KEY` required for admin actions (agents/config/logs/memory/prompts)
- In local/dev (`NODE_ENV != production`), admin endpoints work without `ADMIN_API_KEY` by default.
- `ALLOW_INSECURE_ADMIN=true` (optional) forces admin access without a key (use with care)
- `SIMPLE_AUTH_ENABLED=true` (optional) allows `Authorization: Basic` auth (enabled by default in non-production)
- `SIMPLE_AUTH_USER` / `SIMPLE_AUTH_PASSWORD` (optional) override Basic auth creds (defaults: `admin` / `amin@1005`)
- `AVALAI_API_KEY` optional for AvalAI
- `AVALAI_BASE_URL` override endpoint
- `META_SUPERVISOR_MODEL` (optional) override the meta-supervisor model
- `ALLOW_REQUEST_LLM_OVERRIDES=true` (optional) enables `x-llm-api-key` / `x-llm-base-url` request overrides
- `ALLOW_PRIVATE_LLM_BASE_URLS=true` (optional) allows private/localhost base URLs (dev only)
- `CORS_ORIGINS` (optional) comma-separated allowlist (prod default denies if unset)
- `TRUST_PROXY` (optional) e.g. `1` when behind a proxy
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` (optional) tune `/api/ask` replay rate limiting

### Live trace (WebSocket)
The backend exposes a WebSocket server at `ws://localhost:3001/ws`.

To request a live trace stream, POST `/api/ask` with `{ "question": "...", "stream": true }`. The response includes:
- `runId`
- `liveTrace.wsUrl`
- `liveTrace.runId`
- `liveTrace.cancelToken` (used to cancel a running stream)

The frontend uses this to subscribe and append `iteration` events into `reasoningTrace`.

You can override the advertised WebSocket URL with `LIVE_TRACE_WS_URL`.

## Running Frontend
```
cd frontend
npm install
npm run dev
```

## Learning + Memory
- Runtime data is stored in `backend/memory/*.json` (gitignored).
- Runs are logged in `backend/logs/runs.jsonl` (gitignored).
- Example seed files are in `backend/memory/*.example.json`.

## Adding Agents
Use the dashboard Agents page or POST `/api/agents` with admin key. Agents are persisted in `backend/memory/agents.json` (runtime).

## Prompt Evolution
Meta-supervisor can propose updates recorded in the prompt store. You can inspect versions via UI and rollback.

## Cost Tracking
Token usage and costs accounted by provider. Rates configurable in `backend/memory/config.json` or via `/api/config`.

## Troubleshooting
- Ensure backend reachable at 3001 for frontend proxy.
- Missing AvalAI key triggers mock responses for development.
