/**
 * terminalService.js
 * Authenticated WebSocket bridge for the Stage 1D terminal gateway.
 *
 * The ticket travels only in the negotiated subprotocol array. It is never
 * placed in the URL, stored, or logged. The WebSocket URL is always derived
 * from the configured API origin, so both absolute and same-origin/relative
 * VITE_API_BASE_URL values work without exposing any backend internals.
 *
 * Reconnect policy (Stage 1D.5): a Docker exec socket cannot be reattached once
 * its stream is closed, and this backend closes it on WebSocket disconnect.
 * Every reconnect therefore requests a fresh ticket and starts a fresh shell.
 * No output is replayed and no browser-controlled Docker identifier is used.
 */

import { api } from './api';

export const TERMINAL_TICKET_PATH = '/challenges/instances/terminal-ticket/';
export const TERMINAL_SUBPROTOCOL = 'flaghunt-terminal-v1';
export const TERMINAL_WS_PATH = '/ws/challenges/instances/terminal/';

const DEFAULT_API_BASE = '/api/v1/';

// Keep these in sync with config/settings.py TERMINAL_ROWS_*/COLS_*.
export const TERMINAL_LIMITS = Object.freeze({
  rowsMin: 24,
  rowsMax: 200,
  colsMin: 40,
  colsMax: 300,
  maxFrameBytes: 32768,
  maxInputChunkBytes: 16384,
});

/**
 * Bounded reconnect policy. Attempts are counted across the lifetime of one
 * terminal panel; they are deliberately not reset after a successful attempt,
 * so a flapping connection can never reconnect indefinitely.
 */
export const TERMINAL_RECONNECT = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  jitterRatio: 0.25,
  connectTimeoutMs: 10000,
});

const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** Resolve the ASGI WebSocket origin from the existing API configuration. */
export function getWebSocketUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).trim();
  const apiUrl = new URL(configured || DEFAULT_API_BASE, window.location.href);
  const scheme = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${apiUrl.host}${TERMINAL_WS_PATH}`;
}

const clampInteger = (value, min, max) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
};

/** Exponential backoff with symmetric jitter; deterministic when random is fixed. */
export function reconnectDelay(attempt, random = Math.random, policy = TERMINAL_RECONNECT) {
  const index = Math.max(0, Math.floor(Number(attempt)) - 1);
  const base = Math.min(
    Number(policy.maxDelayMs),
    Number(policy.baseDelayMs) * (2 ** index),
  );
  const spread = base * Number(policy.jitterRatio);
  const sample = Math.min(1, Math.max(0, Number(random())));
  return Math.max(1, Math.round(base + (sample * 2 - 1) * spread));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0) return null;
  try {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function statusMessage(reason) {
  const value = String(reason || '').toLowerCase();
  if (value.includes('ticket') || value.includes('auth')) return 'The terminal ticket was rejected. Try again.';
  if (value.includes('origin')) return 'This browser origin is not allowed to open a terminal.';
  if (value.includes('instance') || value.includes('revoked')) return 'The challenge instance is no longer available.';
  if (value.includes('expired')) return 'This terminal session has expired.';
  if (value.includes('container')) return 'The challenge container is unavailable.';
  if (value.includes('terminal')) return 'The terminal service is unavailable for this instance.';
  if (value.includes('rate') || value.includes('limit')) return 'Too many terminal requests. Wait a moment and try again.';
  if (value.includes('timeout')) return 'The terminal took too long to respond.';
  return 'The terminal connection was rejected.';
}

/** Human-readable close messages; never includes IDs or infrastructure detail. */
export function closeMessage(code, reason) {
  const value = String(reason || '').toLowerCase();
  if (code === 1000) return 'Terminal disconnected.';
  if (code === 1006) return 'The network connection was interrupted.';
  if (code === 4000) return 'The shell session ended.';
  if (code === 4003 || code === 4403) return statusMessage(value);
  if (code === 4401) return 'The terminal ticket was rejected. Try again.';
  if (code === 4409) return 'Too many terminal requests. Wait a moment and try again.';
  return 'Terminal connection failed.';
}

function isFatalTicketError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.data?.code || '');
  if (status === 401 || status === 403) return true;
  return ['TERMINAL_NOT_AVAILABLE', 'TERMINAL_DISABLED'].includes(code);
}

function isInstanceUnavailable(error) {
  const code = String(error?.data?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === 'TERMINAL_NOT_AVAILABLE' || message.includes('instance');
}

/**
 * One terminal connection. Reconnects are bounded and always create a fresh
 * shell: the Docker exec stream cannot be resumed after its socket is closed.
 */
export class TerminalConnection {
  constructor({
    onOpen = () => {},
    onStatus = () => {},
    onOutput = () => {},
    onError = () => {},
    onClose = () => {},
    onReconnecting = () => {},
    onReconnected = () => {},
    onUnavailable = () => {},
    WebSocketImpl = globalThis.WebSocket,
    url = null,
    reconnect = TERMINAL_RECONNECT,
  } = {}) {
    this.onOpen = onOpen;
    this.onStatus = onStatus;
    this.onOutput = onOutput;
    this.onError = onError;
    this.onClose = onClose;
    this.onReconnecting = onReconnecting;
    this.onReconnected = onReconnected;
    this.onUnavailable = onUnavailable;
    this.WebSocketImpl = WebSocketImpl;
    this.url = url;
    this.reconnect = { ...TERMINAL_RECONNECT, ...reconnect };

    this._socket = null;
    this._opening = false;
    this._transportOpen = false;
    this._ready = false;
    this._closed = false;
    this._stopped = false;
    this._everConnected = false;
    this._reconnecting = false;
    this._reconnectAttempts = 0;
    this._attemptId = 0;
    this._attemptWasReconnect = false;
    this._lastResize = '';
    this._encoder = new TextEncoder();
    this._decoder = this._newDecoder();
    this._retryTimer = null;
    this._attemptTimer = null;
    this._requestTimer = null;
  }

  get isConnected() {
    return this._transportOpen && this._ready && !this._closed && !this._stopped;
  }

  get isReconnecting() {
    return this._reconnecting && !this._closed && !this._stopped;
  }

  _newDecoder() {
    return typeof TextDecoder === 'undefined' ? null : new TextDecoder();
  }

  _decode(bytes, { stream = true } = {}) {
    if (!this._decoder) return '';
    return this._decoder.decode(bytes, { stream });
  }

  _flushDecoder() {
    if (!this._decoder) return;
    try {
      const remaining = this._decoder.decode();
      if (remaining) this.onOutput(remaining);
    } catch {
      // A partial sequence from an interrupted stream must not break the UI.
    }
  }

  _isCurrent(attemptId) {
    return attemptId === this._attemptId && !this._closed && !this._stopped;
  }

  _cancelTimers() {
    if (this._retryTimer !== null) clearTimeout(this._retryTimer);
    if (this._attemptTimer !== null) clearTimeout(this._attemptTimer);
    if (this._requestTimer !== null) clearTimeout(this._requestTimer);
    this._retryTimer = null;
    this._attemptTimer = null;
    this._requestTimer = null;
  }

  _stop({ closeSocket = false } = {}) {
    this._stopped = true;
    this._reconnecting = false;
    this._cancelTimers();
    if (closeSocket && this._socket) {
      const socket = this._socket;
      this._socket = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close(1000, 'client_stopped');
      } catch {
        // Already gone; there is nothing to clean up.
      }
    }
  }

  async open() {
    if (this._closed || this._stopped || this._opening || this._socket
      || this._reconnecting || this._retryTimer !== null) return;
    await this._startAttempt(false);
  }

  async _startAttempt(isReconnect) {
    if (this._closed || this._stopped || this._socket) return;
    const attemptId = ++this._attemptId;
    this._opening = true;
    this._attemptWasReconnect = isReconnect;
    this._decoder = this._newDecoder();
    // A replacement shell is a different PTY; it must receive dimensions even
    // if they are identical to the previous shell's last resize frame.
    this._lastResize = '';

    try {
      const payload = await this._requestTicket(attemptId);
      if (!this._isCurrent(attemptId)) return;

      const ticket = payload?.ticket;
      if (typeof ticket !== 'string' || !TICKET_PATTERN.test(ticket)) {
        throw new Error('The terminal service returned an invalid ticket.');
      }
      const subprotocol = payload?.subprotocol || TERMINAL_SUBPROTOCOL;
      if (subprotocol !== TERMINAL_SUBPROTOCOL) {
        throw new Error('This browser does not support the requested terminal protocol.');
      }

      const url = this.url || getWebSocketUrl();
      if (typeof url !== 'string' || !/^wss?:\/\//i.test(url) || url.includes('?') || url.includes('#')) {
        throw new Error('The terminal service returned an invalid WebSocket address.');
      }
      if (!this.WebSocketImpl) {
        throw new Error('This browser does not support WebSocket connections.');
      }

      const socket = new this.WebSocketImpl(url, [subprotocol, ticket]);
      this._socket = socket;
      this._armAttemptTimeout(attemptId);

      socket.onopen = () => {
        if (!this._isCurrent(attemptId)) return;
        this._transportOpen = true;
        if (!this._attemptWasReconnect) this.onOpen();
      };
      socket.onmessage = (event) => this._handleMessage(event, attemptId);
      socket.onerror = () => {
        if (!this._isCurrent(attemptId)) return;
        // The close event decides whether this is retryable; onerror alone must
        // never create a second socket.
      };
      socket.onclose = (event) => this._handleSocketClose(event, attemptId);
    } catch (error) {
      if (this._isCurrent(attemptId)) this._handleAttemptFailure(error, attemptId);
    } finally {
      if (attemptId === this._attemptId) this._opening = false;
    }
  }

  _requestTicket(attemptId) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (this._requestTimer !== null) clearTimeout(this._requestTimer);
        this._requestTimer = null;
        callback(value);
      };
      this._requestTimer = setTimeout(() => {
        if (!this._isCurrent(attemptId)) return;
        finish(reject, new Error('The terminal service took too long to respond.'));
      }, this.reconnect.connectTimeoutMs);
      api.post(TERMINAL_TICKET_PATH, {}).then(
        (payload) => finish(resolve, payload),
        (error) => finish(reject, error),
      );
    });
  }

  _armAttemptTimeout(attemptId) {
    if (this._attemptTimer !== null) clearTimeout(this._attemptTimer);
    this._attemptTimer = setTimeout(() => {
      if (!this._isCurrent(attemptId) || this._ready) return;
      this._ready = false;
      this._transportOpen = false;
      const socket = this._socket;
      this._socket = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close(1000, 'connect_timeout');
        } catch {
          // Closing an already-gone socket is harmless.
        }
      }
      this._handleAttemptFailure(
        new Error('The terminal took too long to become ready.'), attemptId,
      );
    }, this.reconnect.connectTimeoutMs);
  }

  _clearAttemptTimeout() {
    if (this._attemptTimer !== null) clearTimeout(this._attemptTimer);
    this._attemptTimer = null;
  }

  _handleMessage(event, attemptId) {
    if (!this._isCurrent(attemptId)) return;
    let content;
    try {
      content = JSON.parse(event?.data);
    } catch {
      this.onError('The terminal received an invalid message.');
      return;
    }
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      this.onError('The terminal received an invalid message.');
      return;
    }

    if (content.type === 'output') {
      const bytes = base64ToBytes(content.data);
      if (!bytes) {
        this.onError('The terminal received invalid output.');
        return;
      }
      // TextDecoder is streaming because PTY chunks can split UTF-8 sequences.
      const text = this._decode(bytes);
      if (text) this.onOutput(text);
      return;
    }

    if (content.type === 'status') {
      const state = String(content.state || '');
      if (state === 'connected') {
        this._clearAttemptTimeout();
        this._ready = true;
        this._everConnected = true;
        this._reconnecting = false;
        this.onStatus(content);
        if (this._attemptWasReconnect) {
          this.onReconnected({
            freshShell: true,
            attempts: this._reconnectAttempts,
          });
        }
        return;
      }
      if (state === 'error' || state === 'revoked') {
        this._ready = false;
        const reason = String(content.reason || '');
        this.onError(statusMessage(reason));
        if (/unavailable|revoked|expired|instance/i.test(reason)) {
          this.onUnavailable(reason);
        }
        this._stop({ closeSocket: true });
      }
      this.onStatus(content);
      return;
    }

    if (content.type === 'error') {
      const code = String(content.code || '');
      this.onError(statusMessage(code));
      if (/invalid_ticket|invalid_subprotocol|authentication_failed/i.test(code)) {
        this._stop({ closeSocket: true });
      }
      return;
    }

    // ping/pong and unknown message types are intentionally ignored.
  }

  _isFatalClose(info) {
    const code = Number(info.code);
    const reason = String(info.reason || '').toLowerCase();
    if (code === 1000 || code === 4000 || code === 4003 || code === 4400
      || code === 4401 || code === 4403) return true;
    if (code === 4409) return false;
    return /unavailable|revoked|expired|ticket|origin|auth/i.test(reason);
  }

  _handleSocketClose(event, attemptId) {
    if (!this._isCurrent(attemptId)) return;
    this._clearAttemptTimeout();
    this._flushDecoder();

    const socket = this._socket;
    this._socket = null;
    this._transportOpen = false;
    this._ready = false;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }

    const info = {
      code: event?.code,
      reason: event?.reason,
      message: closeMessage(event?.code, event?.reason),
    };
    if (this._closed || this._stopped) return;
    // Only an established terminal session is eligible for reconnect. An
    // initial handshake failure is shown immediately instead of being retried.
    if (!this._everConnected || this._isFatalClose(info)) {
      if (/unavailable|revoked|expired|instance/i.test(String(info.reason || ''))) {
        this.onUnavailable(info.reason);
      }
      this._stop();
      this.onClose(info);
      return;
    }
    this._scheduleReconnect(info, attemptId);
  }

  _handleAttemptFailure(error, attemptId) {
    if (!this._isCurrent(attemptId)) return;
    this._clearAttemptTimeout();
    const message = error?.message || 'Could not open the terminal.';

    if (isFatalTicketError(error)) {
      if (isInstanceUnavailable(error)) this.onUnavailable('instance_unavailable');
      this._stop();
      this.onError(message);
      return;
    }
    // Initial ticket failures stay visible; they are an explicit user action,
    // not a recovery from a live shell interruption.
    if (!this._everConnected && !this._attemptWasReconnect) {
      this._stop();
      this.onError(message);
      return;
    }
    this._scheduleReconnect({ code: 0, reason: 'ticket_unavailable', message }, attemptId);
  }

  _scheduleReconnect(info, attemptId) {
    if (!this._isCurrent(attemptId)) return;
    const next = this._reconnectAttempts + 1;
    if (next > this.reconnect.maxAttempts) {
      this._stop();
      this.onError('Could not reconnect to the terminal. Reopen the terminal to try again.');
      this.onClose({ ...info, exhausted: true });
      return;
    }

    this._reconnectAttempts = next;
    const delay = reconnectDelay(next, Math.random, this.reconnect);
    this._reconnecting = true;
    this.onReconnecting({
      attempt: next,
      maxAttempts: this.reconnect.maxAttempts,
      delay,
      reason: info.reason,
    });
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (!this._isCurrent(attemptId)) return;
      this._startAttempt(true);
    }, delay);
  }

  sendInput(text) {
    if (!this.isConnected || !this._socket || this._socket.readyState !== 1) return false;
    if (typeof text !== 'string' || !text) return false;

    const bytes = this._encoder.encode(text);
    const chunkSize = TERMINAL_LIMITS.maxInputChunkBytes;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      this._socket.send(JSON.stringify({
        type: 'input',
        data: bytesToBase64(chunk),
      }));
    }
    return true;
  }

  sendResize(rows, cols) {
    if (!this.isConnected || !this._socket || this._socket.readyState !== 1) return false;
    const safeRows = clampInteger(rows, TERMINAL_LIMITS.rowsMin, TERMINAL_LIMITS.rowsMax);
    const safeCols = clampInteger(cols, TERMINAL_LIMITS.colsMin, TERMINAL_LIMITS.colsMax);
    if (safeRows === null || safeCols === null) return false;

    const signature = `${safeRows}x${safeCols}`;
    if (signature === this._lastResize) return false;
    this._lastResize = signature;
    this._socket.send(JSON.stringify({
      type: 'resize',
      rows: safeRows,
      cols: safeCols,
    }));
    return true;
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._ready = false;
    this._transportOpen = false;
    this._reconnecting = false;
    this._cancelTimers();
    const socket = this._socket;
    this._socket = null;
    if (socket) {
      // Suppress callbacks from an intentional UI close.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close(1000, 'client_closed');
      } catch {
        // Closing a socket that is already gone is harmless.
      }
    }
  }
}

export default {
  TerminalConnection,
  getWebSocketUrl,
  closeMessage,
  reconnectDelay,
  TERMINAL_RECONNECT,
};
