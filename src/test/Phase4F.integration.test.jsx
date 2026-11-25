import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Onboarding from '../pages/Onboarding';
import { onboardingService } from '../services/onboardingService';

const mockUpdateUser = vi.fn();
const mockNavigate = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => ({ user: { id: 1, username: 'u' }, updateUser: mockUpdateUser }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Phase 4F integration regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(onboardingService, 'saveOnboarding').mockResolvedValue({
      onboardingCompleted: true,
      onboarding: { skillLevel: 'beginner', teamInterest: 'red', focusAreas: ['Web Exploitation'], purpose: 'practice', experienceType: 'student', userType: 'student' },
      learning_mode: 'student',
      learning_mode_user_selected: false,
    });
  });

  it('completes onboarding without crashing and applies authoritative backend response', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Get Started/i })); });
    await act(async () => { fireEvent.click(screen.getByText('Beginner')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next/i })); });
    await act(async () => { fireEvent.click(screen.getByText('Red Team')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next/i })); });
    await act(async () => { fireEvent.click(screen.getByText('Web Security')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next/i })); });
    await act(async () => { fireEvent.click(screen.getByText('Practice & Learn')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next/i })); });
    await act(async () => { fireEvent.click(screen.getByText('Student')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Complete Setup/i })); });

    await waitFor(() => expect(onboardingService.saveOnboarding).toHaveBeenCalled());
    expect(mockUpdateUser).toHaveBeenCalled();
    const updatedArg = mockUpdateUser.mock.calls[0][0];
    expect(updatedArg.learning_mode).toBe('student');
    expect(updatedArg.onboardingCompleted).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
