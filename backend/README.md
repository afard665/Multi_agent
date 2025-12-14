# Multi-Agent Self-Improving Reasoning Platform - Backend

This backend implements the control-plane for the multi-agent reasoning system. It exposes REST APIs for asking questions, managing agents, viewing logs, and updating configuration.

## Running

```
cd backend
npm install
npm run dev # start in watch mode with ts-node
# or
npm run build && npm start
```

Environment variables:
- `PORT` (default 3001)
- `ADMIN_API_KEY` required for admin endpoints (agents/config/logs/memory/prompts)
- `ALLOW_INSECURE_ADMIN=true` (optional) allows admin endpoints without a key (local/dev only)
- `AVALAI_API_KEY` (optional) used to call AvalAI
- `AVALAI_BASE_URL` (default https://api.avalai.ir/v1)
- `META_SUPERVISOR_MODEL` (optional) override the meta-supervisor model

## Tests

```
npm test
```

## Persistence

Data is stored in `memory/` JSON files and `logs/runs.jsonl` with atomic writes to prevent corruption.
