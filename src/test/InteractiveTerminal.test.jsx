import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InteractiveTerminal from '../components/ui/InteractiveTerminal';
import { api } from '../services/api';
import { challengeService } from '../services/challengeService';
import { getWebSocketUrl, TERMINAL_SUBPROTOCOL } from '../services/terminalService';

vi.mock('@xterm/xterm', () => {
  class Terminal {
    constructor(options) {
      this.options = options;
      this.cols = 100;
      this.rows = 30;
      this.writes = [];
      this.handlers = {};
      this.disposed = false;
      globalThis.__xtermInstances.push(this);
    }

    loadAddon(addon) { this.addon = addon; }
    open(host) { this.host = host; host.innerHTML = '<div class="xterm-mock"></div>'; }
    focus() { this.focused = true; }
    write(text) { this.writes.push(text); }
    writeln(text) { this.writes.push(`${text}\n`); }
    clear() { this.writes = []; }
    resize(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.handlers.resize?.({ cols, rows });
    }
    onData(callback) { this.handlers.data = callback; return { dispose() {} }; }
    onResize(callback) { this.handlers.resize = callback; return { dispose() {} }; }
    dispose() { this.disposed = true; }
  }
  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    activate() {}
    dispose() {}
    fit() { globalThis.__fitCalls += 1; }
    proposeDimensions() { return { cols: 100, rows: 30 }; }
  }
  return { FitAddon };
});

const MockWebSocket = globalThis.MockWebSocket;
const TICKET = 'a'.repeat(43);
const INSTANCE = {
  id: 7,
  challengeId: 4,
  status: 'running',
  connection: { type: 'terminal', host: '', port: null, target: '', url: '' },
  command: '',
  remainingSeconds: 600,
};

const ticketPayload = () => ({
  ticket: TICKET,
  url: getWebSocketUrl(),
  subprotocol: TERMINAL_SUBPROTOCOL,
  expiresIn: 30,
});

const renderTerminal = (overrides = {}) => render(
  <InteractiveTerminal
    challengeId="4"
    instance={INSTANCE}
    onClose={vi.fn()}
    onInstanceUnavailable={vi.fn()}
    {...overrides}
  />,
);

const connectTerminal = async (overrides = {}) => {
  const view = renderTerminal(overrides);
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  const socket = MockWebSocket.instances[0];
  await act(async () => {
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
  });
  await act(async () => { await Promise.resolve(); });
  return { view, socket, term: globalThis.__xtermInstances[0] };
};

const sentFrames = (socket) => socket.sent.map((frame) => JSON.parse(frame));

beforeEach(() => {
  vi.spyOn(challengeService, 'getInstance').mockResolvedValue(INSTANCE);
  vi.spyOn(api, 'post').mockResolvedValue(ticketPayload());
});

describe('InteractiveTerminal protocol and lifecycle', () => {
  it('uses the exact subprotocol and never puts the ticket in the URL', async () => {
    const { socket } = await connectTerminal();
    expect(socket.protocols).toEqual([TERMINAL_SUBPROTOCOL, TICKET]);
    expect(socket.url).toBe(getWebSocketUrl());
    expect(socket.url).not.toContain(TICKET);
    expect(socket.url).not.toContain('?');
  });

  it('does not show Connected before the WebSocket and shell are ready', async () => {
    renderTerminal();
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(screen.queryByText('Connected')).toBeNull();
    await act(async () => { MockWebSocket.instances[0].open(); });
    expect(screen.queryByText('Connected')).toBeNull();
    await act(async () => {
      MockWebSocket.instances[0].receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    });
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('forwards keyboard input with the backend input frame format', async () => {
    const { socket, term } = await connectTerminal();
    await act(async () => { term.handlers.data('ls -la\n'); });
    const input = sentFrames(socket).filter((frame) => frame.type === 'input').pop();
    expect(input).toBeTruthy();
    expect(window.atob(input.data)).toBe('ls -la\n');
  });

  it('does not send input before the terminal connection is ready', async () => {
    renderTerminal();
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];
    const term = globalThis.__xtermInstances[0];
    await act(async () => { term.handlers.data('secret'); });
    expect(socket.sent).toHaveLength(0);
  });

  it('decodes and renders backend output in order', async () => {
    const { socket, term } = await connectTerminal();
    await act(async () => {
      socket.receiveFrame({ type: 'output', data: window.btoa('first\n') });
      socket.receiveFrame({ type: 'output', data: window.btoa('second\n') });
    });
    expect(term.writes).toEqual(expect.arrayContaining(['first\n', 'second\n']));
    expect(term.writes.indexOf('first\n')).toBeLessThan(term.writes.indexOf('second\n'));
  });

  it('sends validated resize frames after the shell is connected', async () => {
    const { socket, term } = await connectTerminal();
    await act(async () => {
      term.resize(10, 10);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const resize = sentFrames(socket).filter((frame) => frame.type === 'resize').pop();
    expect(resize).toEqual({ type: 'resize', rows: 24, cols: 40 });
  });

  it('debounces resize events and suppresses duplicate dimensions', async () => {
    const { socket, term } = await connectTerminal();
    vi.useFakeTimers();
    try {
      const baseline = sentFrames(socket).filter((frame) => frame.type === 'resize').length;
      await act(async () => {
        term.resize(120, 60);
        term.resize(130, 70);
        term.resize(140, 80);
        vi.advanceTimersByTime(249);
      });
      expect(sentFrames(socket).filter((frame) => frame.type === 'resize')).toHaveLength(baseline);
      await act(async () => { vi.advanceTimersByTime(1); });
      const resizeFrames = sentFrames(socket).filter((frame) => frame.type === 'resize');
      expect(resizeFrames).toHaveLength(baseline + 1);
      expect(resizeFrames.at(-1)).toEqual({ type: 'resize', rows: 80, cols: 140 });

      await act(async () => {
        term.resize(140, 80);
        vi.advanceTimersByTime(300);
      });
      expect(sentFrames(socket).filter((frame) => frame.type === 'resize')).toHaveLength(baseline + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents duplicate WebSocket connections on repeated renders', async () => {
    const { view } = await connectTerminal();
    view.rerender(
      <InteractiveTerminal
        challengeId="4"
        instance={{ ...INSTANCE }}
        onClose={vi.fn()}
        onInstanceUnavailable={vi.fn()}
      />,
    );
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  });

  it('closes the WebSocket and disposes xterm on unmount', async () => {
    const { view, socket, term } = await connectTerminal();
    view.unmount();
    expect(socket.readyState).toBe(3);
    expect(term.disposed).toBe(true);
  });

  it('shows a useful error when ticket creation fails', async () => {
    api.post.mockRejectedValueOnce(new Error('Terminal tickets are unavailable.'));
    renderTerminal();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Terminal tickets are unavailable.');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('shows a useful error when the ticket is rejected by the gateway', async () => {
    const { socket } = await connectTerminal();
    await act(async () => {
      socket.receiveFrame({ type: 'status', state: 'error', reason: 'invalid_ticket' });
    });
    expect((await screen.findByRole('alert')).textContent).toContain('ticket was rejected');
  });

  it('handles malformed frames without crashing the challenge UI', async () => {
    const { socket } = await connectTerminal();
    await act(async () => { socket.receiveFrame('not-json'); });
    expect((await screen.findByRole('alert')).textContent).toContain('invalid message');
    expect(screen.getByLabelText('Challenge terminal')).toBeTruthy();
  });

  it('blocks ticket creation when there is no active instance', async () => {
    renderTerminal({ instance: null });
    expect((await screen.findByRole('alert')).textContent).toContain('Start an active challenge instance');
    expect(api.post).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
