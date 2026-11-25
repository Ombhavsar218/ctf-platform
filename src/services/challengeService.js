/**
 * challengeService.js
 * Handles all challenge-related operations.
 *
 * Public methods call the real Django REST API at /api/v1/.
 * Admin methods call /api/v1/admin/challenges/ and require a JWT with
 * the appropriate Django model permissions.
 *
 * Flag submission, hint reveal and Docker-backed challenge instances all call
 * the real Django REST API at /api/v1/.
 */

import { api } from './api';

/**
 * Translate the backend instance payload into the shape the UI uses.
 * The backend never sends invented command strings: `connection_meta` contains
 * only confirmed Docker port-publishing data.
 */
export function normalizeInstance(payload) {
  if (!payload) return null;
  const meta = payload.connection_meta || {};
  const type = meta.type || '';
  const host = meta.host || '';
  const port = meta.port ? Number(meta.port) : null;
  const target = meta.target || (host && port ? `${host}:${port}` : '');
  const url = meta.url || ((type === 'http' || type === 'https') && target
    ? `${type}://${target}`
    : '');
  const expiresAt = payload.expires_at ? Date.parse(payload.expires_at) : null;
  const remainingSeconds = Number.isFinite(Number(payload.remaining_seconds))
    ? Number(payload.remaining_seconds)
    : (expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0);

  return {
    id: payload.id,
    challengeId: payload.challenge_id,
    challengeTitle: payload.challenge_title || '',
    status: payload.status,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    remainingSeconds,
    createdAt: payload.created_at || null,
    stoppedAt: payload.stopped_at || null,
    failureReason: payload.failure_reason || '',
    connection: { type, host, port, target, url },
    // Kept for the existing UI copy/open affordances; derived only from real
    // connection metadata, never fabricated by the frontend.
    command: url || target || '',
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const challengeService = {
  /**
   * Get all published challenges, optionally filtered.
   * GET /api/v1/challenges/?category=...&difficulty=...&search=...
   */
  async getChallenges(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== 'All') {
      params.set('category', filters.category);
    }
    if (filters.difficulty && filters.difficulty !== 'All') {
      params.set('difficulty', filters.difficulty);
    }
    if (filters.search) {
      params.set('search', filters.search);
    }
    const qs = params.toString();
    return api.get(`/challenges/${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get a single published challenge by ID.
   * GET /api/v1/challenges/:id/
   */
  async getChallengeById(id) {
    return api.get(`/challenges/${id}/`);
  },

  /**
   * Get authenticated mode-aware content for a challenge.
   * GET /api/v1/challenges/:id/content/
   *
   * Backend resolves learning mode from the persisted user record and returns
   * only the caller's permitted mode section. No global caching.
   */
  async getChallengeContent(challengeId) {
    return api.get(`/challenges/${challengeId}/content/`);
  },

  /**
   * Get solve-gated solution content for a challenge.
   * GET /api/v1/challenges/:id/solution/
   *
   * Backend authorizes using persisted learning mode + exact Solve record.
   * No global/persistent caching; return the actual backend response.
   */
  async getChallengeSolution(challengeId) {
    return api.get(`/challenges/${challengeId}/solution/`);
  },

  /**
   * Get all categories with published challenge counts.
   * GET /api/v1/categories/
   */
  async getCategories() {
    return api.get('/categories/', { auth: false });
  },

  // ─── Flag Submission ─────────────────────────────────────────────────────

  /**
   * Submit a flag for a challenge.
   * POST /api/v1/challenges/:id/submit/
   *
   * Requires an authenticated session (Bearer token attached by api.js).
   * Resolves with the server's verdict:
   *   { correct, alreadySolved, points, message }
   * Throws an ApiError for validation (400), auth (401), missing/unpublished
   * (404) and throttling (429) responses.
   */
  async submitFlag(challengeId, flag) {
    return api.post(`/challenges/${challengeId}/submit/`, { flag });
  },

  // ─── Hints ───────────────────────────────────────────────────────────────

  /**
   * Reveal a hint for a challenge. Costs the hint's points, once.
   * POST /api/v1/challenges/:id/hints/:hintId/reveal/
   *
   * Requires an authenticated session (Bearer token attached by api.js; the
   * body is empty because the server is authoritative about the cost and the
   * acting user). Resolves with:
   *   { revealed, alreadyUnlocked, hint: { id, order, cost, text },
   *     pointsSpent, remainingPoints, message }
   * Throws an ApiError for insufficient points (400), auth (401),
   * a missing/hidden/foreign hint (404) and throttling (429).
   */
  async revealHint(challengeId, hintId) {
    return api.post(`/challenges/${challengeId}/hints/${hintId}/reveal/`, {});
  },

  // ─── Challenge Instances (real Docker runtime) ────────────────────────────

  /**
   * Start a fresh Docker-backed instance for a challenge.
   * POST /api/v1/challenges/:id/instances/start/
   */
  async startInstance(challengeId) {
    const payload = await api.post(`/challenges/${challengeId}/instances/start/`, {});
    return normalizeInstance(payload);
  },

  /**
   * Stop / terminate the caller's active instance.
   * DELETE /api/v1/challenges/instances/active/
   */
  async stopInstance(challengeId) {
    const payload = await api.delete('/challenges/instances/active/');
    const instance = normalizeInstance(payload);
    // 204 means there was nothing active; treat that as a successful stop.
    return instance && challengeId != null && String(instance.challengeId) !== String(challengeId)
      ? null
      : instance;
  },

  /**
   * Get the currently active instance (globally for this user). A row for a
   * different challenge is treated as "none" so this page can offer Start.
   * GET /api/v1/challenges/instances/active/
   */
  async getInstance(challengeId) {
    const payload = await api.get('/challenges/instances/active/');
    const instance = normalizeInstance(payload);
    if (!instance) return null;
    if (challengeId != null && String(instance.challengeId) !== String(challengeId)) {
      return null;
    }
    return instance;
  },

  // ─── Admin API ────────────────────────────────────────────────────────────

  /**
   * Get ALL challenges (including drafts). Admin only.
   * GET /api/v1/admin/challenges/
   */
  async getAllChallenges({ status, search } = {}) {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return api.get(`/admin/challenges/${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get a single challenge by ID (any status). Admin only.
   * GET /api/v1/admin/challenges/:id/
   */
  async getChallengeByIdAdmin(id) {
    return api.get(`/admin/challenges/${id}/`);
  },

  /**
   * Create a new challenge. Admin only.
   * POST /api/v1/admin/challenges/
   */
  async createChallenge(data) {
    return api.post('/admin/challenges/', data);
  },

  /**
   * Update an existing challenge. Admin only.
   * PATCH /api/v1/admin/challenges/:id/
   */
  async updateChallenge(id, data) {
    return api.patch(`/admin/challenges/${id}/`, data);
  },

  /**
   * Delete a challenge. Admin only. Only draft challenges can be deleted.
   * DELETE /api/v1/admin/challenges/:id/
   */
  async deleteChallenge(id) {
    return api.delete(`/admin/challenges/${id}/`);
  },

  /**
   * Set challenge status (publish / unpublish / schedule). Admin only.
   * PATCH /api/v1/admin/challenges/:id/status/
   */
  async setChallengeStatus(id, status, publishAt = '') {
    return api.patch(`/admin/challenges/${id}/status/`, {
      status,
      publishAt: publishAt || '',
    });
  },

  /**
   * Upload an attachment to a challenge. Admin only.
   * POST /api/v1/admin/challenges/:id/attachments/
   */
  async uploadAttachment(id, file, name = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    return api.post(`/admin/challenges/${id}/attachments/`, formData);
  },

  /**
   * Delete an attachment from a challenge. Admin only.
   * DELETE /api/v1/admin/challenges/:id/attachments/:attachmentId/
   */
  async deleteAttachment(id, attachmentId) {
    return api.delete(`/admin/challenges/${id}/attachments/${attachmentId}/`);
  },

  // ─── Admin Categories ────────────────────────────────────────────────────

  /**
   * Create a category. Admin only.
   * POST /api/v1/admin/categories/
   */
  async createCategory(data) {
    return api.post('/admin/categories/', data);
  },

  /**
   * Update a category. Admin only.
   * PATCH /api/v1/admin/categories/:id/
   */
  async updateCategory(id, data) {
    return api.patch(`/admin/categories/${id}/`, data);
  },

  /**
   * Delete an unused category. Admin only.
   * DELETE /api/v1/admin/categories/:id/
   *
   * The server refuses to delete a category referenced by a challenge or an
   * achievement rule; it never cascades or reassigns those records.
   */
  async deleteCategory(id) {
    return api.delete(`/admin/categories/${id}/`);
  },
};

export default challengeService;
