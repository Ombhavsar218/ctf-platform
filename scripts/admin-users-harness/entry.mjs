/**
 * Service-level harness for the Admin -> Users feature.
 *
 * Runs the REAL src/services/adminService.js and src/services/api.js in Node
 * against a stubbed fetch + localStorage, so URL construction, HTTP methods,
 * payloads, auth headers, pagination/search params and the 200/400/401/403
 * branches are all exercised without a backend or a browser.
 *
 * Bundled by run.mjs with esbuild, which also defines import.meta.env so
 * api.js resolves its base URL exactly as Vite would.
 */

/* ------------------------------------------------------------------ */
/* Fake browser environment                                            */
/* ------------------------------------------------------------------ */

const store = new Map();

const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const dispatchedEvents = [];
const listeners = {};

const window = {
  localStorage,
  dispatchEvent: (evt) => { dispatchedEvents.push(evt); return true; },
  addEventListener: (name, cb) => { (listeners[name] ||= []).push(cb); },
  removeEventListener: () => {},
};

let calls = [];
let queue = [];

const jsonResponse = (res) => ({
  ok: res.status >= 200 && res.status < 300,
  status: res.status,
  text: async () => (res.body == null ? '' : JSON.stringify(res.body)),
  json: async () => res.body,
});

const fetchStub = async (url, options = {}) => {
  calls.push({
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body === undefined ? undefined : JSON.parse(options.body),
  });
  const res = queue.shift() || { status: 200, body: {} };
  return jsonResponse(res);
};

globalThis.localStorage = localStorage;
globalThis.window = window;
globalThis.fetch = fetchStub;

/* ------------------------------------------------------------------ */
/* Import the real modules (after globals exist)                       */
/* ------------------------------------------------------------------ */

const { adminService } = await import('../../src/services/adminService.js');
const {
  loadPlatformSettings,
  savePlatformSettings,
} = await import('../../src/services/platformSettingsService.js');
const {
  DEFAULT_PLATFORM_SETTINGS,
  buildPlatformSettingsPayload,
  normalizePlatformSettings,
  platformSettingsEqual,
  platformSettingsFieldErrors,
} = await import('../../src/utils/adminSettingsForm.js');
const { api, tokenStore, ApiError } = await import('../../src/services/api.js');

const BASE = 'https://api.example.test/api/v1';

/* ------------------------------------------------------------------ */
/* Tiny test runner                                                    */
/* ------------------------------------------------------------------ */

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'assertion failed');
};
const assertEqual = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
};

const lastCall = () => calls[calls.length - 1];

const queueResponses = (...responses) => { queue = responses; };

const withToken = (t = 'tok123') => tokenStore.setTokens({ access: t });

function resetEnv() {
  calls = [];
  queue = [];
  store.clear();
  dispatchedEvents.length = 0;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('listUsers builds the paginated URL from the configured base', async () => {
  queueResponses({ status: 200, body: { count: 0, next: null, previous: null, summary: {}, results: [] } });
  const data = await adminService.listUsers();
  assertEqual(calls.length, 1);
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=1&page_size=20`);
  assertEqual(data.count, 0);
});

test('listUsers forwards page, page_size and search', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers({ page: 3, pageSize: 5, search: 'ada' });
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=3&page_size=5&search=ada`);
});

test('listUsers drops a blank search term', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers({ search: '   ' });
  assert(!lastCall().url.includes('search='), 'blank search must not be sent');
});

test('the Bearer token is attached when present', async () => {
  withToken('abc.def.ghi');
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers();
  assertEqual(lastCall().headers.Authorization, 'Bearer abc.def.ghi');
});

test('no Authorization header is sent when logged out', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers();
  assert(lastCall().headers.Authorization === undefined, 'expected no auth header');
});

test('getUser GETs the detail URL', async () => {
  queueResponses({ status: 200, body: { id: 7 } });
  const data = await adminService.getUser(7);
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/admin/users/7/`);
  assertEqual(data.id, 7);
});

test('createUser POSTs a JSON body', async () => {
  withToken();
  queueResponses({ status: 201, body: { id: 1, username: 'neo' } });
  const data = await adminService.createUser({ username: 'neo', password: 'Str0ng-Pass!42' });
  assertEqual(lastCall().method, 'POST');
  assertEqual(lastCall().url, `${BASE}/admin/users/`);
  assertEqual(lastCall().headers['Content-Type'], 'application/json');
  assertEqual(lastCall().body.username, 'neo');
  assertEqual(data.id, 1);
});

test('updateUser PATCHes profile fields to the detail URL', async () => {
  queueResponses({ status: 200, body: { id: 5 } });
  await adminService.updateUser(5, { first_name: 'Ada', email: 'ada@example.com' });
  assertEqual(lastCall().method, 'PATCH');
  assertEqual(lastCall().url, `${BASE}/admin/users/5/`);
  assertEqual(lastCall().body.first_name, 'Ada');
});

test('removeUser sends DELETE and tolerates an empty 204', async () => {
  queueResponses({ status: 204, body: null });
  const data = await adminService.removeUser(7);
  assertEqual(lastCall().method, 'DELETE');
  assertEqual(lastCall().url, `${BASE}/admin/users/7/`);
  assertEqual(data, null);
});

test('listUsers adds deleted=true only when asked', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers({ deleted: true });
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=1&page_size=20&deleted=true`);
});

test('listUsers omits deleted for the active view', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listUsers({ deleted: false });
  assert(!lastCall().url.includes('deleted='), 'active view must not send deleted');
});

test('getUser forwards the deleted flag for a deleted account', async () => {
  queueResponses({ status: 200, body: { id: 7, deleted_at: '2026-01-01T00:00:00Z' } });
  await adminService.getUser(7, { deleted: true });
  assertEqual(lastCall().url, `${BASE}/admin/users/7/?deleted=true`);
});

test('restoreUser POSTs to the restore endpoint', async () => {
  queueResponses({ status: 200, body: { id: 7, status: 'active', deleted_at: null } });
  const data = await adminService.restoreUser(7);
  assertEqual(lastCall().method, 'POST');
  assertEqual(lastCall().url, `${BASE}/admin/users/7/restore/`);
  assertEqual(data.deleted_at, null);
});

test('setUserStatus PATCHes status and note', async () => {
  queueResponses({ status: 200, body: { id: 7, status: 'suspended' } });
  await adminService.setUserStatus(7, 'suspended', 'spam');
  assertEqual(lastCall().method, 'PATCH');
  assertEqual(lastCall().url, `${BASE}/admin/users/7/status/`);
  assertEqual(lastCall().body.status, 'suspended');
  assertEqual(lastCall().body.status_note, 'spam');
});

test('setUserStatus defaults the note to an empty string', async () => {
  queueResponses({ status: 200, body: {} });
  await adminService.setUserStatus(7, 'active');
  assertEqual(lastCall().body.status_note, '');
});

test('setUserGroups PATCHes the group id list', async () => {
  queueResponses({ status: 200, body: { id: 7, groups: [] } });
  await adminService.setUserGroups(7, [2, 3]);
  assertEqual(lastCall().url, `${BASE}/admin/users/7/groups/`);
  assertEqual(JSON.stringify(lastCall().body.groups), '[2,3]');
});

test('listGroups GETs the assignable groups', async () => {
  queueResponses({ status: 200, body: [{ id: 1, name: 'Admin' }] });
  const data = await adminService.listGroups();
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/admin/groups/`);
  assertEqual(data[0].name, 'Admin');
});

test('403 becomes an ApiError with a permission message', async () => {
  withToken();
  queueResponses({ status: 403, body: null });
  let err;
  try { await adminService.listUsers(); } catch (e) { err = e; }
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 403);
  assert(/permission/i.test(err.message), `unexpected message: ${err.message}`);
});

test('400 surfaces the field-level validation message', async () => {
  withToken();
  queueResponses({ status: 400, body: { username: ['A user with that username already exists.'] } });
  let err;
  try { await adminService.createUser({ username: 'neo', password: 'x' }); } catch (e) { err = e; }
  assertEqual(err.status, 400);
  assert(/username/i.test(err.message), `unexpected message: ${err.message}`);
});

test('404 becomes an ApiError without leaking internals', async () => {
  withToken();
  queueResponses({ status: 404, body: null });
  let err;
  try { await adminService.getUser(999); } catch (e) { err = e; }
  assertEqual(err.status, 404);
  assert(/not found/i.test(err.message), `unexpected message: ${err.message}`);
});

test('401 with no refresh token clears the session and emits auth:expired', async () => {
  withToken();
  queueResponses({ status: 401, body: null });
  let err;
  try { await adminService.listUsers(); } catch (e) { err = e; }
  assertEqual(err.status, 401);
  assertEqual(calls.length, 1, 'should not retry without a refresh token');
  assertEqual(localStorage.getItem('cyberforge_access'), null);
  assertEqual(dispatchedEvents.length, 1);
  assertEqual(dispatchedEvents[0].type, 'auth:expired');
});

test('401 with a valid refresh token retries once using the new access token', async () => {
  tokenStore.setTokens({ access: 'old', refresh: 'refresh-1' });
  queueResponses(
    { status: 401, body: null },
    { status: 200, body: { access: 'new-access' } },
    { status: 200, body: { count: 1, results: [{ id: 1 }] } },
  );
  const data = await adminService.listUsers();
  assertEqual(calls.length, 3, 'list, refresh, retried list');
  assertEqual(calls[1].url, `${BASE}/auth/refresh/`);
  assertEqual(calls[1].body.refresh, 'refresh-1');
  assertEqual(calls[2].headers.Authorization, 'Bearer new-access');
  assertEqual(tokenStore.getAccess(), 'new-access');
  assertEqual(data.count, 1);
});

test('listAuditLogs builds the paginated audit URL', async () => {
  queueResponses({ status: 200, body: { count: 0, next: null, previous: null, results: [] } });
  const data = await adminService.listAuditLogs();
  assertEqual(calls.length, 1);
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/admin/audit-logs/?page=1&page_size=20`);
  assertEqual(data.count, 0);
});

test('listAuditLogs forwards every server-side filter and trims blanks', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listAuditLogs({
    page: 2,
    pageSize: 10,
    actor: ' admin ',
    action: 'user.status_change',
    targetType: 'user',
    search: ' ada ',
    dateFrom: '2026-10-01',
    dateTo: '2026-10-22',
  });
  const url = lastCall().url;
  assertEqual(url, `${BASE}/admin/audit-logs/?page=2&page_size=10&actor=admin&action=user.status_change&target_type=user&search=ada&date_from=2026-10-01&date_to=2026-10-22`);
});

test('listAuditLogs omits blank filters', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService.listAuditLogs({
    actor: '  ', action: '', targetType: '', search: '   ', dateFrom: '', dateTo: '',
  });
  assertEqual(lastCall().url, `${BASE}/admin/audit-logs/?page=1&page_size=20`);
});

test('listAuditLogs 403 surfaces the permission message', async () => {
  withToken();
  queueResponses({ status: 403, body: null });
  let err;
  try { await adminService.listAuditLogs(); } catch (e) { err = e; }
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 403);
  assert(/permission/i.test(err.message), `unexpected message: ${err.message}`);
});

test('getPlatformSettings GETs the admin settings endpoint', async () => {
  withToken();
  queueResponses({
    status: 200,
    body: { allow_registration: true, public_leaderboard: true, allow_hints: true },
  });
  const data = await adminService.getPlatformSettings();
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/admin/settings/`);
  assertEqual(lastCall().headers.Authorization, 'Bearer tok123');
  assertEqual(data.allow_hints, true);
});

test('updatePlatformSettings PATCHes only the three supported fields', async () => {
  queueResponses({ status: 200, body: { allow_hints: false } });
  await adminService.updatePlatformSettings({ allow_hints: false });
  assertEqual(lastCall().method, 'PATCH');
  assertEqual(lastCall().url, `${BASE}/admin/settings/`);
  assertEqual(lastCall().headers['Content-Type'], 'application/json');
  assertEqual(lastCall().body.allow_hints, false);
});

test('platform settings normalize missing optional fields to safe defaults', () => {
  assertEqual(JSON.stringify(normalizePlatformSettings({})), JSON.stringify(DEFAULT_PLATFORM_SETTINGS));
  const partial = normalizePlatformSettings({ allow_hints: false });
  assertEqual(partial.allow_hints, false);
  assertEqual(partial.allow_registration, true);
  assertEqual(partial.public_leaderboard, true);
});

test('platform settings payload contains only approved fields', () => {
  const payload = buildPlatformSettingsPayload({
    allow_registration: false,
    public_leaderboard: true,
    allow_hints: false,
    debug: true,
    secret: 'must-not-be-sent',
  });
  assertEqual(JSON.stringify(Object.keys(payload).sort()), JSON.stringify([
    'allow_hints', 'allow_registration', 'public_leaderboard',
  ]));
  assertEqual(payload.allow_registration, false);
  assertEqual(payload.allow_hints, false);
});

test('platform settings equality ignores unrelated fields', () => {
  assert(platformSettingsEqual(
    { allow_registration: true, public_leaderboard: true, allow_hints: true, extra: 1 },
    { allow_registration: true, public_leaderboard: true, allow_hints: true },
  ), 'expected equal settings');
  assert(!platformSettingsEqual(
    { allow_registration: true, public_leaderboard: true, allow_hints: true },
    { allow_registration: true, public_leaderboard: false, allow_hints: true },
  ), 'expected different settings');
});

test('platform settings field errors are limited to approved fields', () => {
  const errors = platformSettingsFieldErrors({
    data: {
      allow_hints: ['Must be a boolean.'],
      debug: ['Do not display.'],
    },
  });
  assertEqual(errors.allow_hints, 'Must be a boolean.');
  assertEqual(errors.debug, undefined);
});

test('loadPlatformSettings reads and normalizes the API response', async () => {
  queueResponses({
    status: 200,
    body: { allow_registration: false, allow_hints: false },
  });
  const settings = await loadPlatformSettings();
  assertEqual(calls.length, 1);
  assertEqual(settings.allow_registration, false);
  assertEqual(settings.allow_hints, false);
  assertEqual(settings.public_leaderboard, true);
});

test('savePlatformSettings PATCHes then re-reads before resolving', async () => {
  withToken();
  const stored = {
    allow_registration: false,
    public_leaderboard: true,
    allow_hints: false,
  };
  queueResponses(
    { status: 200, body: stored },
    { status: 200, body: stored },
  );
  const confirmed = await savePlatformSettings(stored);
  assertEqual(calls.length, 2, 'PATCH and verification GET');
  assertEqual(calls[0].method, 'PATCH');
  assertEqual(calls[1].method, 'GET');
  assertEqual(calls[0].body.allow_registration, false);
  assertEqual(confirmed.allow_hints, false);
});

test('savePlatformSettings rejects when the verification read disagrees', async () => {
  queueResponses(
    { status: 200, body: { allow_hints: true } },
    { status: 200, body: { allow_hints: false } },
  );
  let err;
  try {
    await savePlatformSettings({ allow_hints: true });
  } catch (e) {
    err = e;
  }
  assert(Boolean(err), 'expected a verification error');
  assert(/verif/i.test(err.message), `unexpected message: ${err.message}`);
  assertEqual(calls.length, 2);
});

test('savePlatformSettings does not re-read after a PATCH error', async () => {
  queueResponses({ status: 400, body: { allow_hints: ['Must be a boolean.'] } });
  let err;
  try {
    await savePlatformSettings({ allow_hints: true });
  } catch (e) {
    err = e;
  }
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 400);
  assertEqual(calls.length, 1, 'must not verify a failed PATCH');
});

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

for (const [name, fn] of tests) {
  resetEnv();
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

console.log(`\n${passed}/${tests.length} passed`);

if (failures.length) {
  console.error(`\n${failures.length} failing test(s).`);
  process.exitCode = 1;
}
