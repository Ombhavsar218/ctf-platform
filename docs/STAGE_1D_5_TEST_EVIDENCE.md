# Stage 1D.5 — Test Evidence

**Date:** 2026-11-19  
**Status:** Deterministic Stage 1D.5 tests added and passing. This is not a browser-to-real-Docker E2E claim.  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

---

## 1. Commands and results

### Backend

All commands ran from `E:\Flag-hunt\ctf-platform-be` with `venv\Scripts\python.exe`.

| Command | Result |
| --- | --- |
| `manage.py check` | `System check identified no issues (0 silenced).` |
| `manage.py makemigrations --check --dry-run` | `No changes detected` |
| `manage.py test terminal.tests.test_reconnect_policy -v 1` | `Ran 9 tests ... OK` |
| `manage.py test terminal -v 1` | `Ran 57 tests ... OK` |
| `manage.py test challenge_runtime terminal -v 1` | `Ran 87 tests ... OK (skipped=2)` |
| `manage.py test instances config challenges -v 1` | `Ran 137 tests ... OK` |
| `manage.py test achievements announcements audit broker manager notifications platform_settings submissions users -v 1` | `Ran 490 tests ... OK` |
| `FLAGHUNT_REAL_DOCKER_TESTS=1 manage.py test challenge_runtime.tests.test_real_exec_integration -v 1` | `Ran 1 test ... OK` |

A first full `terminal` run had one intermittent SQLite ticket-consumption race failure in the pre-existing `TicketConcurrencyTests` (`['rejected', 'rejected']`). The isolated test passed, and the repeated full suite passed `57/57`. No production claim is made for that development SQLite race; PostgreSQL remains a production prerequisite.

A whole-tree `manage.py test` is deliberately not claimed clean: the pre-existing untracked top-level `test_digest.py` fails with `TypeError: ValidatedRuntimeSpec.__init__() takes 14 positional arguments but 15 were given`. The targeted app suites above cover the changed areas.

### Frontend

All commands ran from `E:\Flag-hunt\ctf-platform`.

| Command | Result |
| --- | --- |
| `npm test -- --run` | `4 passed` files, `32 passed` tests |
| `npm run build` | Vite 5.4.21, `2974 modules transformed`, built in `33.90s`; final rerun built in `24.72s` |
| `node scripts/challenges-harness/run.mjs` | `124/124 passed` |

The existing Stage 1D.4 HTTP/challenge harness behavior remains green; no Stage 1C lifecycle ownership changed.

---

## 2. Required-case mapping

| Required case | Evidence |
| --- | --- |
| Verify Docker SDK/exec stream behavior; no false resume claim | Docker SDK 7.1.0 source inspection in Phase 0 plus `test_real_exec_integration` (real adapter, PTY, input/output/resize/cleanup). Architecture/security docs state no reattach API. |
| Define one explicit reconnect policy before implementation | `STAGE_1D_5_RECONNECTION_ARCHITECTURE.md` §1.3: controlled fresh shell, bounded retries, no replay. |
| Prevent duplicate active shells | Backend `test_duplicate_reconnect_attempt_is_rejected_while_session_is_active` asserts 4409 and exactly one `open_terminal_session`; DB unique active-session constraints retained. |
| Revalidate ownership on every reconnect | Backend `test_ticket_is_bound_to_its_owner`; ticket issue and WS admission recheck ownership. |
| Reject ticket replay | Backend `test_replay_of_the_previous_ticket_is_rejected`. |
| Reject non-owner reconnect | Backend `test_ticket_is_bound_to_its_owner` (consume with mismatched user rejects). |
| Reject stopped/expired container instance reconnect | Backend `test_stopped_instance_rejects_a_fresh_reconnect_ticket`; frontend `stops reconnect attempts when the instance is stopped`. |
| Reject expired reconnect authorization | Backend `test_expired_reconnect_authorization_is_rejected`; frontend `stops retrying when a fresh ticket reports the instance is gone`. |
| Atomic authorization / shared coordination | Existing DB conditional ticket consume, DB session limits, channel revocation groups, Celery cleanup; backend concurrency regression retained and passed. |
| Frontend disconnected/reconnecting state | Frontend `shows reconnecting, preserves scrollback, and reports the fresh shell`. |
| Bounded exponential backoff with jitter | Service tests `uses deterministic bounded exponential delays` and `keeps jitter inside the expected band`. |
| Max retry count | Service test `stops permanently after the bounded maximum number of retries`. |
| No concurrent reconnect attempts | Service test `does not allow two concurrent reconnect attempts`. |
| Fresh authorized ticket per attempt | Service test asserts two `api.post` calls and distinct ticket in the second subprotocol. |
| Scrollback preservation | Frontend test asserts old output remains in xterm writes after reconnect. |
| Explicit new-shell notice | Frontend test asserts the exact warning after `status:connected`. |
| No false connected state | Service-timeout test and component test assert no connected state before `status:connected`. |
| Stop after terminal closure | Service `never reconnects after an intentional close`; frontend `does not retry after the terminal component unmounts`. |
| Stop after auth failure | Service `stops retrying after authentication failure`; frontend `does not retry after a rejected ticket`. |
| Stop after session expiry/instance stop | Backend stopped-instance test; frontend instance-stop test. |
| Cleanup after reconnect timeout | Service `cleans up a stalled reconnect attempt and retries with a new ticket`. |
| Docker exec exit during disconnect | Backend `test_exec_exit_closes_session_without_touching_container`; exposed and fixed the self-cancel cleanup bug. |
| Reconnect does not create new container | Backend first test asserts create/start/stop/remove mocks were not called. |
| Reconnect does not replay/reuse exec | Backend `test_reconnect_does_not_replay_old_output_or_reuse_exec`. |
| No proxy/API regressions | Stage 1D.4 frontend tests plus `124/124` challenge harness. |

---

## 3. Scope of evidence

- Backend reconnect/lifecycle tests use mocked runtime and in-memory channel layers. They are deterministic, not real Docker.
- Frontend reconnect tests use deterministic `MockWebSocket` and mocked xterm. They are not a real browser.
- The opted-in real Docker test exercises the adapter directly, not a browser-to-Docker WebSocket path.
- Full browser-to-real-Docker end-to-end verification remains outstanding and must not be inferred from these results.
