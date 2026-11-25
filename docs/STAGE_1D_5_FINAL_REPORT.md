# Stage 1D.5 — Final Report

**Final status:** STAGE 1D.5 BOUNDED FRESH-SHELL RECONNECTION IMPLEMENTED — FULL BROWSER-TO-REAL-DOCKER END-TO-END VERIFICATION OUTSTANDING  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**T-11:** **OPEN — ACCEPTANCE REQUIRED**  
**T-13:** **OPEN — ACCEPTANCE REQUIRED**  
**T-27:** **OPEN — ACCEPTANCE REQUIRED**

No firewall integration, privileged helper, host firewall change, cloud/production deployment, production WSS/Redis/Origin configuration, or Stage 1B gate closure was performed. T-11, T-13, and T-27 remain open.

---

## 1. Outcome

Stage 1D.5 adds reliable, bounded recovery to the authenticated Stage 1D terminal without changing Stage 1C container lifecycle ownership.

Implemented:

- explicit controlled fresh-shell policy after Phase 0 verification that Docker exec streams cannot be reattached;
- bounded frontend recovery: four retries maximum, exponential backoff with jitter, one attempt at a time, per-attempt 10-second connect timeout;
- fresh ticket REST request and exact subprotocol WebSocket for every attempt;
- clear disconnected/reconnecting/failed states, preserved xterm scrollback, and an explicit new-shell warning after successful reconnection;
- stop conditions for terminal closure/unmount, instance stop, auth failure, ticket rejection, session expiry/revocation, shell exit, and retry exhaustion;
- stale-attempt tokens and timer cleanup so no stale async work creates a second socket;
- backend exec-exit cleanup fix preventing recursive self-cancellation;
- deterministic backend and frontend tests plus the four required Stage 1D.5 documents.

The previous HTTP workflow, terminal gateway, Docker exec/PTY adapter, xterm integration, message framing, resize validation, and disconnect semantics remain intact.

---

## 2. Why this is a fresh-shell policy

Phase 0 confirmed:

- `docker==7.1.0` has no API to reattach to an already-started exec stream;
- `exec_start(socket=True)` returns a transport-specific socket that the caller closes;
- this platform already closes that socket and releases the DB session on WebSocket disconnect;
- only the container, the Stage 1C instance, and local browser scrollback survive a disconnect.

Claiming seamless resume would be false. Stage 1D.5 therefore always starts a new shell after a bounded, reauthorized reconnect and warns the user that prior shell process state was lost. No output is replayed and no input is queued across the gap.

---

## 3. Backend changes

- `terminal/consumers.py`
  - `_cleanup()` now skips `asyncio.current_task()` when cancelling and joining tracked tasks. This fixes the recursive cancellation previously triggered when an exec exited inside `_output_sender()` and `_close_with()` called cleanup.
  - Disconnect still closes only the exec stream/session and never mutates container lifecycle.
- `terminal/tests/test_reconnect_policy.py` (new)
  - Nine deterministic mocked tests covering fresh-shell acquisition, old-ticket replay, expired authorization, owner binding, stopped instance, duplicate active session, abandoned session cleanup, exec exit, and no output/exec reuse or container creation.

Backend docs added under `ctf-platform-be/docs/`.

---

## 4. Frontend changes

- `src/services/terminalService.js`
  - Added `TERMINAL_RECONNECT`, deterministic `reconnectDelay()`, per-attempt timeout, retry state, attempt tokens, fresh-ticket requests, and reconnect callbacks.
  - Added explicit fatal/retryable close classification and connection-limit-safe bounded retries.
- `src/components/ui/InteractiveTerminal.jsx`
  - Added `reconnecting` phase, reconnect/notice UI, scrollback preservation, resize re-sync, and unavailable/auth stop handling.
- `src/styles/global.css`
  - Added reconnecting visual state.
- Frontend tests added:
  - `src/test/TerminalReconnect.test.jsx`;
  - `src/test/InteractiveTerminal.reconnect.test.jsx`.

Cross-stack docs added under `ctf-platform/docs/`.

---

## 5. Verification

- Backend: `check`, migration check, 57 terminal tests, 87 combined `challenge_runtime`+`terminal`, 137 `instances`+`config`+`challenges`, 490 remaining apps, 9 new reconnect tests, and the opt-in real Docker exec test all passed. Whole-tree `manage.py test` is not claimed clean because the pre-existing untracked `test_digest.py` fails. Full details and the intermittent pre-existing SQLite race note are in `STAGE_1D_5_TEST_EVIDENCE.md`.
- Frontend: `npm test -- --run` passed 4 files / 32 tests; `npm run build` passed with 2974 modules; challenge harness passed 124/124.
- Mocked backend/frontend suites are not browser E2E. The real Docker test covers the adapter directly. Full browser-to-real-Docker end-to-end verification remains outstanding.

---

## 6. Changed files

### Backend (`ctf-platform-be`)

1. `terminal/consumers.py` — modified (working tree file is untracked from earlier stages).
2. `terminal/tests/test_reconnect_policy.py` — new.
3. `docs/STAGE_1D_5_RECONNECTION_ARCHITECTURE.md` — new.
4. `docs/STAGE_1D_5_SESSION_RECOVERY_SECURITY.md` — new.
5. `docs/STAGE_1D_5_TEST_EVIDENCE.md` — new.
6. `docs/STAGE_1D_5_FINAL_REPORT.md` — new.

### Frontend (`ctf-platform`)

1. `src/services/terminalService.js` — modified (working tree file is untracked from Stage 1D.4).
2. `src/components/ui/InteractiveTerminal.jsx` — modified (working tree file is untracked from Stage 1D.4).
3. `src/styles/global.css` — modified.
4. `src/test/TerminalReconnect.test.jsx` — new.
5. `src/test/InteractiveTerminal.reconnect.test.jsx` — new.
6. `docs/STAGE_1D_5_RECONNECTION_ARCHITECTURE.md` — new.
7. `docs/STAGE_1D_5_SESSION_RECOVERY_SECURITY.md` — new.
8. `docs/STAGE_1D_5_TEST_EVIDENCE.md` — new.
9. `docs/STAGE_1D_5_FINAL_REPORT.md` — new.

No other files were intentionally changed. No migration, settings, package manifest, lockfile, Stage 1C lifecycle, container, firewall, or production configuration file was changed.

---

## 7. Git state

Recorded before Stage 1D.5 work:

- Backend HEAD `b3655841ffc0a0cea2cfd33ad56d7ed355a4d068`, branch `main`, modified `28`, staged `0`, untracked `782` expanded.
- Frontend HEAD `453cbe2b0a017dbd643ff6f77746f85f9965b8d7`, branch `main`, modified `37`, staged `0`, untracked `21` expanded.

Recorded after Stage 1D.5 work:

- Backend HEAD unchanged, branch `main`, modified `28`, staged `0`, untracked `787` expanded.
- Frontend HEAD unchanged, branch `main`, modified `35`, staged `0`, untracked `27` expanded.

No `git reset`, `git clean`, `git checkout`, destructive restore, `git add`, or `git commit` was performed. All pre-existing modified and untracked files were preserved.

---

## 8. Remaining limitations and next milestone

- Docker exec stream reattachment and output replay are intentionally unsupported.
- Production rollout still needs Redis channel layers, preferably PostgreSQL, WSS, and `FLAGHUNT_WS_ALLOWED_ORIGINS`.
- A full browser-to-real-Docker end-to-end verification remains a separate required milestone.
- T-11, T-13, and T-27 remain open; Stage 1B acceptance is not claimed.
