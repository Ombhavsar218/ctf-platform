# Stage 1D.6 — Browser/Docker E2E Evidence

**Date:** 2026-11-19  
**Run window (UTC):** 2026-11-19T11:10:40.479Z → 2026-11-19T11:12:23.902Z  
**Result:** **PASSED** — real headless Chrome → Django/ASGI → WebSocket gateway → real Docker container terminal workflow completed.  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

No firewall, privileged helper, host firewall, cloud/production deployment, production WSS/Redis/Origin configuration, or Stage 1B acceptance was performed.

---

## 1. Run environment and isolation

| Item | Verified value / scope |
| --- | --- |
| Browser | Real headless Google Chrome `158.0.8127.36`, driven through Chrome DevTools Protocol by a temporary Node driver. |
| Node | `v24.13.1`; built-in `WebSocket` only; no npm dependency, manifest, lockfile, or repository source change for automation. |
| Backend | Django/ASGI on an isolated loopback port; dedicated temporary SQLite database; dedicated fixtures and generated local-only credentials. |
| Frontend | Vite `5.4.21` on an isolated loopback port with local-only API override. |
| Docker | Client/Engine `29.6.1`; disposable `alpine:3.20` terminal challenge image. |
| Challenge spec | `/bin/sh`; no host mounts; no privileged mode; read-only root filesystem; bounded CPU/memory/pids. |
| Authorization | Exact Origin allowlist and single-use tickets carried only in the terminal WebSocket subprotocol. |
| Pre-existing state | Nine pre-existing containers were present before and after the run. No prune, reset, or broad cleanup was performed. |

All test-side credentials, ticket values, exec identifiers, and container identifiers were kept out of this document and out of the committed evidence. Only non-sensitive fixture identifiers are recorded.

---

## 2. Verified workflow

| Phase | Check | Observed result | Evidence step |
| --- | --- | --- | --- |
| 2 | Real browser authentication with dedicated user | Browser authenticated as `stage1d6_user_1d6run1` | `browser authenticated as dedicated test user` |
| 2 | HTTP-mode challenge remains unchanged | `connection_meta.type` remained `tcp`; HTTP-mode instance started and stopped cleanly | `HTTP-mode instance behavior unchanged`, `HTTP-mode test instance stopped` |
| 2 | Terminal instance created against real Docker | Instance reached `RUNNING`; container inspected as `Up 1 second` | `terminal instance RUNNING with real Docker container` |
| 2 | Explicit terminal open from browser | Browser WebSocket terminal reached connected state | `browser WebSocket terminal connected` |
| 3 | Ticket confinement | Ticket appeared only in `flaghunt-terminal-v1` subprotocol; WebSocket URL contained no ticket | `ticket travels only in subprotocol, not URL` |
| 3 | Single active exec | Exactly one active terminal session in the DB registry | `exactly one authorized exec session created` |
| 4 | Shell input/output | `whoami` → `root`, `pwd` → `/`, marker echo produced its output; ordering preserved | `shell input/output and ordering verified` |
| 4 | Scrollback rendering | After `seq 1 50`, the latest line was visible and the first line had scrolled out | `terminal scrolling verified` |
| 4 | PTY resize | Browser viewport resize propagated to the container; Docker `stty size` reported `24 81` | `PTY resize verified by Docker stty size` |
| 5 | Bounded recovery | Four successful fresh-shell reconnects, each with a new ticket; no replayed exec or output | `first reconnect created fresh shell with new ticket`, `reconnect attempt 2/3/4 used fresh ticket` |
| 5 | Retry exhaustion | A further disconnect produced no fifth socket; recovery stopped after the configured maximum of four | `retry exhaustion stops after max 4 attempts` |
| 6 | Terminal close | Container remained running while the exec session was released and active-session count returned to zero | `terminal close leaves container running and sessions closed` |
| 6 | Framing validation | Malformed and out-of-range resize frames were rejected with `invalid_dimensions` | `malformed and out-of-range resize frames rejected` |
| 6 | Repeated cleanup | Reopen/close cycle created only the expected session and cleaned it up again | `repeated terminal cleanup is safe` |
| 6 | Stop lifecycle | Stop revoked open sessions and denied subsequent ticket issuance | `stop revoked sessions and denied further terminal access` |
| 6 | Expiry lifecycle | Instance expiry removed the container and closed all sessions | `instance expiry cleaned up container and sessions` |
| 7 | Completion | Full workflow ended with no E2E container left; nine pre-existing containers unchanged | `E2E workflow completed` |

The run is recorded as `status: passed` in the temporary `evidence.json`.

---

## 3. Authorization and anti-replay probes

These probes were run after the main terminal was closed so the single-active-session rule could not mask ticket behavior.

| Probe | Observed result | Interpretation |
| --- | --- | --- |
| Invalid `Origin` in raw WebSocket upgrade | HTTP handshake status `403` | Exact Origin allowlist rejected the request before ticket consumption. |
| Replay of an already-used ticket | HTTP handshake status `403` | Ticket is single-use; the second admission attempt failed. |
| Ticket probed after its TTL | HTTP handshake status `403` | Expired tickets are not accepted. |
| Ticket request by a different user | HTTP `400` | Non-owner was denied; no session or container was created for that user. |
| Ticket in WebSocket URL | Absent | Ticket transport remained confined to the subprotocol. |
| Active exec sessions after connect | `1` | Duplicate-access guard held during the authenticated session. |

No raw ticket, hash, or auth header value is reproduced here. The evidence records only that the ticket length was `43` characters and that a hash comparison changed between recovery attempts.

---

## 4. Fresh-shell recovery details

The recovery policy was verified end to end:

- A synthetic network drop caused the browser service to request a new ticket and open a fresh WebSocket.
- Each of the four allowed attempts used a different ticket hash and produced a new exec session rather than reattaching to the previous stream.
- The terminal preserved prior xterm scrollback, including the pre-drop marker `FLAGHUNT_SCROLLBACK_MARKER`.
- The explicit notice **`Connection restored with a new shell. Previous shell process state was lost.`** was rendered after the successful reconnect.
- A shell variable exported before the drop was absent afterward: `echo state=[$FLAGHUNT_E2E_STATE]` produced `state=[]`, confirming no false resume.
- A fifth disconnect caused no new socket and no new exec; the UI stopped retrying at four attempts.
- No reconnect created a container. Container lifecycle stayed with the Stage 1C instance lifecycle.

This closes the full browser-to-real-Docker verification that was outstanding after Stage 1D.5. It does not change the documented limitation that exec streams cannot be reattached and prior process state cannot be restored.

---

## 5. Lifecycle and cleanup observations

- Terminal close left the challenge container running; only the exec/session was torn down.
- Reopening the terminal created a fresh session on the same running container.
- Repeated close released the session again; active-session count remained zero between sessions.
- Stopping the instance revoked sessions and denied a subsequent ticket request with HTTP `400`.
- Expiring the instance removed the container and left no active sessions.
- Final Docker inspection showed the same nine pre-existing containers and no container belonging to the E2E run.
- No Docker prune, network removal, volume removal, image removal, or unrelated container mutation was performed.

---

## 6. Focused regression results

All focused suites were rerun after the E2E workflow.

| Area | Command / check | Result |
| --- | --- | --- |
| Backend config | `manage.py check` | `System check identified no issues (0 silenced).` |
| Backend migrations | `manage.py makemigrations --check --dry-run` | `No changes detected` |
| Backend terminal | `manage.py test terminal -v 1` | `Ran 57 tests ... OK` |
| Backend supporting apps | `manage.py test instances config challenges -v 1` | `Ran 137 tests ... OK` |
| Frontend terminal suites | `npx vitest run` on the four terminal/test files | `4 passed` files, `32 passed` tests |
| Frontend build | `npm run build` | Vite `5.4.21`, `2974 modules transformed`, built successfully in about 1 minute |
| Challenge harness | `node scripts/challenges-harness/run.mjs` | `124/124 passed` |

A whole-tree backend suite is not claimed clean: the pre-existing untracked top-level `test_digest.py` failure recorded in Stage 1D.5 remains outside these targeted suites. The intermittent development-SQLite ticket race noted previously was not treated as a production claim; PostgreSQL remains a production prerequisite.

---

## 7. Evidence artifacts

The following non-committed artifacts were retained in the dedicated temp run directory for audit within this session:

- `evidence.json` — machine-readable step log with final `status: passed`;
- `e2e-console.log` — final driver output;
- `daphne.log`, `vite.log` — local-only service logs;
- `backend-terminal-tests.log`, `backend-supporting-tests.log` — backend regression output;
- `frontend-tests.log`, `frontend-build.log`, `challenge-harness.log` — frontend/harness output;
- `debug-command.json`, `debug-exhaust.json` — transient diagnostic snapshots from earlier failed iterations.

No committed document contains credentials, raw tickets, exec IDs, container IDs, or host paths.

---

## 8. Interpretation limits

- This is a local, loopback, disposable Docker verification. It is not a production deployment test.
- CORS/CSRF/WebSocket Origin overrides were local-only; production WSS, Redis channel layers, and Origin configuration are still required before rollout.
- HTTP-mode `connection_meta` still exposes transport metadata (`type: 'tcp'`) and a container identifier; the pre-rollout decision on that field remains unresolved.
- Mocked backend/frontend suites and the harness are regression evidence only; they do not replace this real browser/real Docker run.
- T-11, T-13, and T-27 remain open, and Stage 1B acceptance is not claimed.
