# Stage 1D.6 — Lifecycle Verification

**Date:** 2026-11-19  
**Scope:** Real browser → Django/ASGI → WebSocket gateway → real Docker disposable terminal lifecycle.  
**Result:** **VERIFIED** for the local E2E path described in `STAGE_1D_6_BROWSER_DOCKER_EVIDENCE.md`.  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

This document separates container lifecycle ownership from terminal exec-session lifecycle. The verified policy is unchanged from Stage 1C/1D: instances own containers; terminal connections only acquire and release exec sessions against an already-running container.

---

## 1. Baseline and setup

| Check | Result |
| --- | --- |
| Docker state before run | Nine pre-existing containers, none belonging to this E2E run. |
| Dedicated fixtures | One dedicated test user, one terminal-mode challenge, one HTTP-mode challenge, all in a dedicated temporary SQLite database. |
| Terminal image | `alpine:3.20`, already available locally; no image pull was required. |
| Container spec | `/bin/sh`; read-only root filesystem; bounded CPU/memory/pids; no host mounts; no privileged mode. |
| Local services | Isolated loopback ports were used for Django/ASGI and Vite; no production service was touched. |
| Automation | Temporary Node/CDP driver in the approved temp directory; no repository package or source change. |

---

## 2. Container lifecycle

| Event | Container state | Session state | Verified outcome |
| --- | --- | --- | --- |
| HTTP-mode instance start/stop | Disposable HTTP container created then stopped by the instance lifecycle | No terminal exec session | `connection_meta.type` stayed `tcp`; HTTP behavior unchanged. |
| Terminal instance start | Container created and inspected as `Up 1 second`; instance published as `RUNNING` | No exec until explicit terminal open | Stage 1C ownership preserved. |
| Terminal open | Container unchanged | One active exec session | Exactly one authorized session existed. |
| Simulated disconnect × 4 | Container unchanged | Old session released; new session acquired per attempt | Four fresh shells on the same container; no new container. |
| Retry exhaustion | Container unchanged | No further session after the fourth allowed reconnect | Recovery stopped; no fifth socket. |
| Terminal close | Container remained running | Session released; active-session count `0` | Confirmed by DB state and Docker inspection. |
| Reopen/close | Same container reused | Session created then released again | Repeated cleanup was safe and idempotent. |
| Instance stop | Instance stopped | Sessions revoked; ticket denied | Subsequent terminal access returned HTTP denial. |
| Instance expiry | Container removed by instance lifecycle | Sessions closed | Expiry cleanup completed; no stale session remained. |
| Final inspection | Nine pre-existing containers; zero E2E containers | No active E2E sessions | No prune, reset, or unrelated Docker mutation. |

**Conclusion:** The terminal path never started, stopped, removed, or recreated the challenge container. Container lifecycle remained exclusively inside the Stage 1C instance lifecycle.

---

## 3. Exec-session lifecycle

| Transition | Verified behavior |
| --- | --- |
| Ticket issuance | REST ticket issued with a five-second TTL; ticket carried only in the WebSocket subprotocol. |
| Admission | Origin allowlist enforced at handshake; invalid Origin rejected with `403`. |
| Authorization | Owner binding enforced; a non-owner ticket request was denied. |
| Single-use | Replay of a consumed ticket rejected with `403`. |
| Expiry | Ticket probed after TTL rejected with `403`. |
| Exclusivity | Exactly one active exec session per instance while connected. |
| Disconnect | Old stream closed and DB session released; no reattach or output replay was attempted. |
| Reconnect | New ticket, new WebSocket, new exec; ticket hash changed on every allowed attempt. |
| Exhaustion | No new socket after four retries; no stale active session remained. |
| Stop | Open sessions revoked and further access denied. |
| Expiry | Session registry returned to zero active sessions. |

The temporary DB session registry and the browser-visible state agreed at each checkpoint. No duplicate exec was observed.

---

## 4. Fresh-shell recovery invariants

The following Stage 1D.5 invariants were verified in the real stack:

1. **Bounded retries** — four successful reconnects; a fifth disconnect produced no new attempt.
2. **Fresh ticket per attempt** — every reconnect used a different ticket hash.
3. **No false resume** — the explicit new-shell notice was rendered; a pre-drop shell variable was absent afterward (`state=[]`).
4. **Scrollback preservation** — the pre-drop marker remained visible in xterm after reconnect.
5. **No exec reuse** — each successful reconnect created a new exec session; no old output was replayed.
6. **No container creation by recovery** — the container existed before the first terminal connection and was not recreated during recovery.
7. **Stop conditions** — intentional close, retry exhaustion, stop, and expiry all stopped or invalidated recovery.

---

## 5. Framing and PTY validation

- Valid resize from the browser was propagated to the container and confirmed by Docker `stty size` as `24 81`.
- Malformed dimensions (`rows: 1`, `cols: 9999`) and a non-numeric row value were rejected with `invalid_dimensions`.
- That rejection probe was executed on a fresh session after recovery exhaustion so it would not interfere with the active-shell input checks.
- Shell input/output remained ordered across `whoami`, `pwd`, marker echo, and a 50-line scroll test.

---

## 6. Safety and non-mutation record

- No firewall, privileged helper, or host firewall change was made.
- No cloud/production resource, production WSS/Redis/Origin, or Stage 1B acceptance activity occurred.
- No `git reset`, `git clean`, `git checkout`, destructive restore, `git add`, or `git commit` was performed.
- No Docker prune, image removal, network removal, volume removal, or unrelated container mutation was performed.
- Only the three new Stage 1D.6 documents in `ctf-platform/docs/` were added by this stage; the pre-existing Stage 1D.6 test plan was not further modified.

---

## 7. Conclusion

The real-stack lifecycle is verified for this disposable local configuration:

- **Container lifecycle:** owned by Stage 1C instance start/stop/expiry.
- **Exec lifecycle:** owned by the WebSocket terminal session and released on close/disconnect/stop/expiry.
- **Recovery lifecycle:** bounded, reauthorized, fresh-shell only, with no false resume.
- **Final state:** no E2E container or active E2E session remained; all pre-existing Docker resources were preserved.

This verification does not authorize production rollout. Security gate remains **NOT READY**, and T-11, T-13, and T-27 remain open.
