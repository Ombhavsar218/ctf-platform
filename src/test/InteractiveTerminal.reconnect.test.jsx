import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InteractiveTerminal from '../components/ui/InteractiveTerminal';
import { api } from '../services/api';
import { challengeService } from '../services/challengeService';
import { getWebSocketUrl, TERMINAL_SUBPROTOCOL } from '../services/terminalService';

vi.mock('@xterm/xterm', () => {
  class Terminal {
    constructor() {
      this.cols = 100;
      this.rows = 30;
      this.writes = [];
      this.handlers = {};
      this.disposed = false;
      globalThis.__xtermInstances.push(this);
    }

    loadAddon(addon) { this.addon = addon; }
    open(host) { host.innerHTML = '<div class="xterm-mock"></div>'; }
    focus() {}
    write(text) { this.writes.push(text); }
    writeln(text) { this.writes.push(`${text}\n`); }
    clear() { this.writes = []; }
    resize(cols, rows) { this.cols = cols; this.rows = rows; }
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
    fit() {}
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

const renderTerminal = (instance = INSTANCE) => render(
  <InteractiveTerminal
    challengeId="4"
    instance={instance}
    onClose={vi.fn()}
    onInstanceUnavailable={vi.fn()}
  />,
);

const connectTerminal = async (instance = INSTANCE) => {
  const view = renderTerminal(instance);
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  const socket = MockWebSocket.instances[0];
  await act(async () => {
    socket.open();
    socket.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
  });
  await act(async () => { await Promise.resolve(); });
  return { view, socket, term: globalThis.__xtermInstances[0] };
};

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(challengeService, 'getInstance').mockResolvedValue(INSTANCE);
  vi.spyOn(api, 'post').mockResolvedValue({
    ticket: TICKET,
    url: getWebSocketUrl(),
    subprotocol: TERMINAL_SUBPROTOCOL,
    expiresIn: 30,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InteractiveTerminal reconnection UX', () => {
  it('shows reconnecting, preserves scrollback, and reports the fresh shell', async () => {
    const { socket, term } = await connectTerminal();
    vi.useFakeTimers();
    await act(async () => {
      socket.receiveFrame({ type: 'output', data: window.btoa('previous shell output\n') });
    });
    expect(term.writes).toContain('previous shell output\n');

    await act(async () => { socket.close(1006, 'network_lost'); });
    expect(screen.getByText('Reconnecting')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Reconnecting (1/4)');

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const replacement = MockWebSocket.instances[1];
    expect(replacement.protocols).toEqual([TERMINAL_SUBPROTOCOL, TICKET]);
    expect(screen.queryByText('Connected')).toBeNull();

    await act(async () => {
      replacement.open();
      replacement.receiveFrame({ type: 'status', state: 'connected', rows: 24, cols: 40 });
    });
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(term.writes).toContain('previous shell output\n');
    expect(term.writes).toContain(
      'Connection restored with a new shell. Previous shell process state was lost.\n',
    );
  });

  it('does not retry after the terminal component unmounts', async () => {
    const { view, socket } = await connectTerminal();
    vi.useFakeTimers();
    await act(async () => { socket.close(1006, 'network_lost'); });
    expect(screen.getByText('Reconnecting')).toBeTruthy();

    view.unmount();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(globalThis.__xtermInstances[0].disposed).toBe(true);
  });

  it('stops reconnect attempts when the instance is stopped', async () => {
    const { view, socket } = await connectTerminal();
    vi.useFakeTimers();
    await act(async () => { socket.close(1006, 'network_lost'); });
    expect(screen.getByText('Reconnecting')).toBeTruthy();

    await act(async () => {
      view.rerender(
        <InteractiveTerminal
          challengeId="4"
          instance={{ ...INSTANCE, status: 'stopped' }}
          onClose={vi.fn()}
          onInstanceUnavailable={vi.fn()}
        />,
      );
    });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not retry after a rejected ticket', async () => {
    const { socket } = await connectTerminal();
    vi.useFakeTimers();
    await act(async () => { socket.close(4401, 'invalid_ticket'); });
    expect(screen.getByRole('alert').textContent).toContain('ticket was rejected');
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
