import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { normaliseUser, authService } from '../services/authService';
import { api } from '../services/api';
import Settings from '../pages/Settings';
import Challenges from '../pages/Challenges';
import { useApp } from '../context/AppContext';
import { challengeService } from '../services/challengeService';

vi.mock('../context/AppContext', () => ({
  useApp: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  tokenStore: {
    getAccess: vi.fn(() => 'access-token'),
    getRefresh: vi.fn(() => 'refresh-token'),
    setTokens: vi.fn(),
    setAccess: vi.fn(),
    clear: vi.fn(),
  },
  refreshAccessToken: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message, { status = 0, data = null } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
}));

vi.mock('../services/challengeService', () => ({
  challengeService: {
    getChallenges: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Phase 4A learning mode integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    challengeService.getChallenges.mockResolvedValue([]);
  });

  it('normalizes learning_mode from /auth/me and derives backward-compatible userType', () => {
    const user = normaliseUser({
      id: 7,
      username: 'alice',
      email: 'alice@example.com',
      learning_mode: 'student',
      onboarding: { userType: 'competitor' },
    });

    expect(user.learning_mode).toBe('student');
    expect(user.learningMode).toBe('student');
    expect(user.userType).toBe('student');
  });

  it('keeps userType as alias when only learning_mode is provided', () => {
    const user = normaliseUser({ id: 1, username: 'bob', learning_mode: 'competitor' });
    expect(user.userType).toBe('competitor');
    expect(user.learningMode).toBe('competitor');
  });

  it('sends learning_mode through preferences updates', async () => {
    api.patch.mockResolvedValue({
      id: 7,
      username: 'alice',
      email: 'alice@example.com',
      learning_mode: 'student',
      notification_prefs: {},
      profile_visibility: 'public',
    });

    const updated = await authService.updatePreferences({ learningMode: 'student' });

    expect(api.patch).toHaveBeenCalledWith('/auth/me/preferences/', { learning_mode: 'student' });
    expect(updated.learning_mode).toBe('student');
    expect(updated.userType).toBe('student');
  });

  it('Settings loads persisted mode and changes it through backend', async () => {
    const updateUser = vi.fn();
    useApp.mockReturnValue({
      user: {
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        learning_mode: 'competitor',
        learningMode: 'competitor',
        userType: 'competitor',
        profileVisibility: 'public',
        notifPrefs: {},
      },
      updateUser,
      logout: vi.fn(),
    });

    api.patch.mockResolvedValue({
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      learning_mode: 'student',
      notification_prefs: {},
      profile_visibility: 'public',
    });

    renderWithRouter(<Settings />);

    expect(screen.getAllByText('Student Mode').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Student Mode/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/auth/me/preferences/', { learning_mode: 'student' });
    });
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ learning_mode: 'student', userType: 'student' }));
  });

  it('Settings does not show false success when API update fails', async () => {
    const { toast } = await import('react-toastify');
    const updateUser = vi.fn();
    useApp.mockReturnValue({
      user: {
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        learning_mode: 'competitor',
        learningMode: 'competitor',
        userType: 'competitor',
        profileVisibility: 'public',
        notifPrefs: {},
      },
      updateUser,
      logout: vi.fn(),
    });

    api.patch.mockRejectedValue(new Error('Network failure'));

    renderWithRouter(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /Student Mode/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('Challenges page persists mode change through preferences API', async () => {
    const updateUser = vi.fn();
    useApp.mockReturnValue({
      user: {
        id: 1,
        username: 'alice',
        learning_mode: 'competitor',
        learningMode: 'competitor',
        userType: 'competitor',
      },
      updateUser,
    });

    api.patch.mockResolvedValue({
      id: 1,
      username: 'alice',
      learning_mode: 'student',
    });

    renderWithRouter(<Challenges />);

    await waitFor(() => expect(challengeService.getChallenges).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Student Mode/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/auth/me/preferences/', { learning_mode: 'student' });
    });
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ learning_mode: 'student' }));
  });

  it('Challenges page handles API failure without false success', async () => {
    const { toast } = await import('react-toastify');
    const updateUser = vi.fn();
    useApp.mockReturnValue({
      user: {
        id: 1,
        username: 'alice',
        learning_mode: 'competitor',
        learningMode: 'competitor',
        userType: 'competitor',
      },
      updateUser,
    });
    api.patch.mockRejectedValue(new Error('Nope'));

    renderWithRouter(<Challenges />);
    await waitFor(() => expect(challengeService.getChallenges).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Student Mode/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('restores authoritative learning_mode from /auth/me on session restore', async () => {
    api.get.mockResolvedValue({
      id: 9,
      username: 'restored',
      email: 'r@example.com',
      learning_mode: 'student',
    });

    const user = await authService.getCurrentUser({ refresh: false });
    expect(api.get).toHaveBeenCalledWith('/auth/me/');
    expect(user.learning_mode).toBe('student');
    expect(user.userType).toBe('student');
  });
});
