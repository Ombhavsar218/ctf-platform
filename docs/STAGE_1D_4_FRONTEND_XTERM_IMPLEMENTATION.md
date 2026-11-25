# Stage 1D.4 — Frontend xterm.js Interactive Terminal Implementation

**Status:** FRONTEND XTERM.JS INTEGRATION IMPLEMENTED — FULL BROWSER-TO-DOCKER END-TO-END VERIFICATION OUTSTANDING  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

## 1. Scope

Stage 1D.4 adds a real browser terminal to the existing challenge details page. It uses the Stage 1D.2 authenticated WebSocket gateway and the Stage 1D.3 Docker exec/PTY backend. It does **not** modify backend code, Stage 1C container lifecycle, firewall/manager code, production deployment, or unrelated pages.

The existing simulated terminal components were deliberately left untouched:

- `src/components/ui/Terminal.jsx` remains the decorative dashboard animation.
- `src/components/ui/PowerShellTerminal.jsx` remains the global fake PowerShell drawer.

They are not used as the challenge shell.

## 2. Dependencies

Added to `package.json` / `package-lock.json`:

- `@xterm/xterm@^5.5.0` — terminal emulator.
- `@xterm/addon-fit@^0.10.0` — container fitting.

Added only for deterministic focused testing:

- `vitest@^2.1.9`
- `@testing-library/react@^16.3.3`
- `jsdom@^25.0.1`
- `npm test` script and `vitest.config.js`.

No additional xterm addon was necessary. Selection, copy and paste use xterm.js defaults; scrolling uses xterm scrollback and its own viewport.

## 3. New source files

### `src/services/terminalService.js`

Responsibilities:

- `getWebSocketUrl()` derives `ws://`/`wss://<api-origin>/ws/challenges/instances/terminal/` from the existing `VITE_API_BASE_URL`. Both absolute API URLs and same-origin relative `/api/v1/` URLs work.
- `TerminalConnection` requests a ticket via `api.post('/challenges/instances/terminal-ticket/', {})`, validates the response, opens one WebSocket with `['flaghunt-terminal-v1', ticket]`, and translates the backend JSON protocol.
- Input strings from xterm are UTF-8 encoded, chunked to 16 KiB, base64-encoded, and sent as `{"type":"input","data":...}` frames.
- Output base64 is decoded to bytes and written to xterm through a streaming `TextDecoder`, so split UTF-8 sequences and output ordering are handled safely.
- Resize values are clamped to backend limits (24–200 rows, 40–300 columns), deduplicated, and sent only after the `status: connected` frame.
- `closeMessage()` converts backend close codes/reasons to generic user-facing text with no container IDs, exec IDs, stack traces, or infrastructure detail.

Security properties:

- The ticket is never placed in the WebSocket URL, query string, hash, localStorage, sessionStorage, cookies, logs, or persistent state.
- The frontend supplies no container ID, exec ID, command, user ID, or endpoint. The server resolves all resources from the authenticated instance attached to the ticket.
- Authentication uses the existing `api.post` client, so Bearer attachment and the existing 401 refresh/retry behavior are preserved.
- Reconnect/resume is intentionally not implemented.

### `src/components/ui/InteractiveTerminal.jsx`

A reusable real terminal panel:

- Creates one xterm instance with a dark theme mapped to Flaghunt CSS variables (`--terminal-bg`, `--font-mono`, `--accent-green`, etc.).
- Loads `FitAddon`, calls `fit()` on mount, on container resize, and on window resize.
- Uses a 250 ms debounce for resize frames and suppresses duplicate dimensions.
- Wires `onData` to `input` frames and backend `output` frames to `term.write()`.
- Provides connecting / starting-shell / connected / disconnected / failed states separately from the challenge instance status.
- Provides Clear and Close controls. Clear calls `term.clear()`. Close closes the WebSocket and unmounts the panel; it never calls Stop Instance.
- Cleans up timers, listeners, ResizeObserver, xterm disposables, the WebSocket, and the xterm instance on unmount.

### `src/pages/ChallengeDetails.jsx`

- Reads the existing backend `challenge.instanceMode` field. HTTP remains the default.
- HTTP challenges keep the existing connection string, Copy control, and `Open` link.
- Terminal-mode challenges show `Interactive shell access`, an explicit `Open Terminal` button, and the real terminal panel only after that action.
- Instance polling remains active while the terminal is open so a stopped/expired instance is noticed promptly.
- Stop Instance still owns container shutdown; closing the terminal only closes the WebSocket and exec session.
- A `4003` close or revoked/unavailable status closes the panel and refreshes instance state.

### Styling

`src/styles/global.css` gained `.interactive-terminal-*` styles using the existing dark purple design tokens. The panel is responsive; on narrow screens the terminal viewport scrolls horizontally so backend minimum columns are respected without redesigning the page.

## 4. Verified backend contract used

The frontend implementation was checked against implementation code and tests, not only documentation:

- REST route: `/api/v1/challenges/instances/terminal-ticket/` (`terminal/urls.py`, `terminal/views.py`).
- Response fields: `ticket`, `url`, `subprotocol`, `expiresIn` (`terminal/views.py`; backend test asserts no `?` in `url`).
- WebSocket route: `/ws/challenges/instances/terminal/` (`terminal/routing.py`).
- Strict subprotocol array: exactly `['flaghunt-terminal-v1', <ticket>]` (`terminal/auth.py`).
- Client frames: `input` with base64 `data`, `resize` with integer `rows`/`cols`, optional `ping` (`terminal/consumers.py`).
- Server frames: `status`, `output` with base64 `data`, `error`, `pong` (`terminal/consumers.py`).
- Limits: 32 KiB frame size, rows 24–200, cols 40–300, resize 4/s, ticket TTL 30 s, one session per user and per instance (`config/settings.py`).

The ticket response `url` is authoritative on the backend, but the frontend derives the same ASGI origin from `VITE_API_BASE_URL` so relative production API configuration also works. The ticket itself is used only in the subprotocol array.

## 5. Files changed by this stage

Modified:

- `package.json`
- `package-lock.json`
- `src/pages/ChallengeDetails.jsx`
- `src/styles/global.css`

Added:

- `src/services/terminalService.js`
- `src/components/ui/InteractiveTerminal.jsx`
- `src/test/setup.js`
- `src/test/InteractiveTerminal.test.jsx`
- `src/test/ChallengeDetails.terminal.test.jsx`
- `vitest.config.js`
- `docs/STAGE_1D_4_FRONTEND_XTERM_IMPLEMENTATION.md`
- `docs/STAGE_1D_4_TERMINAL_CONNECTION_FLOW.md`
- `docs/STAGE_1D_4_TEST_EVIDENCE.md`
- `docs/STAGE_1D_4_FINAL_REPORT.md`

No backend file was modified.

## 6. Remaining limitations

- No browser-to-real-Docker end-to-end verification was performed in this stage.
- Reconnect/resume after network interruption is not implemented.
- Production WSS termination, Redis channel layer, and `FLAGHUNT_WS_ALLOWED_ORIGINS` configuration remain deployment concerns outside this stage.
- The React admin form still does not expose `runtime_access_mode`; terminal challenges must already be configured server-side.
