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
- `ADMIN_API_KEY` protects admin actions
- `AVALAI_API_KEY` optional for AvalAI
- `AVALAI_BASE_URL` override endpoint

### Live trace (WebSocket)
The backend exposes a WebSocket server at `ws://localhost:3001/ws`.

To request a live trace stream, POST `/api/ask` with `{ "question": "...", "stream": true }`. The response includes:
- `runId`
- `liveTrace.wsUrl`
- `liveTrace.runId`

The frontend uses this to subscribe and append `iteration` events into `reasoningTrace`.

You can override the advertised WebSocket URL with `LIVE_TRACE_WS_URL`.

## Running Frontend
```
cd frontend
npm install
npm run dev
```

## Learning + Memory
- Question history and agent performance stored in `backend/memory/meta-memory.json`.
- Prompt versions stored in `backend/memory/prompt-store.json` with rollback support.
- Runs logged in `backend/logs/runs.jsonl`.

## Adding Agents
Use the dashboard Agents page or POST `/api/agents` with admin key. Agents are persisted in `backend/memory/agents.json`.

## Prompt Evolution
Meta-supervisor can propose updates recorded in the prompt store. You can inspect versions via UI and rollback.

## Cost Tracking
Token usage and costs accounted by provider. Rates configurable in `backend/memory/config.json` or via `/api/config`.

## Troubleshooting
- Ensure backend reachable at 3001 for frontend proxy.
- Missing AvalAI key triggers mock responses for development.