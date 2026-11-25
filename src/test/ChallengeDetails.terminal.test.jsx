import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChallengeDetails from '../pages/ChallengeDetails';
import { api } from '../services/api';
import { challengeService } from '../services/challengeService';
import { TERMINAL_SUBPROTOCOL } from '../services/terminalService';

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    addPoints: vi.fn(),
    refreshStats: vi.fn(),
    refreshUnreadCount: vi.fn(),
  }),
}));

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
    focus() {}
    write(text) { this.writes.push(text); }
    writeln(text) { this.writes.push(`${text}\n`); }
    clear() { this.writes = []; }
    resize(cols, rows) { this.cols = cols; this.rows = rows; this.handlers.resize?.({ cols, rows }); }
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
const TICKET = 'b'.repeat(43);

const CHALLENGE = {
  id: 4,
  title: 'Shell Challenge',
  category: 'Pwn',
  difficulty: 'Easy',
  points: 100,
  description: 'A real shell challenge.',
  scenario: '',
  objectives: [],
  instructions: '',
  author: 'Flaghunt',
  tags: [],
  featured: false,
  trial: false,
  solves: 3,
  solved: false,
  instanceMode: 'terminal',
  connectionInfo: null,
  cheatsheet: null,
  hints: [],
  files: [],
  createdAt: '2026-01-01T00:00:00Z',
  status: 'published',
};

const TERMINAL_INSTANCE = {
  id: 7,
  challengeId: 4,
  status: 'running',
  expiresAt: Date.now() + 600000,
  remainingSeconds: 600,
  connection: { type: 'terminal', host: '', port: null, target: '', url: '' },
  command: '',
  failureReason: '',
};

const HTTP_INSTANCE = {
  ...TERMINAL_INSTANCE,
  id: 8,
  connection: { type: 'http', host: '127.0.0.1', port: 3000, target: '127.0.0.1:3000', url: 'http://127.0.0.1:3000' },
  command: 'http://127.0.0.1:3000',
};

const renderPage = async ({ mode = 'terminal', instance = TERMINAL_INSTANCE } = {}) => {
  challengeService.getChallengeById.mockResolvedValue({ ...CHALLENGE, instanceMode: mode });
  challengeService.getInstance.mockResolvedValue(instance);
  render(
    <MemoryRouter initialEntries={['/challenges/4']}>
      <Routes>
        <Route path="/challenges/:id" element={<ChallengeDetails />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('Shell Challenge');
  await waitFor(() => expect(challengeService.getInstance).toHaveBeenCalled());
};

const openTerminal = async () => {
  await act(async () => {
    screen.getByRole('button', { name: /Open Terminal/i }).click();
  });
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  return MockWebSocket.instances[0];
};

beforeEach(() => {
  vi.spyOn(challengeService, 'getChallengeById');
  vi.spyOn(challengeService, 'getInstance');
  vi.spyOn(challengeService, 'startInstance').mockResolvedValue(TERMINAL_INSTANCE);
  vi.spyOn(challengeService, 'stopInstance').mockResolvedValue(null);
  vi.spyOn(api, 'post').mockResolvedValue({
    ticket: TICKET,
    url: 'ws://api.example.test/ws/challenges/instances/terminal/',
    subprotocol: TERMINAL_SUBPROTOCOL,
    expiresIn: 30,
  });
});

describe('ChallengeDetails terminal-mode integration', () => {
  it('renders a real terminal only for terminal-mode challenges', async () => {
    await renderPage({ mode: 'terminal' });
    expect(screen.getByRole('button', { name: /Open Terminal/i })).toBeTruthy();

    await openTerminal();
    await waitFor(() => expect(globalThis.__xtermInstances).toHaveLength(1));
    expect(screen.getByLabelText('Challenge terminal')).toBeTruthy();
  });

  it('keeps the existing HTTP connection UI unchanged', async () => {
    await renderPage({ mode: 'http', instance: HTTP_INSTANCE });
    expect(screen.queryByRole('button', { name: /Open Terminal/i })).toBeNull();
    const openLink = screen.getByRole('link', { name: /Open/i });
    expect(openLink.getAttribute('href')).toBe('http://127.0.0.1:3000');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not request a ticket until the explicit Open Terminal action', async () => {
    await renderPage({ mode: 'terminal' });
    expect(api.post).not.toHaveBeenCalled();
    await openTerminal();
    expect(api.post).toHaveBeenCalledWith('/challenges/instances/terminal-ticket/', {});
  });

  it('closing the terminal closes the socket without calling Stop Instance', async () => {
    await renderPage({ mode: 'terminal' });
    const socket = await openTerminal();
    await act(async () => {
      screen.getByRole('button', { name: 'Close terminal' }).click();
    });
    expect(socket.readyState).toBe(3);
    expect(challengeService.stopInstance).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Challenge terminal')).toBeNull());
  });

  it('preserves the HTTP Stop Instance flow', async () => {
    await renderPage({ mode: 'http', instance: HTTP_INSTANCE });
    await act(async () => {
      screen.getByRole('button', { name: /Stop/i }).click();
    });
    await waitFor(() => expect(challengeService.stopInstance).toHaveBeenCalled());
  });

  it('preserves the existing Start Instance flow', async () => {
    await renderPage({ mode: 'http', instance: null });
    await act(async () => {
      screen.getByRole('button', { name: /Start Instance/i }).click();
    });
    await waitFor(() => expect(challengeService.startInstance).toHaveBeenCalled());
  });
});
