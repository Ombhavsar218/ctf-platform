# Stage 1D.6 — E2E Test Plan

**Date:** 2026-11-19  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

Verification-focused stage. No firewall, privileged helper, host firewall, cloud/production deployment, production WSS/Redis/Origin configuration, or Stage 1B acceptance is authorized.

---

## 1. Phase 0 findings

### 1.1 Git baseline

| Repository | HEAD | Branch | Modified | Staged | Untracked (expanded) |
| --- | --- | --- | --- | --- | --- |
| `ctf-platform-be` | `b3655841ffc0a0cea2cfd33ad56d7ed355a4d068` | `main` | 28 | 0 | 787 |
| `ctf-platform` | `453cbe2b0a017dbd643ff6f77746f85f9965b8d7` | `main` | 35 | 0 | 27 |

All pre-existing working-tree state will be preserved. No destructive Git operation, staging, or commit is planned.

### 1.2 Docker and browser

- Docker Client/Engine `29.6.1`, Linux/amd64, overlayfs.
- Pre-existing containers/networks belong to other projects and will not be touched.
- `alpine:3.20` image is already present locally and is the planned disposable terminal image.
- Google Chrome `158.0.8127.36` is installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Node `v24.13.1` is installed.
- No Playwright, Puppeteer, Selenium, or browser automation package is installed in either repository.

### 1.3 Expanded scope — documented before changes

Because no browser driver package is installed, this stage will use a **temporary Node.js Chrome DevTools Protocol (CDP) driver** launched from the approved temp directory `C:\Users\bhavs\AppData\Local\Temp\opencode\stage1d6-e2e\`. It uses Node 24's built-in `WebSocket` and the installed real Chrome. No npm dependency, package manifest, lockfile, or repository source change is required for automation.

A dedicated temporary SQLite database and Chrome user-data directory will also be created under that temp directory. The existing local development database and Chrome profile are not used.

### 1.4 Existing services

Ports already in use by unrelated work: `8000` (another Python `manage.py runserver`), `5173` (another project's Vite), `6379`, `8080`. The E2E stack will therefore use isolated local ports:

- backend/Daphne: `127.0.0.1:18000`
- frontend/Vite: `127.0.0.1:15173`

### 1.5 Implementation inspection summary

- Stage 1C: real Docker lifecycle owned by `instances/` → `challenge_runtime/`; container is created only after DB reservation and published as RUNNING only after Docker inspection.
- Stage 1D.2: exact Origin allowlist, single-use hashed tickets in subprotocol, DB session registry, channel-layer revocation, cleanup task.
- Stage 1D.3: `exec_start(socket=True)` wrapped by `ExecSession`; fixed `/bin/sh`; Docker SDK access confined to `challenge_runtime/`.
- Stage 1D.4: xterm.js panel, exact JSON/base64 framing, derived WS URL from `VITE_API_BASE_URL`.
- Stage 1D.5: bounded fresh-shell reconnect; no replay; explicit new-shell notice; self-cancel cleanup fix.
- `config/asgi.py` routes HTTP through Django ASGI and WebSocket through `terminal.routing.websocket_urlpatterns`.
- Default CORS/WS allowlists do not include the E2E frontend port, so local-only environment overrides will provide `http://127.0.0.1:15173`. This is not a production configuration.

---

## 2. Safe disposable setup

1. Create temp run directory with a unique run id.
2. Create a fresh SQLite DB via `manage.py migrate` using `DB_NAME` pointed at the temp DB.
3. Create one dedicated test user and one published terminal-mode challenge using generated identifiers; never print or store the password in evidence.
4. Configure the challenge with `alpine:3.20`, `["/bin/sh", "-c", "sleep 3600"]`, terminal access mode, small CPU/memory/pids limits, read-only root filesystem, no host mounts, no privileged mode.
5. Start Daphne and Vite with isolated ports and local-only env overrides.
6. Record Docker resources before and after; clean up only objects carrying the unique E2E run id.

---

## 3. Verification matrix

| Phase | Checks |
| --- | --- |
| 2 | Real browser login; challenge page; Start Instance; Docker container exists; ownership; RUNNING after inspection; explicit Open Terminal; HTTP-mode challenge unchanged. |
| 3 | REST ticket issuance; subprotocol handshake; ticket absent from URL; invalid Origin rejected; replay/expired rejected; cross-user denial; exactly one exec. |
| 4 | Prompt, `whoami`, `pwd`, `echo FLAGHUNT_E2E_OK`, ordering, scrolling, resize acceptance, malformed/out-of-range resize rejection. |
| 5 | Temporary shell state; simulated network drop; bounded retries; fresh tickets; new shell; process-state-lost notice; scrollback preserved; stop conditions; no duplicate execs. |
| 6 | Close leaves container running; idempotent cleanup; stop/expiry close sessions; no reconnect-created container; no stale sessions; Stage 1C lifecycle ownership. |
| 7 | Focused backend/frontend/harness regressions; distinguish pre-existing failures. |

---

## 4. Evidence and limits

Evidence will record browser/version, frontend/backend config, Docker engine/image, non-sensitive test identifiers, actual commands and observed output, WebSocket/reconnect results, cleanup results, and test results. No credentials, ticket values, secrets, or sensitive session data will be recorded.

Mocked tests or builds alone do not satisfy this stage. If any real component is unavailable or a required check cannot be performed, the stage will be reported BLOCKED or PARTIALLY VERIFIED rather than complete.
