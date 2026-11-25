import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChallengeDetails from '../pages/ChallengeDetails';
import { challengeService } from '../services/challengeService';

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../components/ui/CheatsheetTab', () => ({ default: () => <div>Cheatsheet</div> }));
vi.mock('../components/ui/HintCard', () => ({ default: ({ hint }) => <div>{hint?.text || 'Hint'}</div> }));
vi.mock('../components/ui/InteractiveTerminal', () => ({ default: () => <div>Terminal</div> }));

const baseChallenge = {
  id: 10,
  title: 'Mode Aware Challenge',
  category: 'Crypto',
  difficulty: 'Easy',
  points: 100,
  description: 'Base description',
  scenario: 'Base scenario',
  objectives: ['Base objective'],
  instructions: 'Base instructions',
  author: 'Flaghunt',
  tags: ['crypto'],
  featured: false,
  trial: false,
  solves: 1,
  solved: false,
  has_mode_content: true,
  instanceMode: 'http',
  connectionInfo: null,
  cheatsheet: null,
  hints: [],
  files: [],
  createdAt: '2026-01-01T00:00:00Z',
  status: 'published',
};

const studentContent = {
  mode: 'student',
  challenge_id: 10,
  solution_available: false,
  content: {
    introduction: 'Student intro',
    scenario: 'Student scenario',
    learning_objectives: ['Learn A', 'Learn B'],
    tasks: [{ title: 'Task 1', description: 'Do the thing' }],
    checkpoints: ['Checkpoint 1'],
    guidance: ['Hint-like guidance'],
    review_questions: ['What did you learn?'],
    common_mistakes: ['Mistake 1'],
    remediation_guidance: ['Fix it'],
  },
};

const competitorContent = {
  mode: 'competitor',
  challenge_id: 10,
  solution_available: false,
  content: {
    challenge_rules: 'No cheating',
    objective: 'Capture the flag',
    time_limit: '60 minutes',
    submission_instructions: 'Submit FLAG{...}',
  },
};

function renderPage(id = '10') {
  return render(
    <MemoryRouter initialEntries={[`/challenges/${id}`]}>
      <Routes>
        <Route path="/challenges/:id" element={<ChallengeDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('Phase 4B mode-aware challenge detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue({
      user: { id: 1, learning_mode: 'student', learningMode: 'student', userType: 'student' },
      addPoints: vi.fn(),
      refreshStats: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });
    vi.spyOn(challengeService, 'getChallengeById').mockResolvedValue({ ...baseChallenge });
    vi.spyOn(challengeService, 'getChallengeContent').mockResolvedValue({ ...studentContent });
    vi.spyOn(challengeService, 'getInstance').mockResolvedValue(null);
  });

  it('renders student mode content', async () => {
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalledWith('10'));
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Student intro')).toBeTruthy();
    expect(screen.getByText('Student scenario')).toBeTruthy();
    expect(screen.getByText('Learn A')).toBeTruthy();
    expect(screen.getByText('Task 1')).toBeTruthy();
    expect(screen.getByText('Checkpoint 1')).toBeTruthy();
    expect(screen.getByText('Hint-like guidance')).toBeTruthy();
    expect(screen.getByText('What did you learn?')).toBeTruthy();
    expect(screen.getByText('Mistake 1')).toBeTruthy();
    expect(screen.getByText('Fix it')).toBeTruthy();
  });

  it('renders competitor mode content', async () => {
    mockUseApp.mockReturnValue({
      user: { id: 1, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(),
    });
    challengeService.getChallengeContent.mockResolvedValue({ ...competitorContent });
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalled());
    await fireEventClick(await screen.findByRole('button', { name: 'Mission Brief' }));
    expect(await screen.findByText('No cheating')).toBeTruthy();
    expect(screen.getByText('Capture the flag')).toBeTruthy();
    expect(screen.getByText('60 minutes')).toBeTruthy();
    expect(screen.getByText('Submit FLAG{...}')).toBeTruthy();
  });

  it('does not request mode content for ordinary challenges', async () => {
    challengeService.getChallengeById.mockResolvedValue({ ...baseChallenge, has_mode_content: false });
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeById).toHaveBeenCalled());
    expect(challengeService.getChallengeContent).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Learning Guide|Mission Brief|Mode Content/ })).toBeNull();
  });

  it('missing or invalid indicator does not trigger unnecessary request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    challengeService.getChallengeById.mockResolvedValue({ ...baseChallenge, has_mode_content: undefined });
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeById).toHaveBeenCalled());
    expect(challengeService.getChallengeContent).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('handles empty optional fields', async () => {
    challengeService.getChallengeContent.mockResolvedValue({
      mode: 'student', challenge_id: 10, solution_available: false,
      content: { introduction: 'Only intro', scenario: '', learning_objectives: [], tasks: [] },
    });
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Only intro')).toBeTruthy();
    expect(screen.queryByText('Scenario')).toBeNull();
  });

  it('shows loading and API error states', async () => {
    const d = deferred();
    challengeService.getChallengeContent.mockReturnValue(d.promise);
    renderPage();
    await screen.findByText('Mode Aware Challenge');
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Loading mode content...')).toBeTruthy();
    await act(async () => { d.reject(new Error('Boom')); });
    expect(await screen.findByText('Mode content unavailable')).toBeTruthy();
    expect(screen.getByText('Boom')).toBeTruthy();
  });

  it('refetches content after persisted learning mode change', async () => {
    const { rerender } = renderPage('10');
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalledTimes(1));

    mockUseApp.mockReturnValue({
      user: { id: 1, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(),
    });
    challengeService.getChallengeContent.mockResolvedValue({ ...competitorContent });
    rerender(
      <MemoryRouter initialEntries={['/challenges/10']}>
        <Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalledTimes(2));
    await fireEventClick(await screen.findByRole('button', { name: 'Mission Brief' }));
    expect(await screen.findByText('No cheating')).toBeTruthy();
  });

  it('clears previous content when challenge changes', async () => {
    challengeService.getChallengeById.mockImplementation((id) => Promise.resolve({ ...baseChallenge, id: Number(id), title: `Challenge ${id}` }));
    challengeService.getChallengeContent.mockImplementation((id) => Promise.resolve({ ...studentContent, challenge_id: Number(id), content: { introduction: `Intro ${id}` } }));

    const { unmount } = renderPage('10');
    await screen.findByText('Challenge 10');
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Intro 10')).toBeTruthy();

    unmount();
    renderPage('11');
    await screen.findByText('Challenge 11');
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalledWith('11'));
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Intro 11')).toBeTruthy();
    expect(screen.queryByText('Intro 10')).toBeNull();
  });

  it('clears previous content when authenticated user changes', async () => {
    const { rerender } = renderPage('10');
    await screen.findByText('Mode Aware Challenge');
    await fireEventClick(await screen.findByRole('button', { name: 'Learning Guide' }));
    expect(await screen.findByText('Student intro')).toBeTruthy();

    mockUseApp.mockReturnValue({
      user: { id: 2, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(),
    });
    challengeService.getChallengeContent.mockResolvedValue({ ...competitorContent, content: { challenge_rules: 'User2 rules' } });
    rerender(
      <MemoryRouter initialEntries={['/challenges/10']}>
        <Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenLastCalledWith('10'));
    await fireEventClick(await screen.findByRole('button', { name: 'Mission Brief' }));
    expect(await screen.findByText('User2 rules')).toBeTruthy();
    expect(screen.queryByText('Student intro')).toBeNull();
  });

  it('stale requests cannot overwrite newer results', async () => {
    const slow = deferred();
    challengeService.getChallengeContent
      .mockReturnValueOnce(slow.promise)
      .mockImplementation(async () => ({ ...competitorContent, content: { challenge_rules: 'Fresh rules' } }));

    const { rerender } = renderPage('10');
    await screen.findByText('Mode Aware Challenge');
    await waitFor(() => expect(challengeService.getChallengeContent).toHaveBeenCalled());

    mockUseApp.mockReturnValue({
      user: { id: 1, learning_mode: 'competitor', learningMode: 'competitor', userType: 'competitor' },
      addPoints: vi.fn(), refreshStats: vi.fn(), refreshUnreadCount: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={['/challenges/10']}>
        <Routes><Route path="/challenges/:id" element={<ChallengeDetails />} /></Routes>
      </MemoryRouter>
    );

    await fireEventClick(await screen.findByRole('button', { name: 'Mission Brief' }));
    expect(await screen.findByText('Fresh rules')).toBeTruthy();

    await act(async () => { slow.resolve({ ...studentContent, content: { introduction: 'Stale intro' } }); });
    await waitFor(() => {
      expect(screen.queryByText('Stale intro')).toBeNull();
      expect(screen.getByText('Fresh rules')).toBeTruthy();
    });
  });

  it('preserves existing ordinary challenge behavior', async () => {
    challengeService.getChallengeById.mockResolvedValue({ ...baseChallenge, has_mode_content: false, title: 'Ordinary Challenge' });
    renderPage();
    await screen.findByText('Ordinary Challenge');
    expect(screen.getByText('Base description')).toBeTruthy();
    expect(challengeService.getChallengeContent).not.toHaveBeenCalled();
  });
});

function fireEventClick(el) {
  return act(async () => { el.click(); });
}
