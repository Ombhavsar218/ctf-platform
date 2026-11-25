/**
 * Service-level harness for the personal History page.
 *
 * Runs the real src/services/historyService.js and src/services/api.js in Node
 * against a stubbed fetch + localStorage. It proves the two endpoints always
 * target the caller's own history (no user id), forward pagination, attach the
 * bearer token and surface permission/authentication failures.
 */

const store = new Map();

const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const window = {
  localStorage,
  dispatchEvent: () => true,
  addEventListener: () => {},
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
  return jsonResponse(queue.shift() || { status: 200, body: {} });
};

globalThis.localStorage = localStorage;
globalThis.window = window;
globalThis.fetch = fetchStub;

const { historyService } = await import('../../src/services/historyService.js');
const { tokenStore, ApiError } = await import('../../src/services/api.js');

const BASE = 'https://api.example.test/api/v1';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const assertEqual = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
};
const lastCall = () => calls[calls.length - 1];
const queueResponses = (...responses) => { queue = responses; };

function resetEnv() {
  calls = [];
  queue = [];
  store.clear();
}

test('getMySolves uses the caller-scoped endpoint with default pagination', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  const data = await historyService.getMySolves();
  assertEqual(calls.length, 1);
  assertEqual(lastCall().method, 'GET');
  assertEqual(lastCall().url, `${BASE}/solves/me/?page=1&page_size=20`);
  assertEqual(data.count, 0);
});

test('getMySubmissions forwards page and page_size', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await historyService.getMySubmissions({ page: 3, pageSize: 5 });
  assertEqual(lastCall().url, `${BASE}/submissions/me/?page=3&page_size=5`);
});

test('history requests never send a user id', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await historyService.getMySolves({ page: 1, pageSize: 20 });
  assert(!/user=/.test(lastCall().url), 'user id must not be client-supplied');
});

test('history requests attach the bearer token', async () => {
  tokenStore.setTokens({ access: 'history-token' });
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await historyService.getMySolves();
  assertEqual(lastCall().headers.Authorization, 'Bearer history-token');
});

test('a 401 surfaces as an ApiError and clears the session', async () => {
  tokenStore.setTokens({ access: 'stale' });
  queueResponses({ status: 401, body: null });
  let err;
  try { await historyService.getMySubmissions(); } catch (e) { err = e; }
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 401);
  assertEqual(localStorage.getItem('cyberforge_access'), null);
});

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
