import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChallengeDetails from '../pages/ChallengeDetails';
import { challengeService } from '../services/challengeService';

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));
vi.mock('../components/ui/CheatsheetTab', () => ({ default: () => <div>Cheatsheet</div> }));
vi.mock('../components/ui/InteractiveTerminal', () => ({ default: () => <div>Terminal</div> }));

const baseModeAware = {
  id: 10, title: 'Mode Aware', category: 'Crypto', difficulty: 'Easy', points: 100,
  description: 'desc', scenario: 'scen', objectives: ['o1'], instructions: '',
  author: 'Flaghunt', tags: [], featured: false, trial: false, solves: 1, solved: false,
  has_mode_content: true, instanceMode: 'http', connectionInfo: null, cheatsheet: null,
  hints: [{ id: 1, order: 0, cost: 10, revealed: false, text: '' }],
  files: [], createdAt: '2026-01-01T00:00:00Z', status: 'published',
};
const ordinary = { ...baseModeAware, id: 11, title: 'Ordinary', has_mode_content: false, hints: [] };
const studentContent = { mode: 'student', challenge_id: 10, content: { introduction: 'Intro' }, solution_available: false };
const solutionOk = {
  challenge_id: 10, mode: 'student', solved: true, solution_available: true,
  solution: {
    explanation: 'Because Base64 is encoding',
    walkthrough: ['Step 1', { title: 'Step 2', description: 'Decode it' }],
    expected_result: 'Decoded text',
    learning_takeaways: ['Encoding is reversible'],
  },
};

function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function renderPage(id = '10') {
  return render(<MemoryRouter initialEntries={[`/challenges/${id}`]}><Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes></MemoryRouter>);
}
function studentUser(overrides = {}) { return { id: 1, points: 100, learning_mode: 'student', learningMode: 'student', userType: 'student', ...overrides }; }
const appCtx = (user = studentUser()) => ({ user, isAuthenticated: true, addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(), updateUser: vi.fn() });

describe('Phase 4D solution integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue(appCtx());
    vi.spyOn(challengeService, 'getChallengeById').mockResolvedValue({ ...baseModeAware, hints: baseModeAware.hints.map(h => ({ ...h })) });
    vi.spyOn(challengeService, 'getChallengeContent').mockResolvedValue({ ...studentContent });
    vi.spyOn(challengeService, 'getInstance').mockResolvedValue(null);
    vi.spyOn(challengeService, 'getChallengeSolution').mockResolvedValue({ ...solutionOk });
    vi.spyOn(challengeService, 'submitFlag').mockResolvedValue({ correct: false, alreadySolved: false, points: 0, message: 'Nope' });
  });

  it('authorized student can request solution after explicit action', async () => {
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    expect(challengeService.getChallengeSolution).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    await waitFor(() => expect(challengeService.getChallengeSolution).toHaveBeenCalledWith('10'));
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();
    expect(screen.getByText('Step 1')).toBeTruthy();
    expect(screen.getByText('Decode it')).toBeTruthy();
    expect(screen.getByText('Decoded text')).toBeTruthy();
    expect(screen.getByText('Encoding is reversible')).toBeTruthy();
  });

  it('unsolved user cannot see solution content when backend denies', async () => {
    challengeService.getChallengeSolution.mockRejectedValue({ message: 'Solution content is available only after you solve this challenge in Student Mode.', status: 403 });
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText(/Solution unavailable/i)).toBeTruthy();
    expect(screen.getByText(/solve this challenge in Student Mode/i)).toBeTruthy();
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
  });

  it('competitor mode cannot access solution UI/action for mode-aware challenge', async () => {
    mockUseApp.mockReturnValue(appCtx(studentUser({ learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' })));
    challengeService.getChallengeContent.mockResolvedValue({ mode: 'competitor', challenge_id: 10, content: { objective: 'Do it' }, solution_available: false });
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Mission Brief/i })); });
    expect(screen.queryByRole('button', { name: /View Solution|Retry Solution/i })).toBeNull();
    expect(challengeService.getChallengeSolution).not.toHaveBeenCalled();
  });

  it('frontend solved state alone does not reveal solution content', async () => {
    challengeService.getChallengeById.mockResolvedValue({ ...baseModeAware, solved: true, hints: [] });
    challengeService.getChallengeSolution.mockRejectedValue({ message: 'Solution content is available only after you solve this challenge in Student Mode.', status: 403 });
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
    expect(challengeService.getChallengeSolution).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText(/Solution unavailable/i)).toBeTruthy();
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
  });

  it('ordinary challenges do not show solution action', async () => {
    challengeService.getChallengeById.mockResolvedValue({ ...ordinary });
    renderPage('11');
    await screen.findByText('Ordinary');
    expect(screen.queryByRole('button', { name: /View Solution|Retry Solution/i })).toBeNull();
    expect(challengeService.getChallengeSolution).not.toHaveBeenCalled();
  });

  it('prevents duplicate solution fetch while pending', async () => {
    const d = deferred();
    challengeService.getChallengeSolution.mockReturnValue(d.promise);
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(challengeService.getChallengeSolution).toHaveBeenCalledTimes(1);
    // while loading, no View/Retry button is shown
    expect(screen.queryByRole('button', { name: /View Solution|Retry Solution/i })).toBeNull();
    await act(async () => { d.resolve({ ...solutionOk }); });
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();
  });

  it('handles empty solution response safely', async () => {
    challengeService.getChallengeSolution.mockResolvedValue({ challenge_id: 10, mode: 'student', solved: true, solution_available: true, solution: {} });
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText(/No solution content is available/i)).toBeTruthy();
  });

  it('failed or unauthorized requests clear previously fetched content', async () => {
    challengeService.getChallengeSolution
      .mockResolvedValueOnce({ ...solutionOk })
      .mockRejectedValueOnce({ message: 'Solution content is available only after you solve this challenge in Student Mode.', status: 403 });
    renderPage();
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Refresh Solution/i })); });
    expect(await screen.findByText(/Solution unavailable/i)).toBeTruthy();
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
  });

  it('clears solution content on challenge switch and ignores stale response', async () => {
    const d = deferred();
    challengeService.getChallengeSolution.mockReturnValue(d.promise);
    const { unmount } = renderPage('10');
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    unmount();
    challengeService.getChallengeById.mockResolvedValue({ ...baseModeAware, id: 12, title: 'Another', has_mode_content: true, hints: [] });
    challengeService.getChallengeContent.mockResolvedValue({ mode: 'student', challenge_id: 12, content: { introduction: 'Other' }, solution_available: false });
    renderPage('12');
    expect(await screen.findByText('Another')).toBeTruthy();
    await act(async () => { d.resolve({ ...solutionOk, challenge_id: 10 }); });
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
  });

  it('clears solution content on user switch and mode switch', async () => {
    let ctx = appCtx(studentUser());
    mockUseApp.mockImplementation(() => ctx);
    const { rerender } = renderPage('10');
    await screen.findByText('Mode Aware');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();

    ctx = appCtx(studentUser({ id: 2 }));
    rerender(<MemoryRouter initialEntries={['/challenges/10']}><Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes></MemoryRouter>);
    await screen.findByText('Mode Aware');
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();

    ctx = appCtx(studentUser({ id: 2, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' }));
    challengeService.getChallengeContent.mockResolvedValue({ mode: 'competitor', challenge_id: 10, content: { objective: 'Do it' }, solution_available: false });
    rerender(<MemoryRouter initialEntries={['/challenges/10']}><Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes></MemoryRouter>);
    await screen.findByText('Mode Aware');
    expect(screen.queryByText('Because Base64 is encoding')).toBeNull();
    expect(screen.queryByRole('button', { name: /View Solution|Retry Solution/i })).toBeNull();
  });

  it('submission success does not auto-reveal solution but solution can be fetched explicitly', async () => {
    challengeService.submitFlag.mockResolvedValue({ correct: true, alreadySolved: false, points: 100, hintCost: 0, netPoints: 100, message: 'Correct' });
    renderPage();
    await screen.findByText('Mode Aware');
    fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: 'FLAG{ok}' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Submit Flag/i })); });
    expect(screen.getAllByText(/Challenge Completed!/i).length).toBeGreaterThan(0);
    expect(challengeService.getChallengeSolution).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Learning Guide/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View Solution/i })); });
    expect(await screen.findByText('Because Base64 is encoding')).toBeTruthy();
  });
});
