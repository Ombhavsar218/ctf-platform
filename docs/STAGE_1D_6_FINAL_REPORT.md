# Stage 1D.6 — Final Report

**Final status:** **STAGE 1D.6 REAL BROWSER → DJANGO → WEBSOCKET → REAL DOCKER E2E VERIFIED**  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**T-11:** **OPEN — ACCEPTANCE REQUIRED**  
**T-13:** **OPEN — ACCEPTANCE REQUIRED**  
**T-27:** **OPEN — ACCEPTANCE REQUIRED**

The full local end-to-end path was exercised with a real headless browser, real Django/ASGI process, real WebSocket gateway, and real Docker container. The run completed with `status: passed`. This closes the full browser-to-real-Docker verification that was outstanding at the end of Stage 1D.5. It does not change the security gate, close any open ticket, authorize live firewall integration, or claim Stage 1B acceptance.

---

## 1. Outcome

Stage 1D.6 verified the already-implemented terminal stack end to end without changing application source, settings, migrations, package manifests, or container lifecycle ownership.

Verified in the final passing run:

- real browser authentication against a dedicated local fixture user;
- HTTP-mode terminal behavior unchanged (`connection_meta.type` remained `tcp`);
- terminal instance started into a disposable real Docker container and published as `RUNNING`;
- browser WebSocket connected with the ticket confined to the subprotocol;
- invalid Origin, replayed ticket, expired ticket, and non-owner access denied;
- exactly one active authorized exec session;
- real shell input/output, ordering, 50-line scrolling, and PTY resize confirmed inside the container;
- four bounded fresh-shell reconnects with a new ticket each time, preserved scrollback, explicit new-shell notice, and no false resume;
- recovery stopped after four retries with no fifth socket;
- container remained running on terminal close; sessions were released and repeated cleanup was safe;
- stop revoked sessions and denied further access;
- expiry removed the container and sessions;
- final Docker state contained only the nine pre-existing containers.

No new application behavior was introduced by this stage. The purpose was verification and evidence.

---

## 2. Method

A temporary Node/CDP driver launched the installed real Chrome against a dedicated local Vite frontend and Django/ASGI backend. The driver observed real page state, CDP WebSocket frames, Docker inspection output, and the dedicated DB session registry. A raw TCP WebSocket upgrade probe was used for handshake-level Origin/replay/expiry checks so close codes would not be confused with browser handshake failures.

The run used:

- a dedicated temporary SQLite database and fixtures;
- isolated loopback ports for backend and frontend;
- local-only CORS/CSRF/WS Origin overrides;
- `alpine:3.20` with no host mounts and no privileged mode;
- generated local-only credentials that were never written to evidence;
- no npm dependency, repository automation source change, or production service.

This method was recorded in `STAGE_1D_6_E2E_TEST_PLAN.md` before execution.

---

## 3. Verification summary

Detailed results are in `STAGE_1D_6_BROWSER_DOCKER_EVIDENCE.md`. Lifecycle ownership and cleanup are separated in `STAGE_1D_6_LIFECYCLE_VERIFICATION.md`.

| Area | Result |
| --- | --- |
| Browser/auth | PASS |
| HTTP-mode unchanged | PASS |
| Real Docker terminal start | PASS |
| WebSocket admission/security | PASS |
| Shell I/O and PTY resize | PASS |
| Bounded fresh-shell recovery | PASS |
| Retry exhaustion | PASS |
| Close/reopen cleanup | PASS |
| Stop/expiry cleanup | PASS |
| Regression suites | PASS for the targeted set |

Run window: `2026-11-19T11:10:40.479Z` → `2026-11-19T11:12:23.902Z`.

---

## 4. Regression checks

| Check | Result |
| --- | --- |
| `manage.py check` | No issues |
| `manage.py makemigrations --check --dry-run` | No changes detected |
| `manage.py test terminal -v 1` | 57 tests, OK |
| `manage.py test instances config challenges -v 1` | 137 tests, OK |
| Four frontend terminal test files via `npx vitest run` | 4 files / 32 tests passed |
| `npm run build` | Vite 5.4.21, 2974 modules transformed, success |
| `node scripts/challenges-harness/run.mjs` | 124/124 passed |

A whole-tree backend suite is not claimed clean: the known pre-existing untracked `test_digest.py` failure remains outside the targeted suites. The previously observed intermittent development-SQLite ticket race was not reproduced or claimed fixed; PostgreSQL remains a production prerequisite.

---

## 5. Scope boundaries

The following were explicitly not performed:

- no firewall, privileged helper, host firewall, cloud, or production work;
- no production WSS, Redis channel layer, or production Origin configuration;
- no Stage 1B acceptance or closure of T-11, T-13, or T-27;
- no application source, settings, migration, manifest, or lockfile change;
- no `git reset`, `git clean`, `git checkout`, destructive restore, `git add`, or `git commit`;
- no Docker prune or mutation of unrelated containers, networks, volumes, or images.

The only repository additions in this stage are documentation files under `ctf-platform/docs/`.

---

## 6. Git state

Recorded at Stage 1D.6 Phase 0 and unchanged at completion:

| Repository | HEAD | Branch | Modified | Staged | Untracked (expanded) |
| --- | --- | --- | --- | --- | --- |
| `ctf-platform-be` | `b3655841ffc0a0cea2cfd33ad56d7ed355a4d068` | `main` | 28 | 0 | 787 |
| `ctf-platform` | `453cbe2b0a017dbd643ff6f77746f85f9965b8d7` | `main` | 35 | 0 | 31 |

The frontend untracked count increased from 27 to 31 because of the four Stage 1D.6 documentation files:

- `docs/STAGE_1D_6_E2E_TEST_PLAN.md`
- `docs/STAGE_1D_6_BROWSER_DOCKER_EVIDENCE.md`
- `docs/STAGE_1D_6_LIFECYCLE_VERIFICATION.md`
- `docs/STAGE_1D_6_FINAL_REPORT.md`

All pre-existing modified and untracked files were preserved. No file was staged or committed.

---

## 7. Remaining limitations and next milestone

- Stage 1D.6 verifies a local disposable path only. Production rollout still needs Redis channel layers, preferably PostgreSQL, WSS, correct Origin allowlisting, and operational review.
- HTTP-mode `connection_meta` still exposes transport metadata (`type: 'tcp'`) and a container identifier; the pre-rollout decision on that field remains unresolved.
- Docker exec reattachment, output replay, and input queuing across a disconnect remain intentionally unsupported.
- T-11, T-13, and T-27 remain **OPEN — ACCEPTANCE REQUIRED**.
- Live firewall integration remains **NOT AUTHORIZED**.

**Security gate remains NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED.**
