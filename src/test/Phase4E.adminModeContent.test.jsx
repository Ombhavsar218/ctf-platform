import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CreateChallenge from '../pages/admin/CreateChallenge';
import ManageChallenges from '../pages/admin/ManageChallenges';
import { challengeService } from '../services/challengeService';

vi.mock('react-toastify', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const categories = [{ id: 1, name: 'Web', slug: 'web', icon: 'Globe' }, { id: 2, name: 'Crypto', slug: 'crypto', icon: 'Lock' }];

const baseAdminChallenge = {
  id: 7,
  title: 'Existing',
  category: 'Web',
  difficulty: 'Easy',
  points: 100,
  description: 'Desc',
  scenario: '',
  objectives: ['Obj'],
  instructions: '',
  author: 'Admin',
  tags: ['web'],
  featured: false,
  trial: false,
  solves: 0,
  solved: false,
  has_mode_content: true,
  connectionInfo: null,
  cheatsheet: '',
  hints: [{ id: 1, text: 'Hint 1', cost: 10 }],
  files: [],
  createdAt: '2026-01-01',
  status: 'draft',
  has_flag: true,
  flag_note: 'note',
  publishAt: '',
  runtime_enabled: false,
  runtime_image: '',
  runtime_command: '',
  runtime_connection_type: 'http',
  runtime_internal_port: '',
  runtime_cpu_limit: 0.5,
  runtime_memory_mb: 256,
  runtime_pids_limit: 64,
  runtime_read_only: true,
  runtime_duration_minutes: 60,
  mode_content: {
    student: { introduction: 'S intro', learning_objectives: ['LO1'], tasks: [{ title: 'T1', description: 'D1' }] },
    competitor: { objective: 'C obj', challenge_rules: ['Rule 1'] },
    solution: { explanation: 'Explain', walkthrough: [{ title: 'Step', description: 'Do it' }], learning_takeaways: ['Takeaway'] },
  },
};

function renderCreate(initialEntry = '/admin/challenges/new', state) {
  const entries = state ? [{ pathname: initialEntry, state }] : [initialEntry];
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/admin/challenges/new" element={<CreateChallenge />} />
        <Route path="/admin/challenges/:id/edit" element={<CreateChallenge />} />
        <Route path="/admin/challenges" element={<div>MANAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderManage() {
  return render(
    <MemoryRouter initialEntries={['/admin/challenges']}>
      <Routes>
        <Route path="/admin/challenges" element={<ManageChallenges />} />
        <Route path="/admin/challenges/new" element={<div>CREATE_PAGE</div>} />
        <Route path="/admin/challenges/:id/edit" element={<div>EDIT_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function fieldInputByLabel(label) {
  const labelEl = screen.getAllByText(label).find(el => el.style?.fontWeight === '600' || el.textContent === label);
  const container = labelEl?.closest('div')?.parentElement;
  return container?.querySelector('textarea, input, select');
}

async function fillRequiredCreateFields({ flag = 'CTF{test_flag}' } = {}) {
  await screen.findByText('Basic Info');
  fireEvent.change(screen.getByPlaceholderText('e.g. SQL Injection 101'), { target: { value: 'New Challenge' } });
  fireEvent.change(screen.getByPlaceholderText('A concise description of what this challenge is about.'), { target: { value: 'Desc' } });
  fireEvent.change(screen.getByPlaceholderText('Your handle'), { target: { value: 'Author' } });
  fireEvent.click(screen.getByRole('button', { name: 'Flag & Hints' }));
  fireEvent.change(screen.getByPlaceholderText('CTF{...} or FLAG{...}'), { target: { value: flag } });
}

describe('Phase 4E admin mode content authoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(challengeService, 'getCategories').mockResolvedValue(categories);
    vi.spyOn(challengeService, 'getChallengeByIdAdmin').mockResolvedValue(JSON.parse(JSON.stringify(baseAdminChallenge)));
    vi.spyOn(challengeService, 'createChallenge').mockResolvedValue({ id: 99 });
    vi.spyOn(challengeService, 'updateChallenge').mockResolvedValue({ id: 7 });
    vi.spyOn(challengeService, 'uploadAttachment').mockResolvedValue({});
    vi.spyOn(challengeService, 'getAllChallenges').mockResolvedValue([{ ...baseAdminChallenge, createdAt: '2026-01-01' }]);
    vi.spyOn(challengeService, 'deleteChallenge').mockResolvedValue({});
    vi.spyOn(challengeService, 'setChallengeStatus').mockResolvedValue({});
  });

  it('creates ordinary challenge without mode_content', async () => {
    renderCreate();
    await fillRequiredCreateFields();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    await waitFor(() => expect(challengeService.createChallenge).toHaveBeenCalled());
    const payload = challengeService.createChallenge.mock.calls[0][0];
    expect(payload.mode_content).toBeUndefined();
    expect(payload.flag).toBe('CTF{test_flag}');
  });

  it('creates mode-aware challenge with all three sections and correct schema', async () => {
    renderCreate();
    await fillRequiredCreateFields();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    fireEvent.change(fieldInputByLabel('Introduction'), { target: { value: 'Student intro' } });
    fireEvent.change(fieldInputByLabel('Objective'), { target: { value: 'Comp objective' } });
    fireEvent.change(fieldInputByLabel('Explanation'), { target: { value: 'Solution explanation' } });

    // Add learning objective in Student Mode section
    const loLabel = screen.getAllByText('Learning Objectives').find(el => el.textContent === 'Learning Objectives');
    const loField = loLabel.closest('div');
    await act(async () => { fireEvent.click(within(loField).getByRole('button', { name: /Add Objective/i })); });
    const loInput = loField.querySelector('input.form-control');
    fireEvent.change(loInput, { target: { value: 'Learn X' } });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    await waitFor(() => expect(challengeService.createChallenge).toHaveBeenCalled());
    const payload = challengeService.createChallenge.mock.calls[0][0];
    expect(payload.mode_content.student.introduction).toBe('Student intro');
    expect(payload.mode_content.student.learning_objectives).toEqual(['Learn X']);
    expect(payload.mode_content.competitor.objective).toBe('Comp objective');
    expect(payload.mode_content.solution.explanation).toBe('Solution explanation');
  });

  it('optional fields may be omitted and empty arrays are not sent', async () => {
    renderCreate();
    await fillRequiredCreateFields();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    fireEvent.change(fieldInputByLabel('Introduction'), { target: { value: 'Only intro' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    const payload = challengeService.createChallenge.mock.calls[0][0];
    expect(payload.mode_content).toEqual({ student: { introduction: 'Only intro' } });
    expect(payload.mode_content.student.learning_objectives).toBeUndefined();
  });

  it('list entries can be added and removed', async () => {
    renderCreate();
    await screen.findByText('Basic Info');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    const rulesLabel = screen.getAllByText('Challenge Rules').find(el => el.textContent === 'Challenge Rules');
    const rulesField = rulesLabel.closest('div');
    await act(async () => { fireEvent.click(within(rulesField).getByRole('button', { name: /Add Rule/i })); });
    await act(async () => { fireEvent.click(within(rulesField).getByRole('button', { name: /Add Rule/i })); });
    let ruleInputs = rulesField.querySelectorAll('input.form-control');
    expect(ruleInputs.length).toBe(2);
    const removeButtons = rulesField.querySelectorAll('button.btn-outline-secondary.btn-sm');
    // first two are remove buttons, last is Add Rule
    await act(async () => { fireEvent.click(removeButtons[0]); });
    ruleInputs = rulesField.querySelectorAll('input.form-control');
    expect(ruleInputs.length).toBe(1);
  });

  it('invalid flag format is rejected before submission', async () => {
    renderCreate();
    await fillRequiredCreateFields({ flag: 'bad_flag' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    expect(challengeService.createChallenge).not.toHaveBeenCalled();
    expect(await screen.findByText(/Flag must be in CTF\{\.\.\.\} or FLAG\{\.\.\.\} format/i)).toBeTruthy();
  });

  it('loads existing mode content in edit and populates sections', async () => {
    renderCreate('/admin/challenges/7/edit');
    await screen.findByDisplayValue('Existing');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    expect(screen.getByDisplayValue('S intro')).toBeTruthy();
    expect(screen.getByDisplayValue('LO1')).toBeTruthy();
    expect(screen.getByDisplayValue('C obj')).toBeTruthy();
    expect(screen.getByDisplayValue('Explain')).toBeTruthy();
    expect(screen.getByDisplayValue('Takeaway')).toBeTruthy();
  });

  it('unrelated edit preserves existing mode content by not sending mode_content', async () => {
    renderCreate('/admin/challenges/7/edit');
    await screen.findByDisplayValue('Existing');
    fireEvent.change(screen.getByDisplayValue('Existing'), { target: { value: 'Existing Updated' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Update & Publish/i })); });
    await waitFor(() => expect(challengeService.updateChallenge).toHaveBeenCalled());
    const payload = challengeService.updateChallenge.mock.calls[0][1];
    expect(payload.title).toBe('Existing Updated');
    expect(payload.mode_content).toBeUndefined();
  });

  it('touched cleared mode content sends empty object (intentional clear)', async () => {
    renderCreate('/admin/challenges/7/edit');
    await screen.findByDisplayValue('Existing');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    // clear a visible field to mark touched
    fireEvent.change(screen.getByDisplayValue('S intro'), { target: { value: '' } });
    // also clear other loaded simple fields to make payload empty
    fireEvent.change(screen.getByDisplayValue('C obj'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('Explain'), { target: { value: '' } });
    // remove list entries
    for (const val of ['LO1', 'Rule 1', 'Takeaway']) {
      const input = screen.getByDisplayValue(val);
      const remove = input.closest('div').querySelector('button');
      await act(async () => { fireEvent.click(remove); });
    }
    // remove object list entries
    for (const val of ['T1', 'Step']) {
      const input = screen.getByDisplayValue(val);
      const container = input.closest('div[style]') || input.parentElement.parentElement;
      const remove = within(container).getByRole('button', { name: /Remove/i });
      await act(async () => { fireEvent.click(remove); });
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Update & Publish/i })); });
    const payload = challengeService.updateChallenge.mock.calls[0][1];
    expect(payload.mode_content).toEqual({});
  });

  it('backend validation errors are displayed safely', async () => {
    challengeService.createChallenge.mockRejectedValue({ message: 'mode_content.student.introduction: too long' });
    renderCreate();
    await fillRequiredCreateFields();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    expect(await screen.findByText(/too long/i)).toBeTruthy();
  });

  it('plaintext flag is not displayed after successful submission', async () => {
    renderCreate();
    await fillRequiredCreateFields({ flag: 'CTF{super_secret}' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    await waitFor(() => expect(challengeService.createChallenge).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByDisplayValue('CTF{super_secret}')).toBeNull());
    expect(screen.queryByText('CTF{super_secret}')).toBeNull();
  });

  it('does not fetch protected solution/public mode endpoints in admin authoring', async () => {
    const getContent = vi.spyOn(challengeService, 'getChallengeContent').mockResolvedValue({});
    const getSolution = vi.spyOn(challengeService, 'getChallengeSolution').mockResolvedValue({});
    renderCreate('/admin/challenges/7/edit');
    await screen.findByDisplayValue('Existing');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mode & Solution' })); });
    expect(getContent).not.toHaveBeenCalled();
    expect(getSolution).not.toHaveBeenCalled();
  });

  it('duplicate does not reuse fake flag and routes to create with prefill', async () => {
    renderManage();
    await screen.findByText('Existing');
    // open action menu - find the button with MoreVertical (last button in row)
    const row = screen.getByText('Existing').closest('tr');
    const menuBtn = row.querySelector('button');
    await act(async () => { fireEvent.click(menuBtn); });
    const dupBtn = await screen.findByText('Duplicate');
    await act(async () => { fireEvent.click(dupBtn); });
    await waitFor(() => expect(challengeService.getChallengeByIdAdmin).toHaveBeenCalledWith(7));
    expect(await screen.findByText('CREATE_PAGE')).toBeTruthy();
    expect(challengeService.createChallenge).not.toHaveBeenCalled();
  });

  it('accepts FLAG{...} prefix', async () => {
    renderCreate();
    await fillRequiredCreateFields({ flag: 'FLAG{base64_is_not_a_lock}' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Publish Challenge/i })); });
    await waitFor(() => expect(challengeService.createChallenge).toHaveBeenCalled());
    expect(challengeService.createChallenge.mock.calls[0][0].flag).toBe('FLAG{base64_is_not_a_lock}');
  });
});


