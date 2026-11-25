import { afterEach, beforeEach, vi } from 'vitest';

/** Deterministic WebSocket double used by all terminal tests. */
class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    MockWebSocket.instances.push(this);
  }

  open() {
    if (this.readyState !== MockWebSocket.CONNECTING) return;
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  receiveFrame(frame) {
    const data = typeof frame === 'string' ? frame : JSON.stringify(frame);
    this.onmessage?.({ data });
  }

  fail() {
    this.onerror?.({});
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }

  send(data) {
    this.sent.push(data);
    return this.sent.length;
  }
}

globalThis.MockWebSocket = MockWebSocket;
globalThis.WebSocket = MockWebSocket;
globalThis.__xtermInstances = [];
globalThis.__fitCalls = 0;

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.__xtermInstances.length = 0;
  globalThis.__fitCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
