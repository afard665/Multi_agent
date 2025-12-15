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
- `ASK_API_KEY` (optional) if set, `/api/ask` requires `x-ask-key`
- `ADMIN_API_KEY` required for admin endpoints in production (agents/config/logs/memory/prompts)
- In local/dev (`NODE_ENV != production`), admin endpoints work without `ADMIN_API_KEY` by default.
- `ALLOW_INSECURE_ADMIN=true` (optional) forces admin access without a key (use with care)
- `AVALAI_API_KEY` (optional) used to call AvalAI
- `AVALAI_BASE_URL` (default https://api.avalai.ir/v1)
- `META_SUPERVISOR_MODEL` (optional) override the meta-supervisor model
- `ALLOW_REQUEST_LLM_OVERRIDES=true` (optional) enables `x-llm-api-key` / `x-llm-base-url` request overrides
- `ALLOW_PRIVATE_LLM_BASE_URLS=true` (optional) allows private/localhost base URLs (dev only)
- `CORS_ORIGINS` (optional) comma-separated allowlist (prod default denies if unset)
- `TRUST_PROXY` (optional) e.g. `1` when behind a proxy
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` (optional) tune `/api/ask` rate limiting

## Tests

```
npm test
```

## Persistence

Data is stored in `memory/` JSON files and `logs/runs.jsonl` with atomic writes to prevent corruption.
