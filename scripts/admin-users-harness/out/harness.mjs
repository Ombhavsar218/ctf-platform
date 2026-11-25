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

// src/services/adminService.js
var adminService_exports = {};
__export(adminService_exports, {
  adminService: () => adminService,
  default: () => adminService_default
});
var adminService, adminService_default;
var init_adminService = __esm({
  "src/services/adminService.js"() {
    init_api();
    adminService = {
      /* ---------------------------------------------------------------- */
      /* Runtime platform settings (Admin -> Settings page).              */
      /* ---------------------------------------------------------------- */
      /**
       * Read the three enforced runtime settings.
       * GET /admin/settings/
       */
      async getPlatformSettings() {
        return api.get("/admin/settings/");
      },
      /**
       * Partially update runtime settings. The caller re-reads afterwards to
       * verify persistence before showing success.
       * PATCH /admin/settings/
       */
      async updatePlatformSettings(payload) {
        return api.patch("/admin/settings/", payload);
      },
      /* ---------------------------------------------------------------- */
      /* Real admin user-management API (Admin -> Users page).            */
      /* ---------------------------------------------------------------- */
      async listUsers({ page = 1, pageSize = 20, search = "", deleted = false } = {}) {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", String(pageSize));
        const term = (search || "").trim();
        if (term) params.set("search", term);
        if (deleted) params.set("deleted", "true");
        return api.get(`/admin/users/?${params.toString()}`);
      },
      async getUser(id, { deleted = false } = {}) {
        const suffix = deleted ? "?deleted=true" : "";
        return api.get(`/admin/users/${id}/${suffix}`);
      },
      async createUser(payload) {
        return api.post("/admin/users/", payload);
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
      async setUserStatus(id, status, statusNote = "") {
        return api.patch(`/admin/users/${id}/status/`, {
          status,
          status_note: statusNote || ""
        });
      },
      async setUserGroups(id, groupIds) {
        return api.patch(`/admin/users/${id}/groups/`, { groups: groupIds });
      },
      async listGroups() {
        return api.get("/admin/groups/");
      },
      /**
       * Platform-wide Dashboard/Analytics aggregates. Admin only.
       * GET /api/v1/admin/analytics/
       */
      async getAdminAnalytics() {
        return api.get("/admin/analytics/");
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
        actor = "",
        action = "",
        targetType = "",
        search = "",
        dateFrom = "",
        dateTo = ""
      } = {}) {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", String(pageSize));
        const add = (key, value) => {
          const trimmed = (value || "").trim();
          if (trimmed) params.set(key, trimmed);
        };
        add("actor", actor);
        add("action", action);
        add("target_type", targetType);
        add("search", search);
        add("date_from", dateFrom);
        add("date_to", dateTo);
        return api.get(`/admin/audit-logs/?${params.toString()}`);
      }
    };
    adminService_default = adminService;
  }
});

// src/utils/adminSettingsForm.js
var adminSettingsForm_exports = {};
__export(adminSettingsForm_exports, {
  DEFAULT_PLATFORM_SETTINGS: () => DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTING_FIELDS: () => PLATFORM_SETTING_FIELDS,
  buildPlatformSettingsPayload: () => buildPlatformSettingsPayload,
  normalizePlatformSettings: () => normalizePlatformSettings,
  platformSettingsEqual: () => platformSettingsEqual,
  platformSettingsFieldErrors: () => platformSettingsFieldErrors
});
function asBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return Boolean(value);
  return fallback;
}
function normalizePlatformSettings(data) {
  const source = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return PLATFORM_SETTING_FIELDS.reduce((settings, field) => {
    settings[field] = asBoolean(source[field], DEFAULT_PLATFORM_SETTINGS[field]);
    return settings;
  }, {});
}
function buildPlatformSettingsPayload(settings) {
  const normalized = normalizePlatformSettings(settings);
  return PLATFORM_SETTING_FIELDS.reduce((payload, field) => {
    payload[field] = normalized[field];
    return payload;
  }, {});
}
function platformSettingsEqual(left, right) {
  const a = normalizePlatformSettings(left);
  const b = normalizePlatformSettings(right);
  return PLATFORM_SETTING_FIELDS.every((field) => a[field] === b[field]);
}
function platformSettingsFieldErrors(error) {
  const data = error && typeof error === "object" ? error.data : null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return PLATFORM_SETTING_FIELDS.reduce((errors, field) => {
    const value = data[field];
    if (value == null) return errors;
    const text = Array.isArray(value) ? value.filter((item) => typeof item === "string").join(" ") : typeof value === "string" ? value : "";
    if (text) errors[field] = text;
    return errors;
  }, {});
}
var PLATFORM_SETTING_FIELDS, DEFAULT_PLATFORM_SETTINGS;
var init_adminSettingsForm = __esm({
  "src/utils/adminSettingsForm.js"() {
    PLATFORM_SETTING_FIELDS = Object.freeze([
      "allow_registration",
      "public_leaderboard",
      "allow_hints"
    ]);
    DEFAULT_PLATFORM_SETTINGS = Object.freeze({
      allow_registration: true,
      public_leaderboard: true,
      allow_hints: true
    });
  }
});

// src/services/platformSettingsService.js
var platformSettingsService_exports = {};
__export(platformSettingsService_exports, {
  loadPlatformSettings: () => loadPlatformSettings,
  savePlatformSettings: () => savePlatformSettings
});
async function loadPlatformSettings() {
  return normalizePlatformSettings(await adminService.getPlatformSettings());
}
async function savePlatformSettings(settings) {
  const payload = buildPlatformSettingsPayload(settings);
  await adminService.updatePlatformSettings(payload);
  const confirmed = await loadPlatformSettings();
  if (!platformSettingsEqual(confirmed, payload)) {
    throw new Error(
      "Settings were accepted but could not be verified. Reload the page to check them."
    );
  }
  return confirmed;
}
var init_platformSettingsService = __esm({
  "src/services/platformSettingsService.js"() {
    init_adminService();
    init_adminSettingsForm();
  }
});

// scripts/admin-users-harness/entry.mjs
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
var dispatchedEvents = [];
var listeners = {};
var window2 = {
  localStorage: localStorage2,
  dispatchEvent: (evt) => {
    dispatchedEvents.push(evt);
    return true;
  },
  addEventListener: (name, cb) => {
    (listeners[name] ||= []).push(cb);
  },
  removeEventListener: () => {
  }
};
var calls = [];
var queue = [];
var jsonResponse = (res) => ({
  ok: res.status >= 200 && res.status < 300,
  status: res.status,
  text: async () => res.body == null ? "" : JSON.stringify(res.body),
  json: async () => res.body
});
var fetchStub = async (url, options = {}) => {
  calls.push({
    url,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body === void 0 ? void 0 : JSON.parse(options.body)
  });
  const res = queue.shift() || { status: 200, body: {} };
  return jsonResponse(res);
};
globalThis.localStorage = localStorage2;
globalThis.window = window2;
globalThis.fetch = fetchStub;
var { adminService: adminService2 } = await Promise.resolve().then(() => (init_adminService(), adminService_exports));
var {
  loadPlatformSettings: loadPlatformSettings2,
  savePlatformSettings: savePlatformSettings2
} = await Promise.resolve().then(() => (init_platformSettingsService(), platformSettingsService_exports));
var {
  DEFAULT_PLATFORM_SETTINGS: DEFAULT_PLATFORM_SETTINGS2,
  buildPlatformSettingsPayload: buildPlatformSettingsPayload2,
  normalizePlatformSettings: normalizePlatformSettings2,
  platformSettingsEqual: platformSettingsEqual2,
  platformSettingsFieldErrors: platformSettingsFieldErrors2
} = await Promise.resolve().then(() => (init_adminSettingsForm(), adminSettingsForm_exports));
var { api: api2, tokenStore: tokenStore2, ApiError: ApiError2 } = await Promise.resolve().then(() => (init_api(), api_exports));
var BASE = "https://api.example.test/api/v1";
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
var lastCall = () => calls[calls.length - 1];
var queueResponses = (...responses) => {
  queue = responses;
};
var withToken = (t = "tok123") => tokenStore2.setTokens({ access: t });
function resetEnv() {
  calls = [];
  queue = [];
  store.clear();
  dispatchedEvents.length = 0;
}
test("listUsers builds the paginated URL from the configured base", async () => {
  queueResponses({ status: 200, body: { count: 0, next: null, previous: null, summary: {}, results: [] } });
  const data = await adminService2.listUsers();
  assertEqual(calls.length, 1);
  assertEqual(lastCall().method, "GET");
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=1&page_size=20`);
  assertEqual(data.count, 0);
});
test("listUsers forwards page, page_size and search", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers({ page: 3, pageSize: 5, search: "ada" });
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=3&page_size=5&search=ada`);
});
test("listUsers drops a blank search term", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers({ search: "   " });
  assert(!lastCall().url.includes("search="), "blank search must not be sent");
});
test("the Bearer token is attached when present", async () => {
  withToken("abc.def.ghi");
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers();
  assertEqual(lastCall().headers.Authorization, "Bearer abc.def.ghi");
});
test("no Authorization header is sent when logged out", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers();
  assert(lastCall().headers.Authorization === void 0, "expected no auth header");
});
test("getUser GETs the detail URL", async () => {
  queueResponses({ status: 200, body: { id: 7 } });
  const data = await adminService2.getUser(7);
  assertEqual(lastCall().method, "GET");
  assertEqual(lastCall().url, `${BASE}/admin/users/7/`);
  assertEqual(data.id, 7);
});
test("createUser POSTs a JSON body", async () => {
  withToken();
  queueResponses({ status: 201, body: { id: 1, username: "neo" } });
  const data = await adminService2.createUser({ username: "neo", password: "Str0ng-Pass!42" });
  assertEqual(lastCall().method, "POST");
  assertEqual(lastCall().url, `${BASE}/admin/users/`);
  assertEqual(lastCall().headers["Content-Type"], "application/json");
  assertEqual(lastCall().body.username, "neo");
  assertEqual(data.id, 1);
});
test("updateUser PATCHes profile fields to the detail URL", async () => {
  queueResponses({ status: 200, body: { id: 5 } });
  await adminService2.updateUser(5, { first_name: "Ada", email: "ada@example.com" });
  assertEqual(lastCall().method, "PATCH");
  assertEqual(lastCall().url, `${BASE}/admin/users/5/`);
  assertEqual(lastCall().body.first_name, "Ada");
});
test("removeUser sends DELETE and tolerates an empty 204", async () => {
  queueResponses({ status: 204, body: null });
  const data = await adminService2.removeUser(7);
  assertEqual(lastCall().method, "DELETE");
  assertEqual(lastCall().url, `${BASE}/admin/users/7/`);
  assertEqual(data, null);
});
test("listUsers adds deleted=true only when asked", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers({ deleted: true });
  assertEqual(lastCall().url, `${BASE}/admin/users/?page=1&page_size=20&deleted=true`);
});
test("listUsers omits deleted for the active view", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listUsers({ deleted: false });
  assert(!lastCall().url.includes("deleted="), "active view must not send deleted");
});
test("getUser forwards the deleted flag for a deleted account", async () => {
  queueResponses({ status: 200, body: { id: 7, deleted_at: "2026-01-01T00:00:00Z" } });
  await adminService2.getUser(7, { deleted: true });
  assertEqual(lastCall().url, `${BASE}/admin/users/7/?deleted=true`);
});
test("restoreUser POSTs to the restore endpoint", async () => {
  queueResponses({ status: 200, body: { id: 7, status: "active", deleted_at: null } });
  const data = await adminService2.restoreUser(7);
  assertEqual(lastCall().method, "POST");
  assertEqual(lastCall().url, `${BASE}/admin/users/7/restore/`);
  assertEqual(data.deleted_at, null);
});
test("setUserStatus PATCHes status and note", async () => {
  queueResponses({ status: 200, body: { id: 7, status: "suspended" } });
  await adminService2.setUserStatus(7, "suspended", "spam");
  assertEqual(lastCall().method, "PATCH");
  assertEqual(lastCall().url, `${BASE}/admin/users/7/status/`);
  assertEqual(lastCall().body.status, "suspended");
  assertEqual(lastCall().body.status_note, "spam");
});
test("setUserStatus defaults the note to an empty string", async () => {
  queueResponses({ status: 200, body: {} });
  await adminService2.setUserStatus(7, "active");
  assertEqual(lastCall().body.status_note, "");
});
test("setUserGroups PATCHes the group id list", async () => {
  queueResponses({ status: 200, body: { id: 7, groups: [] } });
  await adminService2.setUserGroups(7, [2, 3]);
  assertEqual(lastCall().url, `${BASE}/admin/users/7/groups/`);
  assertEqual(JSON.stringify(lastCall().body.groups), "[2,3]");
});
test("listGroups GETs the assignable groups", async () => {
  queueResponses({ status: 200, body: [{ id: 1, name: "Admin" }] });
  const data = await adminService2.listGroups();
  assertEqual(lastCall().method, "GET");
  assertEqual(lastCall().url, `${BASE}/admin/groups/`);
  assertEqual(data[0].name, "Admin");
});
test("403 becomes an ApiError with a permission message", async () => {
  withToken();
  queueResponses({ status: 403, body: null });
  let err;
  try {
    await adminService2.listUsers();
  } catch (e) {
    err = e;
  }
  assert(err instanceof ApiError2, "expected an ApiError");
  assertEqual(err.status, 403);
  assert(/permission/i.test(err.message), `unexpected message: ${err.message}`);
});
test("400 surfaces the field-level validation message", async () => {
  withToken();
  queueResponses({ status: 400, body: { username: ["A user with that username already exists."] } });
  let err;
  try {
    await adminService2.createUser({ username: "neo", password: "x" });
  } catch (e) {
    err = e;
  }
  assertEqual(err.status, 400);
  assert(/username/i.test(err.message), `unexpected message: ${err.message}`);
});
test("404 becomes an ApiError without leaking internals", async () => {
  withToken();
  queueResponses({ status: 404, body: null });
  let err;
  try {
    await adminService2.getUser(999);
  } catch (e) {
    err = e;
  }
  assertEqual(err.status, 404);
  assert(/not found/i.test(err.message), `unexpected message: ${err.message}`);
});
test("401 with no refresh token clears the session and emits auth:expired", async () => {
  withToken();
  queueResponses({ status: 401, body: null });
  let err;
  try {
    await adminService2.listUsers();
  } catch (e) {
    err = e;
  }
  assertEqual(err.status, 401);
  assertEqual(calls.length, 1, "should not retry without a refresh token");
  assertEqual(localStorage2.getItem("cyberforge_access"), null);
  assertEqual(dispatchedEvents.length, 1);
  assertEqual(dispatchedEvents[0].type, "auth:expired");
});
test("401 with a valid refresh token retries once using the new access token", async () => {
  tokenStore2.setTokens({ access: "old", refresh: "refresh-1" });
  queueResponses(
    { status: 401, body: null },
    { status: 200, body: { access: "new-access" } },
    { status: 200, body: { count: 1, results: [{ id: 1 }] } }
  );
  const data = await adminService2.listUsers();
  assertEqual(calls.length, 3, "list, refresh, retried list");
  assertEqual(calls[1].url, `${BASE}/auth/refresh/`);
  assertEqual(calls[1].body.refresh, "refresh-1");
  assertEqual(calls[2].headers.Authorization, "Bearer new-access");
  assertEqual(tokenStore2.getAccess(), "new-access");
  assertEqual(data.count, 1);
});
test("listAuditLogs builds the paginated audit URL", async () => {
  queueResponses({ status: 200, body: { count: 0, next: null, previous: null, results: [] } });
  const data = await adminService2.listAuditLogs();
  assertEqual(calls.length, 1);
  assertEqual(lastCall().method, "GET");
  assertEqual(lastCall().url, `${BASE}/admin/audit-logs/?page=1&page_size=20`);
  assertEqual(data.count, 0);
});
test("listAuditLogs forwards every server-side filter and trims blanks", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listAuditLogs({
    page: 2,
    pageSize: 10,
    actor: " admin ",
    action: "user.status_change",
    targetType: "user",
    search: " ada ",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-22"
  });
  const url = lastCall().url;
  assertEqual(url, `${BASE}/admin/audit-logs/?page=2&page_size=10&actor=admin&action=user.status_change&target_type=user&search=ada&date_from=2026-10-01&date_to=2026-10-22`);
});
test("listAuditLogs omits blank filters", async () => {
  queueResponses({ status: 200, body: { count: 0, results: [] } });
  await adminService2.listAuditLogs({
    actor: "  ",
    action: "",
    targetType: "",
    search: "   ",
    dateFrom: "",
    dateTo: ""
  });
  assertEqual(lastCall().url, `${BASE}/admin/audit-logs/?page=1&page_size=20`);
});
test("listAuditLogs 403 surfaces the permission message", async () => {
  withToken();
  queueResponses({ status: 403, body: null });
  let err;
  try {
    await adminService2.listAuditLogs();
  } catch (e) {
    err = e;
  }
  assert(err instanceof ApiError2, "expected an ApiError");
  assertEqual(err.status, 403);
  assert(/permission/i.test(err.message), `unexpected message: ${err.message}`);
});
test("getPlatformSettings GETs the admin settings endpoint", async () => {
  withToken();
  queueResponses({
    status: 200,
    body: { allow_registration: true, public_leaderboard: true, allow_hints: true }
  });
  const data = await adminService2.getPlatformSettings();
  assertEqual(lastCall().method, "GET");
  assertEqual(lastCall().url, `${BASE}/admin/settings/`);
  assertEqual(lastCall().headers.Authorization, "Bearer tok123");
  assertEqual(data.allow_hints, true);
});
test("updatePlatformSettings PATCHes only the three supported fields", async () => {
  queueResponses({ status: 200, body: { allow_hints: false } });
  await adminService2.updatePlatformSettings({ allow_hints: false });
  assertEqual(lastCall().method, "PATCH");
  assertEqual(lastCall().url, `${BASE}/admin/settings/`);
  assertEqual(lastCall().headers["Content-Type"], "application/json");
  assertEqual(lastCall().body.allow_hints, false);
});
test("platform settings normalize missing optional fields to safe defaults", () => {
  assertEqual(JSON.stringify(normalizePlatformSettings2({})), JSON.stringify(DEFAULT_PLATFORM_SETTINGS2));
  const partial = normalizePlatformSettings2({ allow_hints: false });
  assertEqual(partial.allow_hints, false);
  assertEqual(partial.allow_registration, true);
  assertEqual(partial.public_leaderboard, true);
});
test("platform settings payload contains only approved fields", () => {
  const payload = buildPlatformSettingsPayload2({
    allow_registration: false,
    public_leaderboard: true,
    allow_hints: false,
    debug: true,
    secret: "must-not-be-sent"
  });
  assertEqual(JSON.stringify(Object.keys(payload).sort()), JSON.stringify([
    "allow_hints",
    "allow_registration",
    "public_leaderboard"
  ]));
  assertEqual(payload.allow_registration, false);
  assertEqual(payload.allow_hints, false);
});
test("platform settings equality ignores unrelated fields", () => {
  assert(platformSettingsEqual2(
    { allow_registration: true, public_leaderboard: true, allow_hints: true, extra: 1 },
    { allow_registration: true, public_leaderboard: true, allow_hints: true }
  ), "expected equal settings");
  assert(!platformSettingsEqual2(
    { allow_registration: true, public_leaderboard: true, allow_hints: true },
    { allow_registration: true, public_leaderboard: false, allow_hints: true }
  ), "expected different settings");
});
test("platform settings field errors are limited to approved fields", () => {
  const errors = platformSettingsFieldErrors2({
    data: {
      allow_hints: ["Must be a boolean."],
      debug: ["Do not display."]
    }
  });
  assertEqual(errors.allow_hints, "Must be a boolean.");
  assertEqual(errors.debug, void 0);
});
test("loadPlatformSettings reads and normalizes the API response", async () => {
  queueResponses({
    status: 200,
    body: { allow_registration: false, allow_hints: false }
  });
  const settings = await loadPlatformSettings2();
  assertEqual(calls.length, 1);
  assertEqual(settings.allow_registration, false);
  assertEqual(settings.allow_hints, false);
  assertEqual(settings.public_leaderboard, true);
});
test("savePlatformSettings PATCHes then re-reads before resolving", async () => {
  withToken();
  const stored = {
    allow_registration: false,
    public_leaderboard: true,
    allow_hints: false
  };
  queueResponses(
    { status: 200, body: stored },
    { status: 200, body: stored }
  );
  const confirmed = await savePlatformSettings2(stored);
  assertEqual(calls.length, 2, "PATCH and verification GET");
  assertEqual(calls[0].method, "PATCH");
  assertEqual(calls[1].method, "GET");
  assertEqual(calls[0].body.allow_registration, false);
  assertEqual(confirmed.allow_hints, false);
});
test("savePlatformSettings rejects when the verification read disagrees", async () => {
  queueResponses(
    { status: 200, body: { allow_hints: true } },
    { status: 200, body: { allow_hints: false } }
  );
  let err;
  try {
    await savePlatformSettings2({ allow_hints: true });
  } catch (e) {
    err = e;
  }
  assert(Boolean(err), "expected a verification error");
  assert(/verif/i.test(err.message), `unexpected message: ${err.message}`);
  assertEqual(calls.length, 2);
});
test("savePlatformSettings does not re-read after a PATCH error", async () => {
  queueResponses({ status: 400, body: { allow_hints: ["Must be a boolean."] } });
  let err;
  try {
    await savePlatformSettings2({ allow_hints: true });
  } catch (e) {
    err = e;
  }
  assert(err instanceof ApiError2, "expected an ApiError");
  assertEqual(err.status, 400);
  assertEqual(calls.length, 1, "must not verify a failed PATCH");
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
