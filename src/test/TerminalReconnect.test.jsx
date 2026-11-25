import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../services/api';
import {
  getWebSocketUrl,
  reconnectDelay,
  TERMINAL_SUBPROTOCOL,
  TerminalConnection,
} from '../services/terminalService';

const MockWebSocket = globalThis.MockWebSocket;
const FIRST_TICKET = 'a'.repeat(43);
const SECOND_TICKET = 'b'.repeat(43);
const THIRD_TICKET = 'c'.repeat(43);

const POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 400,
  jitterRatio: 0,
  connectTimeoutMs: 1000,
});

const payload = (ticket) => ({
  ticket,
  url: getWebSocketUrl(),
  subprotocol: TERMINAL_SUBPROTOCOL,
  expiresIn: 30,
});

const callbacks = () => ({
  onOpen: vi.fn(),
  onStatus: vi.fn(),
  onOutput: vi.fn(),
  onError: vi.fn(),
  onClose: vi.fn(),
  onReconnecting: vi.fn(),
  onReconnected: vi.fn(),
  onUnavailable: vi.fn(),
});

const makeConnection = (events, overrides = {}) => new TerminalConnection({
  ...events,
  WebSocketImpl: MockWebSocket,
  url: getWebSocketUrl(),
  reconnect: POLICY,
  ...overrides,
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.spyOn(api, 'post').mockResolvedValue(payload(FIRST_TICKET));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('terminal reconnect policy helpers', () => {
  it('uses deterministic bounded exponential delays', () => {
    expect(reconnectDelay(1, () => 0.5, POLICY)).toBe(100);
    expect(reconnectDelay(2, () => 0.5, POLICY)).toBe(200);
    expect(reconnectDelay(3, () => 0.5, POLICY)).toBe(400);
    expect(reconnectDelay(4, () => 0.5, POLICY)).toBe(400);
  });

  it('keeps jitter inside the expected band', () => {
    const config = { ...POLICY, jitterRatio: 0.25 };
    expect(reconnectDelay(1, () => 0, config)).toBe(75);
    expect(reconnectDelay(1, () => 1, config)).toBe(125);
  });
});

describe('TerminalConnection bounded recovery', () => {
  it('reconnects with a fresh ticket and fresh shell after a network interruption', async () => {
    vi.useFakeTimers();
    api.post
      .mockResolvedValueOnce(payload(FIRST_TICKET))
      .mockResolvedValueOnce(payload(SECOND_TICKET));
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const first = MockWebSocket.instances[0];
    first.open();
    events.onStatus.mockClear();
    first.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    first.send(JSON.stringify({ type: 'input', data: window.btoa('old') }));
    expect(connection.isConnected).toBe(true);

    first.close(1006, 'network_lost');
    expect(events.onReconnecting).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
    );
    expect(connection.isConnected).toBe(false);
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(100);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(api.post).toHaveBeenCalledTimes(2);
    const second = MockWebSocket.instances[1];
    expect(second.protocols).toEqual([TERMINAL_SUBPROTOCOL, SECOND_TICKET]);
    expect(second.sent).toHaveLength(0); // no stale input replay

    second.open();
    second.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    expect(events.onReconnected).toHaveBeenCalledWith(
      expect.objectContaining({ freshShell: true, attempts: 1 }),
    );
    expect(connection.isConnected).toBe(true);
    expect(connection.sendResize(24, 40)).toBe(true);
    expect(JSON.parse(second.sent[0])).toEqual({
      type: 'resize', rows: 24, cols: 40,
    });
    connection.close();
  });

  it('does not allow two concurrent reconnect attempts', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const first = MockWebSocket.instances[0];
    first.open();
    first.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    first.close(1006, 'network_lost');

    await connection.open();
    await connection.open();
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(100);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);
    connection.close();
  });

  it('stops retrying after authentication failure', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    socket.close(4401, 'invalid_ticket');
    await flush();

    expect(events.onReconnecting).not.toHaveBeenCalled();
    expect(events.onClose).toHaveBeenCalledWith(
      expect.objectContaining({ code: 4401, reason: 'invalid_ticket' }),
    );
    vi.advanceTimersByTime(5000);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
    connection.close();
  });

  it('stops retrying when a fresh ticket reports the instance is gone', async () => {
    vi.useFakeTimers();
    api.post
      .mockResolvedValueOnce(payload(FIRST_TICKET))
      .mockRejectedValueOnce({
        status: 400,
        message: 'The challenge instance is no longer available.',
        data: { code: 'TERMINAL_NOT_AVAILABLE' },
      });
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    socket.close(1006, 'network_lost');
    vi.advanceTimersByTime(100);
    await flush();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(events.onUnavailable).toHaveBeenCalledWith('instance_unavailable');
    expect(events.onError).toHaveBeenCalledWith(
      'The challenge instance is no longer available.',
    );
    expect(events.onReconnecting).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('never reconnects after an intentional close', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    connection.close();
    vi.advanceTimersByTime(5000);
    await flush();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(events.onReconnecting).not.toHaveBeenCalled();
  });

  it('cleans up a stalled reconnect attempt and retries with a new ticket', async () => {
    vi.useFakeTimers();
    api.post
      .mockResolvedValueOnce(payload(FIRST_TICKET))
      .mockResolvedValueOnce(payload(SECOND_TICKET))
      .mockResolvedValueOnce(payload(THIRD_TICKET));
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    const first = MockWebSocket.instances[0];
    first.open();
    first.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    first.close(1006, 'network_lost');

    vi.advanceTimersByTime(100);
    await flush();
    const stalled = MockWebSocket.instances[1];
    expect(stalled.protocols).toEqual([TERMINAL_SUBPROTOCOL, SECOND_TICKET]);
    stalled.open(); // no backend status:connected frame
    expect(connection.isConnected).toBe(false);

    vi.advanceTimersByTime(1000);
    await flush();
    expect(stalled.readyState).toBe(MockWebSocket.CLOSED);
    expect(events.onReconnecting).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(200);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(3);
    expect(MockWebSocket.instances[2].protocols).toEqual([
      TERMINAL_SUBPROTOCOL,
      THIRD_TICKET,
    ]);
    connection.close();
  });

  it('stops permanently after the bounded maximum number of retries', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const connection = makeConnection(events);

    await connection.open();
    let socket = MockWebSocket.instances[0];
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      socket.close(1006, 'network_lost');
      expect(events.onReconnecting).toHaveBeenCalledTimes(attempt);
      vi.advanceTimersByTime(attempt === 1 ? 100 : attempt === 2 ? 200 : 400);
      await flush();
      expect(MockWebSocket.instances).toHaveLength(attempt + 1);
      socket = MockWebSocket.instances[attempt];
      socket.open();
      socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    }

    socket.close(1006, 'network_lost');
    await flush();
    expect(events.onReconnecting).toHaveBeenCalledTimes(3);
    expect(MockWebSocket.instances).toHaveLength(4);
    expect(events.onError).toHaveBeenCalledWith(
      'Could not reconnect to the terminal. Reopen the terminal to try again.',
    );
    expect(events.onClose).toHaveBeenCalledWith(
      expect.objectContaining({ exhausted: true }),
    );
    connection.close();
  });
});
