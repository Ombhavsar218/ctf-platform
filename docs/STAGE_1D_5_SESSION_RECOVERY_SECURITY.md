# Stage 1D.5 — Session Recovery Security

**Date:** 2026-11-19  
**Status:** Bounded fresh-shell recovery implemented; browser-to-real-Docker E2E still outstanding  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

This stage did not authorize or perform firewall integration, privileged helpers, host firewall changes, cloud/production deployment, or Stage 1B acceptance.

---

## 1. Trust boundary

```text
Browser (untrusted)
  explicit Open Terminal, input, resize, close
        |
        v
REST ticket endpoint + authenticated API bearer token
        |
        v
Origin allowlist + exact subprotocol + single-use ticket
        |
        v
Server-side ownership / active instance / running container checks
        |
        v
DB-backed session limit + channel revocation + cleanup task
        |
        v
challenge_runtime/ Docker exec/PTY adapter (only boundary with Docker SDK)
```

The browser never supplies or receives a container ID, exec ID, endpoint, host path, command, user, ticket, or session-ownership record.

---

## 2. Why fresh shell instead of resume

The installed Docker SDK has no exec-stream reattach API. `exec_start(socket=True)` returns a socket that must be closed by the caller; closing it ends the stream. The existing consumer already closes that socket and releases the DB session on WebSocket disconnect.

Therefore Stage 1D.5 does **not** claim seamless resume. Recovery means a bounded, reauthorized, fresh shell with an explicit user-visible warning that previous shell process state was lost.

---

## 3. Ticket and ownership controls on every reconnect

| Risk | Control |
| --- | --- |
| Ticket replay after disconnect | Single-use atomic consume; `used_at` is set with a conditional UPDATE consumed in `terminal/models.py` |
| Expired reconnect authorization | 30-second default TTL checked at consume time; expired fetches are rejected |
| Non-owner ticket use | Ticket is bound to `user_id` and `instance_id`; `TerminalTicket.consume(token, user=...)` rejects mismatches |
| Stopped/expired instance reconnect | Ticket issue and WS admission recheck active/running/mode ownership; stopped or expired instances are rejected |
| Duplicate active shell | DB unique active-session limits reject a second connection with 4409 and do not call `open_terminal_session` |
| Concurrent reconnect storms | One attempt at a time, one retry timer, attempt-id tokens, bounded max retries |
| Stale connect attempt | 10-second per-attempt connect/shell-ready timeout closes the socket and releases the session |
| Abandoned session leak | Celery cleanup reaps stale tickets/sessions; existing watchdog/Beat coverage retained |
| Cross-worker race | DB conditional updates and channel revocation groups; no process-local authorization state |
| Cross-origin hijack | Exact http(s) Origin allowlist; ticket only in negotiated subprotocol, never URL or logs |

The WebSocket ticket is a bearer credential: possession is the authentication proof because browser JWTs are not part of the WS handshake. Raw tickets are unguessable, short-lived, single-use, never logged, and never persisted in plaintext. No cross-user identity claim is accepted from browser input.

---

## 4. Recovery-state privacy

- Previous shell output is not buffered server-side for replay.
- Browser scrollback remains in the xterm instance already rendered for that user; it is not transmitted back to the server.
- Input typed while disconnected is dropped, not queued into a later shell.
- On successful reconnect the user is explicitly told that a new shell was created and previous process state was lost.
- No terminal I/O, ticket, exec ID, container ID, or secret is logged by the reconnect implementation.

---

## 5. Stop conditions

Reconnect attempts stop permanently when:

- the terminal panel is closed or unmounted;
- the instance becomes stopped/expired or reports unavailable;
- the ticket API reports 401/403, `TERMINAL_NOT_AVAILABLE`, or `TERMINAL_DISABLED`;
- the WebSocket reports 4401, 4403, 4003, 4400, or 1000;
- the shell exits normally with 4000;
- the retry limit is exhausted (four retries with backoff and jitter);
- a reconnect attempt does not reach `status:connected` within 10 seconds and no attempts remain.

Session-limit (4409) and transient network/ticket failures remain retryable only within the bounded limit.

---

## 6. Production caveats

- SQLite and the in-memory channel layer used by tests are development-oriented. Public rollout still requires Redis channel layers and preferably PostgreSQL for reliable shared coordination.
- Production WSS, `FLAGHUNT_WS_ALLOWED_ORIGINS`, and Redis/Origin configuration remain outstanding.
- Full browser-to-real-Docker end-to-end verification has not been claimed. Mocked backend/frontend suites and a separate real Docker exec adapter test were run.
