# Stage 1D.5 — Reconnection and Session Recovery Architecture

**Date:** 2026-11-19  
**Status:** STAGE 1D.5 BOUNDED FRESH-SHELL RECONNECTION IMPLEMENTED — FULL BROWSER-TO-REAL-DOCKER END-TO-END VERIFICATION OUTSTANDING  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

No live firewall integration, privileged helper, host firewall change, cloud/production deployment, production WSS/Redis/Origin configuration, or Stage 1B gate closure was performed.

---

## 1. Phase 0 verification and chosen policy

### 1.1 What the installed Docker SDK actually supports

- `docker==7.1.0`, Engine `29.6.1`, `BASE_URL http+docker://localnpipe`.
- `exec_start(socket=True)` returns a transport-specific socket (`NpipeSocket` in the verified environment).
- The SDK exposes `exec_start`, `exec_inspect`, `exec_resize`, and `exec_kill`. It exposes **no reattach/reconnect API** for an already-started exec stream.
- `exec_start()` starts the exec and returns a new hijacked connection; the caller must close it when done. Closing that socket ends the interactive stream.

### 1.2 What this platform actually does today

- On WebSocket disconnect the consumer calls `_cleanup()`, which:
  - closes only that exec stream through `challenge_runtime/`;
  - releases the DB-backed `TerminalSession`;
  - never calls `InstanceService.stop()`, `expire()`, `DockerAdapter.stop_container()`, or `remove_container()`.
- The consumed ticket remains single-use and cannot be replayed.
- The container and Stage 1C instance remain running.
- The browser keeps xterm scrollback only in memory; the backend does not buffer or replay terminal output.

### 1.3 Explicit Stage 1D.5 policy

**Controlled fresh-shell reconnection.**

- A dropped shell is never claimed to be resumed.
- Every reconnect requests a **fresh authorized ticket** from the existing REST endpoint.
- Every successful reconnect opens a **new WebSocket** and the backend starts a **new fixed `/bin/sh` exec/PTY**.
- The terminal explicitly prints: `Connection restored with a new shell. Previous shell process state was lost.`
- There is **no server-side reconnection grace period** beyond the 30-second ticket TTL and existing stale-session cleanup.
- There is **no output replay** from the previous shell. Browser scrollback is preserved locally where possible.
- Reconnects are bounded: at most four attempts per terminal panel, exponential backoff with jitter, one attempt at a time, and a 10-second connect/shell-ready timeout per attempt.
- Retrying stops after terminal closure, instance stop, auth failure, ticket rejection, session expiry/revocation, shell exit, or retry exhaustion.

This is the safest supported behavior because reattachment is not available and a closed Docker exec socket must not be treated as recoverable.

---

## 2. Reconnection sequence

```text
Established session
  -> network interruption / abnormal WebSocket close
  -> frontend marks phase=reconnecting, preserves xterm scrollback
  -> waits bounded exponential backoff with jitter
  -> POST /api/v1/challenges/instances/terminal-ticket/  (fresh single-use ticket)
  -> new WebSocket(derived ws/wss URL, ['flaghunt-terminal-v1', freshTicket])
  -> backend rechecks Origin, ticket, ownership, active/running instance, limits
  -> backend opens a NEW Docker exec/PTY and sends status:connected
  -> frontend writes explicit "new shell" notice and resumes live I/O only now
```

Input typed while disconnected is not queued and is never replayed into the new shell. The replacement shell receives the current validated terminal dimensions.

---

## 3. Backend responsibilities

Reused from Stages 1D.2–1D.4, unchanged except for one cleanup safety fix:

- exact Origin allowlist and exact subprotocol negotiation;
- ticket stored as SHA-256 hash, consumed atomically with a conditional update;
- ticket bound to user, instance, expiry, and single use;
- server-side resolution of user/instance/container; no browser-supplied IDs;
- active/running/mode/ownership recheck on ticket issue and WebSocket admission;
- DB-backed unique active-session limits (`TERMINAL_MAX_SESSIONS_PER_USER`, `TERMINAL_MAX_SESSIONS_PER_INSTANCE`);
- channel-layer revocation groups for cross-worker lifecycle invalidation;
- Celery stale-state cleanup for abandoned tickets/sessions;
- disconnect cleanup closes only the exec stream and session.

### 3.1 Exec-exit cleanup fix

`terminal/consumers.py` `_cleanup()` previously cancelled and gathered every tracked task, including `_output_sender()` when `_close_with()` was awaited from inside `_output_sender()` after an exec exit. That could recursively cancel the caller's own cancellation chain. Cleanup now skips `asyncio.current_task()` and only joins the other tasks. This is a lifecycle correctness fix, not a reattachment mechanism.

---

## 4. Frontend responsibilities

- `TerminalConnection` owns one terminal connection and all bounded retry state.
- Retry state is per component instance and is cancelled on unmount, explicit Close, instance stop, auth failure, session expiry/revocation, shell exit, or exhaustion.
- `_attemptId` tokens prevent stale ticket requests and timers from creating a second WebSocket.
- The WebSocket is constructed only after a fresh ticket passes the exact contract; no ticket is placed in a URL, stored, or logged.
- `isConnected` is true only after `status:connected`; opening a transport alone never displays a false connected state.
- Each new stream gets a fresh decoder so a partial UTF-8 sequence from a dropped PTY cannot corrupt the new shell's output.
- `InteractiveTerminal` preserves xterm scrollback, resets resize deduplication for the new shell, and shows `Connecting`, `Starting shell`, `Reconnecting`, `Connected`, `Disconnected`, or `Failed` explicitly.

---

## 5. Shared multi-worker coordination

No process-local state decides ownership, session uniqueness, or lifecycle validity.

- DB rows and atomic conditional updates are the source of truth for tickets and sessions.
- Channel-layer groups propagate instance revocation between workers.
- Celery/Beat cleanup reaps abandoned tickets and sessions.
- The frontend retry counter and token buckets are local protections only; they do not grant authorization or create sessions.

---

## 6. Explicit non-goals

- No Docker exec stream reattachment or output replay.
- No new container, no automatic container restart, and no container shutdown on terminal disconnect.
- No server-side persistent scrollback.
- No browser-visible container ID, exec ID, command, user, host path, endpoint, ticket, or session ownership.
- No firewall, privileged helper, cloud, production WSS/Redis, or Stage 1B closure work.
