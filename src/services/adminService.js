/**
 * adminService.js
 * Handles admin data: users, groups, analytics and the audit trail.
 *
 * Every method here is backed by the Django REST API. There is no mock or
 * localStorage fallback: a failure propagates as an ApiError so the pages show
 * an error state instead of stale, fabricated data.
 */

import { api } from './api';

export const adminService = {
  /* ---------------------------------------------------------------- */
  /* Runtime platform settings (Admin -> Settings page).              */
  /* ---------------------------------------------------------------- */

  /**
   * Read the three enforced runtime settings.
   * GET /admin/settings/
   */
  async getPlatformSettings() {
    return api.get('/admin/settings/');
  },

  /**
   * Partially update runtime settings. The caller re-reads afterwards to
   * verify persistence before showing success.
   * PATCH /admin/settings/
   */
  async updatePlatformSettings(payload) {
    return api.patch('/admin/settings/', payload);
  },

  /* ---------------------------------------------------------------- */
  /* Real admin user-management API (Admin -> Users page).            */
  /* ---------------------------------------------------------------- */

  async listUsers({ page = 1, pageSize = 20, search = '', deleted = false } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    const term = (search || '').trim();
    if (term) params.set('search', term);
    if (deleted) params.set('deleted', 'true');
    return api.get(`/admin/users/?${params.toString()}`);
  },

  async getUser(id, { deleted = false } = {}) {
    const suffix = deleted ? '?deleted=true' : '';
    return api.get(`/admin/users/${id}/${suffix}`);
  },

  async createUser(payload) {
    return api.post('/admin/users/', payload);
  },

  async updateUser(id, payload) {
    return api.patch(`/admin/users/${id}/`, payload);
  },

  async removeUser(id) {
    return api.delete(`/admin/users/${id}/`);
  },

  async restoreUser(id) {
    return api.post(`/admin/users/${id}/restore/`, {});
  },

  async setUserStatus(id, status, statusNote = '') {
    return api.patch(`/admin/users/${id}/status/`, {
      status,
      status_note: statusNote || '',
    });
  },

  async setUserGroups(id, groupIds) {
    return api.patch(`/admin/users/${id}/groups/`, { groups: groupIds });
  },

  async listGroups() {
    return api.get('/admin/groups/');
  },

  /**
   * Platform-wide Dashboard/Analytics aggregates. Admin only.
   * GET /api/v1/admin/analytics/
   */
  async getAdminAnalytics() {
    return api.get('/admin/analytics/');
  },

  /* ---------------------------------------------------------------- */
  /* Admin audit trail (Admin -> Audit Logs, Dashboard preview).      */
  /* ---------------------------------------------------------------- */

  /**
   * Read-only, paginated and filterable audit trail.
   *
   * GET /api/v1/admin/audit-logs/
   * Query: page, page_size, actor, action, target_type, search,
   *        date_from, date_to (YYYY-MM-DD).
   *
   * Requires the `audit.view_auditlog` permission. Every mutating admin
   * endpoint writes its own row server-side, so there is no client log call.
   */
  async listAuditLogs({
    page = 1,
    pageSize = 20,
    actor = '',
    action = '',
    targetType = '',
    search = '',
    dateFrom = '',
    dateTo = '',
  } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    const add = (key, value) => {
      const trimmed = (value || '').trim();
      if (trimmed) params.set(key, trimmed);
    };

    add('actor', actor);
    add('action', action);
    add('target_type', targetType);
    add('search', search);
    add('date_from', dateFrom);
    add('date_to', dateTo);
    return api.get(`/admin/audit-logs/?${params.toString()}`);
  },
};

export default adminService;
