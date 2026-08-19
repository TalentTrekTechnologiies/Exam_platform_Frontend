// Single source of truth for the backend URL.
// Set VITE_API_URL in .env to point a build at a real server.
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

/** Exported for the few places that build URLs inline (file uploads, <img src>). */
export const API_BASE = BASE;

/**
 * Whether colleges may sign themselves up.
 *
 * False for a dedicated install — KSRM's own exam module, where the only admins
 * are KSRM staff and there is no notion of "registering an institution". The
 * server enforces this too; hiding the link alone would not stop anyone.
 */
export const REGISTRATION_ENABLED =
  String(import.meta.env.VITE_ALLOW_REGISTRATION ?? "true").toLowerCase() !== "false";

/**
 * The name this installation presents itself as. On KSRM's own deployment the
 * product should read as *their* exam module, not as a third-party platform.
 */
export const PLATFORM_NAME =
  import.meta.env.VITE_PLATFORM_NAME?.trim() || "Examination Portal";

/**
 * Which institution this page belongs to.
 *
 * Each college gets its own entrance, which is what lets two colleges both
 * number a student 24CSE001 without either candidate being locked out. Resolved
 * in order of how explicit it is:
 *
 *   1. VITE_INSTITUTION_CODE — a dedicated deployment, e.g. KSRM's own site.
 *   2. The subdomain — ksrm.exams.example.com on the shared platform.
 *
 * Empty means a single-college install, where the server falls back to matching
 * across the whole platform.
 */
export const INSTITUTION_CODE = (() => {
  const configured = import.meta.env.VITE_INSTITUTION_CODE;
  if (configured && configured.trim()) return configured.trim().toLowerCase();

  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  // Bare hosts and IPs carry no institution.
  if (host === "localhost" || /^[\d.]+$/.test(host)) return "";

  const [first, ...rest] = host.split(".");
  // Generic prefixes are the platform itself, not a college.
  const generic = ["www", "app", "exams", "exam", "portal"];
  return rest.length >= 2 && !generic.includes(first) ? first.toLowerCase() : "";
})();

export const apiUrl = (path) => `${BASE}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * A path INSIDE this app, for real browser navigations.
 *
 * React Router prefixes its own links with the basename, but anything using
 * window.location goes straight to the browser and skips that entirely. When
 * the app is mounted under /online, a bare "/admin/login" therefore leaves the
 * app and lands on whatever the host site serves at that address. Vite exposes
 * the mount point as BASE_URL, so this derives from the build rather than
 * being a second place to keep in sync.
 */
export const appPath = (path) => {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

/**
 * What the sign-in panel is dressed with.
 *
 * Paths under the app's own public folder, so swapping an institution is
 * replacing three files rather than editing a component — and either
 * can be pointed elsewhere from the build environment for a deployment that
 * keeps its assets on a CDN. Both are only a fallback: a logo uploaded in Exam
 * Settings always wins, because that one follows the account rather than the
 * build.
 */
export const SIGNIN_MEDIA = {
  logoIntro: import.meta.env.VITE_SIGNIN_LOGO_INTRO || "/branding/logo-intro.webm",
  logoStill: import.meta.env.VITE_SIGNIN_LOGO || "/branding/logo.webp",
};

/** Resolves an uploaded filename to a servable URL. Accepts full URLs unchanged. */
export const uploadUrl = (filename) => {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return encodeURI(filename);
  return encodeURI(`${BASE}/uploads/${filename}`);
};

// ── Tokens ──────────────────────────────────────────────────────────────────
// Admin and student tokens are stored under separate keys so an invigilator
// logged in as admin on the same machine can't have their session clobbered by
// a candidate signing in, or vice versa.
const ADMIN_TOKEN_KEY = "admin_token";
const STUDENT_TOKEN_KEY = "student_token";

export const tokens = {
  setAdmin: (t) => localStorage.setItem(ADMIN_TOKEN_KEY, t),
  getAdmin: () => localStorage.getItem(ADMIN_TOKEN_KEY),
  clearAdmin: () => localStorage.removeItem(ADMIN_TOKEN_KEY),

  setStudent: (t) => localStorage.setItem(STUDENT_TOKEN_KEY, t),
  getStudent: () => localStorage.getItem(STUDENT_TOKEN_KEY),
  clearStudent: () => localStorage.removeItem(STUDENT_TOKEN_KEY),
};

/** Which token a given path should carry. */
const tokenFor = (path) =>
  path.includes("/student/") ? tokens.getStudent() : tokens.getAdmin();

/**
 * Wipes one candidate's session without touching anything else.
 *
 * Exam-hall machines are reused between candidates, and an invigilator is often
 * signed in as admin in the same browser. A blanket localStorage.clear() would
 * log them out mid-exam, so removal is deliberately targeted: fixed student keys
 * plus the per-attempt keys, which are prefixed for exactly this reason.
 */
export const clearStudentSession = () => {
  [
    STUDENT_TOKEN_KEY,
    // The candidate's own keys only. "examId" and "slotId" belong to the admin
    // screens; clearing them here meant a candidate signing out wiped which
    // exam the invigilator was working on.
    "exam_user", "hallTicket", "studentName", "studentId",
    "student_examId", "student_slotId", "attemptId",
  ].forEach((k) => localStorage.removeItem(k));

  // exam_pending_*, exam_marked_*, exam_visited_*, exam_violations_*
  Object.keys(localStorage)
    .filter((k) => k.startsWith("exam_"))
    .forEach((k) => localStorage.removeItem(k));
};

/**
 * The cached admin profile, or null.
 *
 * Several layout components read this on every render, including on the login
 * screen where it is absent — a bare JSON.parse(null) throws and blanks the page.
 */
export const readAdmin = () => {
  try {
    const raw = localStorage.getItem("admin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True for errors worth retrying — network blips and 5xx, not 4xx. */
export const isRetryable = (error) =>
  error instanceof ApiError ? error.status === 0 || error.status >= 500 : true;

async function request(path, { method = "GET", body, signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort());

  const headers = body instanceof FormData ? {} : { "Content-Type": "application/json" };
  const token = tokenFor(path);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    // Network down, server unreachable, or timed out. Status 0 marks it retryable.
    throw new ApiError(
      e.name === "AbortError" ? "The server took too long to respond." : "Cannot reach the server.",
      0,
      "NETWORK"
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && (payload.message || payload.error)) ||
      (typeof payload === "string" && payload) ||
      `Request failed (${response.status})`;
    const code = payload && typeof payload === "object" ? payload.code : undefined;
    throw new ApiError(message, response.status, code);
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};

/**
 * Attaches the bearer token to every call to our own API, including the raw
 * `fetch` calls throughout the admin pages.
 *
 * A one-time interceptor rather than rewriting ten screens: the auth header is
 * a transport concern, and doing it here means a page added later cannot forget
 * it. Requests to any other host are passed through untouched.
 */
export function installAuthFetch() {
  if (typeof window === "undefined" || window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";

    if (!url.startsWith(BASE)) return nativeFetch(input, init);

    const path = url.slice(BASE.length);
    const token = tokenFor(path);

    if (token) {
      const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      init = { ...init, headers };
    }

    const response = await nativeFetch(input, init);

    // An expired or missing token should land the user on the right sign-in
    // screen rather than leaving the page half-rendered with silent failures.
    //
    // Paths go through appPath because these are real browser navigations, not
    // router ones — they bypass React Router and its basename entirely. Served
    // under /online, a bare "/verify" would leave the app completely and land
    // on the host site's page, so an expired session would look to a candidate
    // like the exam had vanished.
    if (response.status === 401 && !path.includes("/login") && !path.includes("/validate")) {
      if (path.includes("/student/")) {
        tokens.clearStudent();
        const to = appPath("/verify");
        // Never drag a member of staff to the candidate sign-in. A machine used
        // by a candidate keeps their session behind, and a stale candidate call
        // firing anywhere in the admin app would otherwise replace the page
        // they asked for with the wrong sign-in screen entirely.
        const onAdminScreen = window.location.pathname.startsWith(appPath("/admin"));
        if (!onAdminScreen && !window.location.pathname.startsWith(to)) {
          window.location.replace(to);
        }
      } else {
        tokens.clearAdmin();
        const to = appPath("/admin/login");
        if (!window.location.pathname.startsWith(to)) window.location.replace(to);
      }
    }

    return response;
  };
}

// ── Exam endpoints ──────────────────────────────────────────────────────────
export const examApi = {
  // The institution scopes the lookup, so identical roll numbers at different
  // colleges resolve to the right candidate.
  validate: (hallTicket, name) =>
    api.post("/student/validate", { hallTicket, name, institutionCode: INSTITUTION_CODE }),
  /** Public branding for the sign-in page, before anyone has authenticated. */
  institution: (code) => api.get(`/public/institution/${encodeURIComponent(code)}`),
  start: (studentId, examId) => api.post("/student/start", { studentId, examId }),
  paper: (attemptId) => api.get(`/student/paper/${attemptId}`),
  responses: (attemptId) => api.get(`/student/responses/${attemptId}`),
  saveAnswer: (attemptId, questionId, selectedOption) =>
    api.post("/student/answer", { attemptId, questionId, selectedOption }),
  remaining: (attemptId) => api.get(`/student/remaining/${attemptId}`),
  submit: (attemptId, reason) =>
    api.post(`/student/submit/${attemptId}?reason=${encodeURIComponent(reason || "candidate submitted")}`),
  /**
   * Reports a proctoring event. Deliberately swallows its own errors: an
   * integrity log must never interrupt a candidate's exam.
   */
  reportViolation: (attemptId, type, occurrence, detail) =>
    api.post("/student/violation", { attemptId, type, occurrence, detail }).catch(() => null),
  result: (attemptId) => api.get(`/student/result/${attemptId}`),
  examInfo: (examId) => api.get(`/student/exam-info/${examId}`),
};
