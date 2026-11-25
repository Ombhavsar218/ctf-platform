/**
 * statsService.js
 * The signed-in user's own dashboard/profile statistics.
 *
 *   GET /api/v1/stats/me/        Authorization: Bearer <access>
 *
 * The server is authoritative: it derives every value from the caller's stored
 * solves, hint unlocks and submissions (points balance and earned, unique
 * solves, global rank, per-category progress, recent solve/hint activity,
 * progress buckets and the daily solve streaks). Nothing here is read from
 * local storage.
 *
 * Throws an ApiError for an auth (401, which clears the session and emits
 * `auth:expired`) or a server (5xx) failure.
 */

import { api } from './api';

export const statsService = {
  /**
   * The current user's private statistics.
   * Resolves with:
   *   {
   *     points, earnedPoints, spentOnHints, solved, accuracy,
   *     submissions: { total, correct },
   *     rank,                    // int, or null when unranked
   *     joinDate,                // ISO string, or null
   *     solvedChallengeIds: [int],
   *     categoryProgress: [{ id, name, color, solved, total, points }],
   *     recentActivity:   [{ type, challengeId, challengeName, points, cost, timestamp }],
   *     progress: { weekly: [{ label, points }], monthly: [{ label, points }] },
   *     progression: {
   *       level, tier, points, levelMin, nextLevelMin, toNext,
   *       progressPct, elitePct, isMax,
   *     },                       // derived from earnedPoints, never the balance
   *     current_streak,          // consecutive solve-days (today or yesterday)
   *     longest_streak,          // longest run of consecutive solve-days ever
   *     currentStreak,           // camelCase alias of current_streak
   *     longestStreak,           // camelCase alias of longest_streak
   *   }
   *
   * A streak day is a calendar day in the server's configured timezone on
   * which the caller recorded at least one successful solve. Failed
   * submissions, hint unlocks and logins never count, and several solves on
   * the same day still count as a single day. Both values are 0 for a player
   * who has never solved anything.
   *
   * The two streaks are served under both spellings, which always carry the
   * same value; `src/context/AppContext.jsx` normalises them once.
   */
  async getMyStats() {
    return api.get('/stats/me/');
  },
};

export default statsService;
