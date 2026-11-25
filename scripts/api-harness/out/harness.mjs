var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/services/api.js
var api_exports = {};
__export(api_exports, {
  ApiError: () => ApiError,
  api: () => api,
  default: () => api_default,
  humanizeError: () => humanizeError,
  refreshAccessToken: () => refreshAccessToken,
  request: () => request,
  tokenStore: () => tokenStore
});
function humanizeError(data, fallback = "Something went wrong. Please try again.") {
  if (data == null) return fallback;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed || trimmed.startsWith("<")) return fallback;
    return trimmed.length > 300 ? fallback : trimmed;
  }
  if (Array.isArray(data)) {
    return data.filter(Boolean).join(" ") || fallback;
  }
  if (typeof data === "object") {
    if (data.detail != null) {
      const detail = Array.isArray(data.detail) ? data.detail.filter(Boolean).join(" ") : data.detail;
      if (typeof detail === "string" && detail) return detail;
    }
    const parts = [];
    const internalKeys = /* @__PURE__ */ new Set([
      "trace",
      "traceback",
      "stack",
      "stacktrace",
      "debug",
      "exception",
      "exc",
      "internal",
      "django",
      "request",
      "settings"
    ]);
    for (const [field, value] of Object.entries(data)) {
      if (internalKeys.has(field.toLowerCase())) continue;
      const messages = Array.isArray(value) ? value : [value];
      const text = messages.filter((m) => typeof m === "string").join(" ");
      if (!text) continue;
      const label = {
        username: "Username",
        email: "Email",
        password: "Password",
        password2: "Password confirmation",
        refresh: "Session",
        non_field_errors: ""
      }[field];
      if (label === "") parts.push(text);
      else if (label) parts.push(`${label}: ${text}`);
      else parts.push(text);
    }
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}
function fallbackForStatus(status) {
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That resource was not found.";
  if (status === 408 || status === 504) {
    return "The server took too long to respond. Please try again.";
  }
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server is temporarily unavailable. Please try again later.";
  return "Request failed. Please try again.";
}
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = true,
    retry = true,
    signal
  } = options;
  const headers = { Accept: "application/json" };
  if (body !== void 0 && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (auth && tokenStore.getAccess()) {
    headers.Authorization = `Bearer ${tokenStore.getAccess()}`;
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === void 0 ? void 0 : body instanceof FormData ? body : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(
      "We could not reach the server. Check your connection and try again.",
      { status: 0 }
    );
  }
  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, retry: false });
    }
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent("auth:expired"));
    throw new ApiError("Your session has expired. Please log in again.", { status: 401 });
  }
  const data = await readBody(response);
  const requestId = response.headers?.get?.("X-Request-ID") || null;
  if (!response.ok) {
    const message = humanizeError(data, fallbackForStatus(response.status));
    throw new ApiError(message, { status: response.status, data, requestId });
  }
  return data;
}
async function performRefresh() {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh })
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (!data || !data.access) return false;
    tokenStore.setAccess(data.access);
    if (data.refresh) tokenStore.setRefresh(data.refresh);
    return true;
  } catch {
    return false;
  }
}
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
var BASE_URL, ACCESS_KEY, REFRESH_KEY, tokenStore, ApiError, api, api_default, refreshInFlight;
var init_api = __esm({
  "src/services/api.js"() {
    BASE_URL = "https://api.example.test/api/v1".replace(/\/+$/, "");
    ACCESS_KEY = "cyberforge_access";
    REFRESH_KEY = "cyberforge_refresh";
    tokenStore = {
      getAccess: () => localStorage.getItem(ACCESS_KEY),
      getRefresh: () => localStorage.getItem(REFRESH_KEY),
      setTokens({ access, refresh }) {
        if (access) localStorage.setItem(ACCESS_KEY, access);
        if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
      },
      setAccess(access) {
        if (access) localStorage.setItem(ACCESS_KEY, access);
      },
      clear() {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
      }
    };
    ApiError = class extends Error {
      constructor(message, { status = 0, data = null, requestId = null } = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
        this.requestId = requestId;
      }
    };
    api = {
      get: (path, options) => request(path, { ...options, method: "GET" }),
      post: (path, body, options) => request(path, { ...options, method: "POST", body }),
      patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
      put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
      delete: (path, options) => request(path, { ...options, method: "DELETE" })
    };
    api_default = api;
    refreshInFlight = null;
  }
});

// scripts/api-harness/entry.mjs
var store = /* @__PURE__ */ new Map();
var localStorage2 = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  }
};
var window2 = {
  localStorage: localStorage2,
  dispatchEvent: () => true,
  addEventListener: () => {
  },
  removeEventListener: () => {
  }
};
var calls = [];
var queue = [];
var networkFailure = false;
var jsonResponse = (res) => {
  const headers = res.headers || {};
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    headers: { get: (name) => headers[name] ?? null },
    text: async () => {
      if (Object.prototype.hasOwnProperty.call(res, "raw")) return res.raw;
      return res.body == null ? "" : JSON.stringify(res.body);
    },
    json: async () => res.body
  };
};
var fetchStub = async (url, options = {}) => {
  if (networkFailure) throw new TypeError("Failed to fetch");
  calls.push({
    url,
    method: options.method || "GET",
    headers: options.headers || {}
  });
  return jsonResponse(queue.shift() || { status: 200, body: {} });
};
globalThis.localStorage = localStorage2;
globalThis.window = window2;
globalThis.fetch = fetchStub;
var { api: api2, humanizeError: humanizeError2, ApiError: ApiError2 } = await Promise.resolve().then(() => (init_api(), api_exports));
var tests = [];
var test = (name, fn) => tests.push([name, fn]);
var assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "assertion failed");
};
var assertEqual = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`${msg || "expected equal"}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
};
var queueResponses = (...responses) => {
  queue = responses;
};
var lastCall = () => calls[calls.length - 1];
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
  throw new Error("expected the request to fail");
}
test("DRF validation errors keep their useful field message", async () => {
  queueResponses({ status: 400, body: { username: ["A user with that username already exists."] } });
  const err = await captureError(() => api2.post("/auth/register/", {}));
  assert(err instanceof ApiError2, "expected an ApiError");
  assertEqual(err.status, 400);
  assert(/username/i.test(err.message), `unexpected message: ${err.message}`);
  assert(/already exists/i.test(err.message), `unexpected message: ${err.message}`);
});
test("unknown/internal error keys are never shown", async () => {
  const message = humanizeError2({
    traceback: "Traceback (most recent call last)",
    settings: { SECRET_KEY: "leak" },
    detail: "Safe message."
  });
  assertEqual(message, "Safe message.");
});
test("a network failure gives an understandable connection message", async () => {
  networkFailure = true;
  const err = await captureError(() => api2.get("/challenges/"));
  assert(err instanceof ApiError2, "expected an ApiError");
  assertEqual(err.status, 0);
  assert(/could not reach the server/i.test(err.message), `unexpected message: ${err.message}`);
  assert(/check your connection/i.test(err.message), `unexpected message: ${err.message}`);
});
test("an HTML debug page from a server error is never shown", async () => {
  queueResponses({
    status: 500,
    raw: "<!doctype html><html><body><pre>Traceback: /srv/app/db.sqlite3</pre></body></html>"
  });
  const err = await captureError(() => api2.get("/challenges/"));
  assertEqual(err.status, 500);
  assert(/server is temporarily unavailable/i.test(err.message), `unexpected message: ${err.message}`);
  assert(!err.message.includes("<"), "HTML must not be surfaced");
  assert(!err.message.includes("/srv/"), "internal paths must not be surfaced");
});
test("an empty 503 gives a temporary-unavailable message", async () => {
  queueResponses({ status: 503, body: null });
  const err = await captureError(() => api2.get("/stats/me/"));
  assertEqual(err.status, 503);
  assert(/temporarily unavailable/i.test(err.message), `unexpected message: ${err.message}`);
});
test("an empty 429 gives a wait-and-retry message", async () => {
  queueResponses({ status: 429, body: null });
  const err = await captureError(() => api2.post("/challenges/1/submit/", { flag: "CTF{x}" }));
  assertEqual(err.status, 429);
  assert(/too many requests/i.test(err.message), `unexpected message: ${err.message}`);
});
test("X-Request-ID is retained on an ApiError without being displayed", async () => {
  queueResponses({ status: 500, body: null, headers: { "X-Request-ID": "corr-123" } });
  const err = await captureError(() => api2.get("/challenges/"));
  assertEqual(err.requestId, "corr-123");
  assert(!err.message.includes("corr-123"), "the correlation ID must not leak into the user message");
});
test("successful responses are unaffected by correlation headers", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] }, headers: { "X-Request-ID": "corr-ok" } });
  const data = await api2.get("/challenges/");
  assertEqual(lastCall().method, "GET");
  assertEqual(data.count, 0);
});
var passed = 0;
var failures = [];
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
console.log(`
${passed}/${tests.length} passed`);
if (failures.length) {
  console.error(`
${failures.length} failing test(s).`);
  process.exitCode = 1;
}
