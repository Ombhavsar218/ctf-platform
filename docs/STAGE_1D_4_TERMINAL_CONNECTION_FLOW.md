# Stage 1D.4 — Terminal Connection Flow

**Status:** FRONTEND XTERM.JS INTEGRATION IMPLEMENTED — FULL BROWSER-TO-DOCKER END-TO-END VERIFICATION OUTSTANDING  
**Security gate:** **NOT READY — LIVE FIREWALL INTEGRATION NOT AUTHORIZED**  
**Open items:** T-11, T-13, T-27 — **OPEN — ACCEPTANCE REQUIRED**

## 1. High-level sequence

```text
User clicks "Open Terminal"
  -> ChallengeDetails mounts InteractiveTerminal
  -> InteractiveTerminal verifies active running instance (GET active)
  -> POST /api/v1/challenges/instances/terminal-ticket/  (Bearer via api.js)
  -> 201 { ticket, url, subprotocol, expiresIn }
  -> new WebSocket(derivedWsUrl, ['flaghunt-terminal-v1', ticket])
  -> backend validates Origin + subprotocol + ticket + instance ownership
  -> backend starts Docker exec/PTY and sends status: connected
  -> xterm onData -> {"type":"input","data":"<base64>"}
  -> backend output -> {"type":"output","data":"<base64>"} -> xterm.write()
  -> FitAddon/onResize -> debounced {"type":"resize","rows":N,"cols":M}
  -> Close / unmount -> WebSocket close + xterm dispose; container untouched
```

## 2. Explicit user action and instance verification

`InteractiveTerminal` is mounted only by the `Open Terminal` button in `ChallengeDetails`, and only when `challenge.instanceMode === 'terminal'`.

On mount it checks the instance passed from the page (must be `running` and belong to the challenge), then calls `challengeService.getInstance(challengeId)` again. This uses the existing authenticated GET and 401 refresh behavior. If no active running instance exists, the UI shows a clear error and does **not** request a ticket.

No Start Instance call is made by the terminal. No ticket request happens on challenge page render, xterm mount, or repeated React renders.

## 3. Ticket acquisition

Request:

```http
POST /api/v1/challenges/instances/terminal-ticket/
Authorization: Bearer <existing access token>
```

Success (201):

```json
{
  "ticket": "opaque-single-use-token",
  "url": "ws://api-host/ws/challenges/instances/terminal/",
  "subprotocol": "flaghunt-terminal-v1",
  "expiresIn": 30
}
```

Frontend validation:

- ticket must be a string matching the backend token shape;
- subprotocol must be exactly `flaghunt-terminal-v1`;
- failures are surfaced through `ApiError`/`api.js` messages and shown in the panel.

The ticket is used once, only as the second WebSocket subprotocol. It is not stored or logged.

## 4. WebSocket URL and authentication

The frontend derives the WebSocket URL from `VITE_API_BASE_URL`:

- `http://127.0.0.1:8000/api/v1/` → `ws://127.0.0.1:8000/ws/challenges/instances/terminal/`
- `https://api.example.test/api/v1/` → `wss://api.example.test/ws/challenges/instances/terminal/`
- `/api/v1/` with page `https://app.example.test` → `wss://app.example.test/ws/challenges/instances/terminal/`

Construction:

```js
new WebSocket(derivedWsUrl, ['flaghunt-terminal-v1', ticket])
```

The browser sends its page `Origin`; the backend allowlist validates it. The frontend does not relax or bypass Origin validation.

## 5. UI connection states

| UI state | Meaning |
| --- | --- |
| Connecting | Ticket request / WebSocket handshake in progress |
| Starting shell | WebSocket is open; waiting for backend `status: connected` |
| Connected | Backend confirmed exec/PTY is ready |
| Disconnected | Socket closed normally or terminal UI closed |
| Failed | Ticket, handshake, protocol, or session error |

The terminal never shows `Connected` merely because xterm mounted or the WebSocket constructor ran.

## 6. Message protocol

### Client → backend

Input:

```json
{"type":"input","data":"base64-of-utf8-bytes"}
```

Input is chunked to 16 KiB so the base64 frame stays below the 32 KiB backend frame limit after JSON overhead.

Resize:

```json
{"type":"resize","rows":30,"cols":100}
```

Rows are clamped to 24–200 and columns to 40–300. Duplicate dimensions are suppressed. Resize events are debounced by 250 ms.

Ping:

```json
{"type":"ping"}
```

The service supports sending ping; the backend replies with `{"type":"pong"}`.

### Backend → client

Shell ready:

```json
{"type":"status","state":"connected","rows":24,"cols":40}
```

Output:

```json
{"type":"output","data":"base64-of-pty-bytes"}
```

Base64 is decoded to bytes, then written through a streaming `TextDecoder`. Frames are handled synchronously in arrival order. Invalid base64 produces a user-visible error without crashing the page.

Status errors:

```json
{"type":"status","state":"error","reason":"terminal_unavailable"}
{"type":"status","state":"revoked","reason":"instance_unavailable"}
```

Error frames:

```json
{"type":"error","code":"frame_too_large"}
{"type":"error","code":"invalid_dimensions"}
```

Malformed JSON, non-object messages, and unknown types do not crash the terminal panel.

## 7. Close and lifecycle handling

| Close code | Frontend result |
| --- | --- |
| `1000` | Disconnected; intentional UI close or normal close |
| `4000` | “The shell session ended.” |
| `4003` | Instance/session unavailable; close panel and refresh instance state |
| `4401` | Ticket rejected; ask user to try again |
| `4403` | Origin/terminal/container rejected; generic safe message |
| `4409` | Rate/session limit; ask user to wait |

Backend reason strings are mapped to friendly messages. No container ID, exec ID, host path, command, or stack trace is displayed.

Closing the terminal calls `TerminalConnection.close()`. WebSocket handlers are cleared before close, so late events cannot create a second session or mutate unmounted state. The page's `Stop Instance` action remains the only action that stops the container.

## 8. Resize / fit behavior

- `FitAddon` runs on mount, on `ResizeObserver` events, on window resize, and after the backend reports `status: connected`.
- If the fitted size exceeds backend bounds, the terminal is resized to the nearest valid value.
- On small screens the terminal viewport scrolls horizontally rather than sending invalid sub-40-column sizes.
- After shell-ready, the current xterm dimensions are sent once if they differ from the backend’s initial dimensions.

## 9. Error coverage

The UI handles:

- missing/stopped instance;
- ticket creation failure;
- expired/rejected ticket;
- Origin or WebSocket handshake failure;
- network interruption / WebSocket error;
- session limit / rate limit;
- container unavailable or exec failure;
- malformed output frames;
- unsupported WebSocket environments.

Reconnect/resume is intentionally out of scope for this stage; the user can explicitly open a new terminal after an error if the instance is still active.

## 10. Not verified here

This document describes implemented and mocked behavior. It does not claim a real browser-to-real-Docker end-to-end run. Full browser-to-Docker verification and reconnect behavior remain for subsequent stages.
