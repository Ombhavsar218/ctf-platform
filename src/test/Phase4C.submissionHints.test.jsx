import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChallengeDetails from '../pages/ChallengeDetails';
import { challengeService } from '../services/challengeService';

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../components/ui/CheatsheetTab', () => ({ default: () => <div>Cheatsheet</div> }));
vi.mock('../components/ui/InteractiveTerminal', () => ({ default: () => <div>Terminal</div> }));

const baseChallenge = {
  id: 10,
  title: 'Phase4C Challenge',
  category: 'Crypto',
  difficulty: 'Easy',
  points: 100,
  description: 'desc',
  scenario: 'scen',
  objectives: [],
  instructions: '',
  author: 'Flaghunt',
  tags: [],
  featured: false,
  trial: false,
  solves: 1,
  solved: false,
  has_mode_content: true,
  instanceMode: 'http',
  connectionInfo: null,
  cheatsheet: null,
  hints: [
    { id: 1, order: 0, cost: 10, revealed: false, text: '' },
    { id: 2, order: 1, cost: 20, revealed: false, text: '' },
  ],
  files: [],
  createdAt: '2026-01-01T00:00:00Z',
  status: 'published',
};

const ordinaryChallenge = {
  ...baseChallenge,
  id: 11,
  title: 'Ordinary Challenge',
  has_mode_content: false,
  hints: [
    { id: 101, order: 0, cost: 5, revealed: false, text: '' },
    { id: 102, order: 1, cost: 15, revealed: true, text: 'Revealed plain hint' },
  ],
};

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderPage(id = '10') {
  return render(
    <MemoryRouter initialEntries={[`/challenges/${id}`]}>
      <Routes>
        <Route path="/challenges/:id" element={<ChallengeDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Phase 4C submission and hints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue({
      user: { id: 1, points: 100, learning_mode: 'student', learningMode: 'student', userType: 'student' },
      isAuthenticated: true,
      addPoints: vi.fn(),
      refreshStats: vi.fn(),
      refreshUnreadCount: vi.fn(),
      updateUser: vi.fn(),
    });
    vi.spyOn(challengeService, 'getChallengeById').mockResolvedValue({ ...baseChallenge, hints: baseChallenge.hints.map(h => ({ ...h })) });
    vi.spyOn(challengeService, 'getChallengeContent').mockResolvedValue({ mode: 'student', challenge_id: 10, content: {}, solution_available: false });
    vi.spyOn(challengeService, 'getInstance').mockResolvedValue(null);
    vi.spyOn(challengeService, 'submitFlag').mockResolvedValue({ correct: true, alreadySolved: false, points: 100, hintCost: 0, netPoints: 100, message: 'Correct' });
    vi.spyOn(challengeService, 'revealHint').mockResolvedValue({ revealed: true, alreadyUnlocked: false, hint: { id: 1, order: 0, cost: 10, text: 'Hint text 1' }, pointsSpent: 10, remainingPoints: 90, message: 'Hint unlocked. -10 points.' });
  });

  it('handles successful submission and updates solved state only after success', async () => {
    const app = mockUseApp();
    renderPage();
    await screen.findByText('Phase4C Challenge');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'FLAG{ok}' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Submit Flag/i })); });
    await waitFor(() => expect(challengeService.submitFlag).toHaveBeenCalledWith('10', 'FLAG{ok}'));
    expect(app.addPoints).toHaveBeenCalledWith(100);
    expect(app.refreshStats).toHaveBeenCalled();
    expect(screen.getAllByText(/Challenge Completed!/i).length).toBeGreaterThan(0);
  });

  it('handles incorrect flag response', async () => {
    challengeService.submitFlag.mockResolvedValue({ correct: false, alreadySolved: false, points: 0, message: 'Incorrect flag. Keep investigating.' });
    renderPage();
    await screen.findByText('Phase4C Challenge');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'CTF{bad}' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Submit Flag/i })); });
    expect(screen.getAllByText(/Incorrect Flag/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Keep investigating/i)).toBeTruthy();
  });

  it('handles submission network/API failure', async () => {
    challengeService.submitFlag.mockRejectedValue(new Error('Network down'));
    renderPage();
    await screen.findByText('Phase4C Challenge');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'CTF{x}' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Submit Flag/i })); });
    expect(await screen.findByText(/Submission Failed/i)).toBeTruthy();
    expect(screen.getByText(/Network down/i)).toBeTruthy();
  });

  it('prevents duplicate submissions while request pending', async () => {
    const d = deferred();
    challengeService.submitFlag.mockReturnValue(d.promise);
    renderPage();
    await screen.findByText('Phase4C Challenge');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'CTF{x}' } });
    const btn = screen.getByRole('button', { name: /Submit Flag/i });
    await act(async () => { fireEvent.click(btn); });
    await act(async () => { fireEvent.click(btn); });
    expect(challengeService.submitFlag).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve({ correct: false, alreadySolved: false, points: 0, message: 'Nope' }); });
  });

  it('does not update solved state before confirmed success', async () => {
    const app = mockUseApp();
    const d = deferred();
    challengeService.submitFlag.mockReturnValue(d.promise);
    renderPage();
    await screen.findByText('Phase4C Challenge');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'CTF{x}' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Submit Flag/i })); });
    expect(app.addPoints).not.toHaveBeenCalled();
    expect(app.refreshStats).not.toHaveBeenCalled();
    await act(async () => { d.resolve({ correct: false, alreadySolved: false, points: 0, message: 'Nope' }); });
  });

  it('student mode renders hints, supports progressive unlock and backend cost', async () => {
    renderPage();
    await screen.findByText('Phase4C Challenge');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hints \(2\)/i })); });
    expect(await screen.findByText(/Hint #1/i)).toBeTruthy();
    expect(screen.getByText(/Reveal \(-10 pts\)/i)).toBeTruthy();
    // second hint should be progression locked until first revealed
    expect(screen.getByText(/Unlock previous hint first/i)).toBeTruthy();
  });

  it('unlocks hint only after backend success and does not deduct points locally before success', async () => {
    const app = mockUseApp();
    const d = deferred();
    challengeService.revealHint.mockReturnValue(d.promise);
    renderPage();
    await screen.findByText('Phase4C Challenge');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hints \(2\)/i })); });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Reveal \(-10 pts\)/i })); });
    expect(app.updateUser).not.toHaveBeenCalled();
    await act(async () => { d.resolve({ revealed: true, alreadyUnlocked: false, hint: { id: 1, order: 0, cost: 10, text: 'Hint text 1' }, pointsSpent: 10, remainingPoints: 90, message: 'ok' }); });
    await waitFor(() => expect(app.updateUser).toHaveBeenCalledWith({ points: 90 }));
    expect(await screen.findByText('Hint text 1')).toBeTruthy();
  });

  it('shows insufficient points / API errors for hint unlock', async () => {
    challengeService.revealHint.mockRejectedValue({ message: 'Not enough points to unlock this hint. It costs 10 and you have 0.', status: 400 });
    renderPage();
    await screen.findByText('Phase4C Challenge');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hints \(2\)/i })); });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Reveal \(-10 pts\)/i })); });
    expect(await screen.findByText(/Not enough points/i)).toBeTruthy();
  });

  it('competitor mode-aware challenge hides hints and makes no hint requests', async () => {
    mockUseApp.mockReturnValue({
      user: { id: 1, points: 100, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      isAuthenticated: true, addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(), updateUser: vi.fn(),
    });
    challengeService.getChallengeById.mockResolvedValue({ ...baseChallenge, hints: [] });
    challengeService.getChallengeContent.mockResolvedValue({ mode: 'competitor', challenge_id: 10, content: { objective: 'Go' }, solution_available: false });
    renderPage();
    await screen.findByText('Phase4C Challenge');
    expect(screen.queryByRole('button', { name: /Hints/i })).toBeNull();
    expect(challengeService.revealHint).not.toHaveBeenCalled();
    expect(screen.queryByText(/Reveal \(/i)).toBeNull();
  });

  it('ordinary challenge hint behavior remains intact', async () => {
    mockUseApp.mockReturnValue({
      user: { id: 1, points: 100, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      isAuthenticated: true, addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(), updateUser: vi.fn(),
    });
    challengeService.getChallengeById.mockResolvedValue({ ...ordinaryChallenge, hints: ordinaryChallenge.hints.map(h => ({ ...h })) });
    renderPage('11');
    await screen.findByText('Ordinary Challenge');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hints \(2\)/i })); });
    expect(await screen.findByText(/Reveal \(-5 pts\)/i)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText(/Hint #2/i)); });
    expect(await screen.findByText(/Revealed plain hint/i)).toBeTruthy();
  });

  it('ignores stale challenge responses after id changes', async () => {
    const d1 = deferred();
    const c1 = { ...baseChallenge, id: 10, title: 'Challenge One' };
    const c2 = { ...ordinaryChallenge, id: 11, title: 'Challenge Two', has_mode_content: false, hints: [{ id: 101, order: 0, cost: 5, revealed: true, text: 'C2 hint' }] };
    challengeService.getChallengeById.mockImplementation((id) => {
      if (id === '10') return d1.promise;
      return Promise.resolve({ ...c2, hints: c2.hints.map(h => ({ ...h })) });
    });

    const { unmount } = renderPage('10');
    unmount();
    renderPage('11');
    expect(await screen.findByText('Challenge Two')).toBeTruthy();
    await act(async () => { d1.resolve({ ...c1, hints: c1.hints.map(h => ({ ...h })) }); });
    expect(screen.queryByText('Challenge One')).toBeNull();
  });

  it('mode switch re-evaluates hints and competitor mode shows no hint controls/text', async () => {
    let appState = {
      user: { id: 1, points: 100, learning_mode: 'student', learningMode: 'student', userType: 'student' },
      isAuthenticated: true, addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(), updateUser: vi.fn(),
    };
    mockUseApp.mockImplementation(() => appState);
    challengeService.getChallengeById.mockImplementation(async () => (
      appState.user.learning_mode === 'student'
        ? { ...baseChallenge, hints: [{ id: 1, order: 0, cost: 10, revealed: true, text: 'Student secret hint' }] }
        : { ...baseChallenge, hints: [] }
    ));
    challengeService.getChallengeContent.mockImplementation(async () => (
      appState.user.learning_mode === 'student'
        ? { mode: 'student', challenge_id: 10, content: {}, solution_available: false }
        : { mode: 'competitor', challenge_id: 10, content: {}, solution_available: false }
    ));

    const { rerender } = renderPage('10');
    await screen.findByText('Phase4C Challenge');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hints \(1\)/i })); });
    await act(async () => { fireEvent.click(screen.getByText(/Hint #1/i)); });
    expect(await screen.findByText('Student secret hint')).toBeTruthy();

    appState = {
      ...appState,
      user: { ...appState.user, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
    };
    rerender(
      <MemoryRouter initialEntries={['/challenges/10']}>
        <Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByText('Phase4C Challenge');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Hints/i })).toBeNull());
    expect(screen.queryByText('Student secret hint')).toBeNull();
    expect(screen.queryByText(/Reveal \(/i)).toBeNull();
    expect(challengeService.revealHint).not.toHaveBeenCalled();
  });
});
