/**
 * historyService.js
 * The signed-in user's own submission and solve history.
 *
 *   GET /api/v1/submissions/me/   Authorization: Bearer <access>
 *   GET /api/v1/solves/me/        Authorization: Bearer <access>
 *
 * The backend derives the owner from the access token. There is intentionally
 * no user id parameter here: a caller can only read their own rows.
 */

import { api } from './api';

function pageQuery({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return params.toString();
}

export const historyService = {
  /** All of the caller's flag attempts, newest first. */
  async getMySubmissions(options = {}) {
    return api.get(`/submissions/me/?${pageQuery(options)}`);
  },

  /** All of the caller's successful solves, newest first. */
  async getMySolves(options = {}) {
    return api.get(`/solves/me/?${pageQuery(options)}`);
  },
};

export default historyService;
