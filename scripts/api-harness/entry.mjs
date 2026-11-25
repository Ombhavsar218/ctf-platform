/**
 * Service-level harness for API error presentation and request correlation.
 *
 * Runs the real src/services/api.js in Node against a stubbed fetch, proving
 * that network/server failures become readable messages, DRF validation stays
 * useful, HTML/debug bodies are never shown, and X-Request-ID is retained on
 * the ApiError for support without altering page designs.
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
let networkFailure = false;

const jsonResponse = (res) => {
  const headers = res.headers || {};
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    headers: { get: (name) => headers[name] ?? null },
    text: async () => {
      if (Object.prototype.hasOwnProperty.call(res, 'raw')) return res.raw;
      return res.body == null ? '' : JSON.stringify(res.body);
    },
    json: async () => res.body,
  };
};

const fetchStub = async (url, options = {}) => {
  if (networkFailure) throw new TypeError('Failed to fetch');
  calls.push({
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
  });
  return jsonResponse(queue.shift() || { status: 200, body: {} });
};

globalThis.localStorage = localStorage;
globalThis.window = window;
globalThis.fetch = fetchStub;

const { api, humanizeError, ApiError } = await import('../../src/services/api.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const assertEqual = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
};

const queueResponses = (...responses) => { queue = responses; };
const lastCall = () => calls[calls.length - 1];

function resetEnv() {
  calls = [];
  queue = [];
  networkFailure = false;
  store.clear();
}

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the request to fail');
}

test('DRF validation errors keep their useful field message', async () => {
  queueResponses({ status: 400, body: { username: ['A user with that username already exists.'] } });
  const err = await captureError(() => api.post('/auth/register/', {}));
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 400);
  assert(/username/i.test(err.message), `unexpected message: ${err.message}`);
  assert(/already exists/i.test(err.message), `unexpected message: ${err.message}`);
});

test('unknown/internal error keys are never shown', async () => {
  const message = humanizeError({
    traceback: 'Traceback (most recent call last)',
    settings: { SECRET_KEY: 'leak' },
    detail: 'Safe message.',
  });
  assertEqual(message, 'Safe message.');
});

test('a network failure gives an understandable connection message', async () => {
  networkFailure = true;
  const err = await captureError(() => api.get('/challenges/'));
  assert(err instanceof ApiError, 'expected an ApiError');
  assertEqual(err.status, 0);
  assert(/could not reach the server/i.test(err.message), `unexpected message: ${err.message}`);
  assert(/check your connection/i.test(err.message), `unexpected message: ${err.message}`);
});

test('an HTML debug page from a server error is never shown', async () => {
  queueResponses({
    status: 500,
    raw: '<!doctype html><html><body><pre>Traceback: /srv/app/db.sqlite3</pre></body></html>',
  });
  const err = await captureError(() => api.get('/challenges/'));
  assertEqual(err.status, 500);
  assert(/server is temporarily unavailable/i.test(err.message), `unexpected message: ${err.message}`);
  assert(!err.message.includes('<'), 'HTML must not be surfaced');
  assert(!err.message.includes('/srv/'), 'internal paths must not be surfaced');
});

test('an empty 503 gives a temporary-unavailable message', async () => {
  queueResponses({ status: 503, body: null });
  const err = await captureError(() => api.get('/stats/me/'));
  assertEqual(err.status, 503);
  assert(/temporarily unavailable/i.test(err.message), `unexpected message: ${err.message}`);
});

test('an empty 429 gives a wait-and-retry message', async () => {
  queueResponses({ status: 429, body: null });
  const err = await captureError(() => api.post('/challenges/1/submit/', { flag: 'CTF{x}' }));
  assertEqual(err.status, 429);
  assert(/too many requests/i.test(err.message), `unexpected message: ${err.message}`);
});

test('X-Request-ID is retained on an ApiError without being displayed', async () => {
  queueResponses({ status: 500, body: null, headers: { 'X-Request-ID': 'corr-123' } });
  const err = await captureError(() => api.get('/challenges/'));
  assertEqual(err.requestId, 'corr-123');
  assert(!err.message.includes('corr-123'), 'the correlation ID must not leak into the user message');
});

test('successful responses are unaffected by correlation headers', async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] }, headers: { 'X-Request-ID': 'corr-ok' } });
  const data = await api.get('/challenges/');
  assertEqual(lastCall().method, 'GET');
  assertEqual(data.count, 0);
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
