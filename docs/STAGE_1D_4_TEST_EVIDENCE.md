# Stage 1D.4 — Test Evidence

**Status:** FRONTEND XTERM.JS INTEGRATION IMPLEMENTED — FULL BROWSER-TO-DOCKER END-TO-END VERIFICATION OUTSTANDING  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

All frontend tests below are deterministic mocked tests. REST calls, WebSocket frames, and xterm.js were replaced with doubles. No browser-to-real-Docker end-to-end verification is claimed.

## 1. Commands and results

### Focused frontend tests

```text
cd E:\Flag-hunt\ctf-platform
npm test -- --run
```

Result:

```text
Test Files  2 passed (2)
Tests       19 passed (19)
Duration    11.56s
```

Files:

- `src/test/InteractiveTerminal.test.jsx` — 13 tests
- `src/test/ChallengeDetails.terminal.test.jsx` — 6 tests

### Production build

```text
cd E:\Flag-hunt\ctf-platform
npm run build
```

Result:

```text
vite v5.4.21 building for production...
✓ 2974 modules transformed.
✓ built in 49.26s
```

No build errors. xterm CSS was bundled through the component import.

### Existing challenges/HTTP regression harness

```text
cd E:\Flag-hunt\ctf-platform
node scripts/challenges-harness/run.mjs
```

Result:

```text
124/124 passed
```

This harness exercises the real service modules against stubbed `fetch`/`localStorage`, including `startInstance`, `getInstance`, `stopInstance`, and `normalizeInstance`.

## 2. Requirement-to-test mapping

| # | Requirement | Covering test |
| --- | --- | --- |
| 1 | Terminal renders for terminal-mode challenges | `renders a real terminal only for terminal-mode challenges` |
| 2 | HTTP challenges retain existing UI | `keeps the existing HTTP connection UI unchanged` |
| 3 | Ticket endpoint called only after explicit action | `does not request a ticket until the explicit Open Terminal action` |
| 4 | Ticket not placed in WebSocket URL | `uses the exact subprotocol and never puts the ticket in the URL` |
| 5 | Correct WebSocket subprotocol | same test; asserts `['flaghunt-terminal-v1', ticket]` |
| 6 | Successful connection changes UI state | `does not show Connected before the WebSocket and shell are ready` |
| 7 | Input forwarding uses backend protocol | `forwards keyboard input with the backend input frame format` |
| 8 | Output decoded and rendered | `decodes and renders backend output in order` |
| 9 | Resize uses exact protocol and valid dimensions | `sends validated resize frames after the shell is connected` |
| 10 | Resize events are debounced | `debounces resize events and suppresses duplicate dimensions` |
| 11 | Duplicate WebSocket connections prevented | `prevents duplicate WebSocket connections on repeated renders` |
| 12 | Unmount closes socket and disposes xterm | `closes the WebSocket and disposes xterm on unmount` |
| 13 | Closing terminal does not call Stop Instance | `closing the terminal closes the socket without calling Stop Instance` |
| 14 | Failed ticket / WebSocket errors useful | `shows a useful error when ticket creation fails`, `shows a useful error when the ticket is rejected by the gateway`, `handles malformed frames without crashing the challenge UI` |
| 15 | Existing challenge/HTTP flows regress-free | ChallengeDetails HTTP Start/Stop tests plus 124/124 challenges harness |

Additional safety checks:

- Input is not sent before the shell is ready.
- Missing active instance blocks ticket creation.
- Backend resize limits are clamped (10×10 becomes 24×40).
- Repeated identical resize dimensions are suppressed.

## 3. What is mocked

- REST: `api.post` and `challengeService.getInstance/startInstance/stopInstance/getChallengeById` are spied and resolved locally.
- WebSocket: `MockWebSocket` records URL, subprotocols, sent frames, and exposes deterministic `open()` / `receiveFrame()` / `close()` helpers.
- xterm.js: `Terminal` and `FitAddon` are mocked to record writes, handlers, fit calls, and disposal.
- DOM: Vitest + jsdom + React Testing Library.

## 4. Contract verification performed in Phase 0

The implementation contract was read directly from backend code and tests, including:

- `terminal/views.py` — ticket response fields and WS path.
- `terminal/auth.py` — exact two-entry subprotocol requirement and Origin validation.
- `terminal/consumers.py` — input/output/resize/status/error frames and close codes.
- `config/settings.py` — frame, dimension, rate, TTL, and session limits.
- `terminal/tests/test_ticket_api.py` — route and response assertions.

No backend code was modified, so backend test suites were not rerun for this frontend-only stage.

## 5. Not claimed

- No real browser session was driven against a running Django/Daphne/Docker stack.
- No real xterm.js DOM rendering against a real PTY was verified.
- No WSS/Redis/Origin production configuration was exercised.
- No firewall-controller or privileged integration was tested or authorized.

Full browser-to-real-Docker end-to-end verification remains outstanding.
