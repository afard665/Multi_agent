## Task backlog (generated from review)

### P0 — Security / repo hygiene
- [ ] Rotate/revoke any leaked provider keys (manual, outside git).
- [ ] Purge leaked secrets from git history (manual: `git filter-repo`/BFG).
- [x] Remove tracked runtime data from git: `backend/memory/*.json`, `backend/logs/*.jsonl`.
- [x] Add example configs: `backend/memory/*.example.json` (no secrets).
- [x] Seed default agents when `agents.json` missing.
- [x] Gate user-supplied LLM override headers behind env flags.
- [x] Optional `/api/ask` auth via `ASK_API_KEY` + `x-ask-key`.

### P0 — Live trace / correctness
- [x] Make streaming truly live: return immediately on `stream=true` and stream iterations over WS.
- [x] Add WS replay buffer so late subscribers can catch up.
- [x] Add run cancellation (token-based) and wire “Stop streaming” to it.
- [x] Make cancellation abort in-flight provider calls (best-effort via AbortController).

### P1 — Correctness / cost & limits
- [x] Record `CandidateResponse.cost` as per-call cost (not cumulative agent total).
- [x] Enforce `maxTokens`/`max_tokens` by passing to provider calls.

### P1 — UX / Admin gating
- [x] Show clear “Admin key required” states for admin-only pages (Agents/Logs/Tokens/Insights).
- [x] Avoid silent failures in stores; show actionable errors.
- [x] Update `.vscode/launch.json` to the Vite port (5173).
- [x] Add docs (RAG) management UI.

### P2 — Product completeness
- [x] Add UI for prompt versions + rollback in Agents (uses existing backend endpoints).
- [ ] Add UI for managing RAG docs (optional). (moved to P1 above)
- [ ] Add RTL/i18n pass (optional).

## Manual steps (outside this PR)

### Rotate/revoke leaked keys
- Revoke/rotate any keys that were ever committed (provider dashboards).

### Purge secrets from git history
- Recommended: `git filter-repo --path backend/memory/config.json --invert-paths` (repeat for any secret files), then force-push.
- Alternative: BFG Repo-Cleaner.


### P1 — CI
- [x] Fix GitHub Actions to run build/test (not `dev`).

### P1 — Ops hardening (dev→prod)
- [x] CORS allowlist via env.
- [x] Better rate limiting (trust proxy, cleanup).
- [x] Scale logs access (streaming read / limit).
