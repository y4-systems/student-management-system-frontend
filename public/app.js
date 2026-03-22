﻿/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   UNIPORTAL â€” Application Logic
   Student Management System Frontend
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

// â”€â”€ API Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ENV_CONFIG =
  (typeof window !== "undefined" && window.__UNI_PORTAL_CONFIG__) || {};

const REQUIRED_API_CONFIG_KEYS = ["GATEWAY_URL"];

function getMissingApiConfigKeys() {
  return REQUIRED_API_CONFIG_KEYS.filter((key) => !ENV_CONFIG[key]);
}

const CONFIG = {
  GATEWAY_URL: ENV_CONFIG.GATEWAY_URL,
  INITIAL_PAGE: ENV_CONFIG.INITIAL_PAGE || "dashboard"
};

const PAGE_ROUTES = {
  dashboard: "/dashboard",
  students: "/students",
  courses: "/courses",
  enrollments: "/enrollments",
  grades: "/grades"
};

const VALID_PAGES = Object.keys(PAGE_ROUTES);

function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw || raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
}

function resolvePageFromPath(pathname) {
  const normalizedPath = normalizePathname(pathname);
  if (normalizedPath === "/") return "dashboard";

  const matched = Object.entries(PAGE_ROUTES).find(
    ([, route]) => route === normalizedPath
  );

  return matched ? matched[0] : "dashboard";
}

function resolveRouteForPage(page) {
  return PAGE_ROUTES[page] || PAGE_ROUTES.dashboard;
}

function getInitialPagePreference() {
  const fromConfig = String(CONFIG.INITIAL_PAGE || "")
    .trim()
    .toLowerCase();
  if (VALID_PAGES.includes(fromConfig)) {
    return fromConfig;
  }
  if (typeof window === "undefined") return "dashboard";
  return resolvePageFromPath(window.location.pathname);
}

function syncBrowserRoute(page, options = {}) {
  if (typeof window === "undefined") return;

  const nextRoute = resolveRouteForPage(page);
  const currentRoute = normalizePathname(window.location.pathname);
  if (nextRoute === currentRoute) return;

  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({ page }, "", nextRoute);
}

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let state = {
  token: localStorage.getItem("uniportal_token") || null,
  user: JSON.parse(localStorage.getItem("uniportal_user") || "null"),
  adminCreatedStudents: JSON.parse(
    localStorage.getItem("uniportal_admin_students") || "[]"
  ),
  currentPage: "dashboard",
  enrollmentView: { type: "all", value: null },
  enrollmentPoller: null,
  enrollmentRefreshInProgress: false
};

const uiState = {
  pendingStudentDeletion: null
};

function looksLikeJWT(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

function clearStoredAuth() {
  state.token = null;
  state.user = null;
  state.adminCreatedStudents = [];
  localStorage.removeItem("uniportal_token");
  localStorage.removeItem("uniportal_user");
  localStorage.removeItem("uniportal_admin_students");
}

function decodeJWTPayload(token) {
  if (!looksLikeJWT(token)) return null;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function deriveCanonicalInternalId(baseUser = {}, claims = {}) {
  const candidates = [baseUser?._id, claims?.id, claims?.sub, baseUser?.id];

  return candidates.find((value) => isMongoObjectId(value)) || null;
}

function derivePublicStudentId(baseUser = {}, claims = {}) {
  const candidates = [
    baseUser?.studentId,
    baseUser?.id,
    claims?.studentId,
    claims?.id,
    claims?.sub
  ];

  return candidates.find((value) => value && !isMongoObjectId(value)) || null;
}

function hydrateUserFromToken() {
  const claims = decodeJWTPayload(state.token);
  if (!claims) return;

  const canonicalId = deriveCanonicalInternalId(state.user, claims);
  const publicStudentId = derivePublicStudentId(state.user, claims);

  state.user = {
    ...(state.user || {}),
    id:
      canonicalId ||
      state.user?.id ||
      state.user?._id ||
      claims.id ||
      claims.sub ||
      null,
    _id: canonicalId || state.user?._id || null,
    studentId: state.user?.studentId || publicStudentId || null,
    email: state.user?.email || claims.email || null,
    name:
      state.user?.name ||
      claims.name ||
      claims.email?.split("@")?.[0] ||
      "User",
    role: state.user?.role || claims.role || "student"
  };

  localStorage.setItem("uniportal_user", JSON.stringify(state.user));
}

function getCurrentStudentId() {
  return (
    state.user?.id ||
    state.user?._id ||
    decodeJWTPayload(state.token)?.id ||
    decodeJWTPayload(state.token)?.sub ||
    null
  );
}

function getCurrentUserRole() {
  return state.user?.role || decodeJWTPayload(state.token)?.role || "student";
}

function isMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || "").trim());
}

function toPublicStudentId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (!isMongoObjectId(raw)) return raw;

  try {
    // One-to-one conversion keeps IDs unique while hiding MongoDB ObjectId format.
    const compact = BigInt(`0x${raw}`)
      .toString(36)
      .toUpperCase()
      .padStart(19, "0");
    return `STU-${compact}`;
  } catch {
    return `STU-${raw.slice(-10).toUpperCase()}`;
  }
}

function normalizeStudentIdInput(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isValidStudentIdFormat(value) {
  return /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(String(value || "").trim());
}

// â”€â”€ DOM References â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INITIALIZATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function bootstrapApp() {
  if (window.__UNI_PORTAL_BOOTSTRAPPED__) return;
  window.__UNI_PORTAL_BOOTSTRAPPED__ = true;
  initApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}

function initApp() {
  // Ignore stale/demo tokens that are not real JWTs.
  if (state.token && !looksLikeJWT(state.token)) {
    clearStoredAuth();
  }
  const missingConfigKeys = getMissingApiConfigKeys();
  if (missingConfigKeys.length > 0) {
    const message = `Missing API configuration: ${missingConfigKeys.join(", ")}. Check your .env.local values.`;
    console.error(message);
    showLogin();
    setAuthStatus(message, "error");
    return;
  }
  hydrateUserFromToken();

  // Check if user is logged in
  if (state.token) {
    showApp();
  } else {
    showLogin();
  }

  // Event Listeners
  setupAuthForms();
  setupNavigation();
  setupModals();
  setupStudentCreateForm();
  setupStudentEditForm();
  setupStudentDeleteModal();
  setupCourseCreateForm();
  setupCourseEditForm();
  setupCapacityButtons();
  setupEnrollmentForm();
  setupStatusForm();
  setupFilters();
  setupProfile();
  setupLogout();
  setupMobileMenu();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  AUTHENTICATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setupAuthForms() {
  const loginForm = $("#login-form");
  const registerForm = $("#register-form");

  $("#auth-tab-login").addEventListener("click", () => switchAuthMode("login"));
  $("#auth-tab-register").addEventListener("click", () =>
    switchAuthMode("register")
  );

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthStatus("");
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;

    if (!email || !password) {
      showToast("Please fill in all fields", "warning");
      return;
    }

    const btn = $("#login-btn");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "<span>Signing in...</span>";
    setAuthStatus("Signing in...", "info");

    try {
      await loginWithCredentials(email, password);
      setAuthStatus("Login successful", "success");
      showToast("Welcome back!", "success");
      showApp();
    } catch (err) {
      setAuthStatus(err.message || "Login failed", "error");
      showToast(err.message || "Login failed", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthStatus("");
    const payload = {
      name: $("#register-name").value.trim(),
      email: $("#register-email").value.trim(),
      phone: $("#register-phone").value.trim(),
      password: $("#register-password").value,
      role: ($("#register-role").value || "student").trim().toLowerCase()
    };

    if (
      !payload.name ||
      !payload.email ||
      !payload.phone ||
      !payload.password ||
      !payload.role
    ) {
      showToast("Please fill in all fields", "warning");
      return;
    }

    const btn = $("#register-btn");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "<span>Creating account...</span>";
    setAuthStatus("Creating account...", "info");

    try {
      await registerStudent(payload);
      setAuthStatus("Account created. Signing you in...", "success");
      await loginWithCredentials(payload.email, payload.password);
      showToast("Registration successful", "success");
      showApp();
    } catch (err) {
      setAuthStatus(err.message || "Registration failed", "error");
      showToast(err.message || "Registration failed", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

function switchAuthMode(mode) {
  const isLogin = mode === "login";
  $("#auth-tab-login").classList.toggle("active", isLogin);
  $("#auth-tab-register").classList.toggle("active", !isLogin);
  $("#login-form").classList.toggle("hidden", !isLogin);
  $("#register-form").classList.toggle("hidden", isLogin);
  setAuthStatus("");
}

function setAuthStatus(message, type = "") {
  const el = $("#auth-status");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.className = "auth-status hidden";
    return;
  }
  el.textContent = message;
  el.className = `auth-status ${type}`.trim();
}

async function loginWithCredentials(email, password) {
  const response = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (!response?.token) {
    throw new Error("Invalid login response from auth service");
  }

  state.token = response.token;
  const claims = decodeJWTPayload(response.token) || {};
  const baseUser = response.user || { email, name: email.split("@")[0] };
  const canonicalId = deriveCanonicalInternalId(baseUser, claims);
  const publicStudentId = derivePublicStudentId(baseUser, claims);
  state.user = {
    ...baseUser,
    id:
      canonicalId ||
      baseUser.id ||
      baseUser._id ||
      claims.id ||
      claims.sub ||
      null,
    _id: canonicalId || baseUser._id || null,
    studentId: baseUser.studentId || publicStudentId || null,
    role: baseUser.role || claims.role || "student"
  };
  localStorage.setItem("uniportal_token", state.token);
  localStorage.setItem("uniportal_user", JSON.stringify(state.user));
}

async function registerStudent(payload) {
  return await fetchAPI(`${CONFIG.GATEWAY_URL}/api/auth/register`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function setupLogout() {
  $("#logout-btn").addEventListener("click", () => {
    stopEnrollmentPolling();
    clearStoredAuth();
    showLogin();
    showToast("Logged out successfully", "info");
  });
}

function showLogin() {
  stopEnrollmentPolling();
  $("#login-page").classList.add("active");
  $("#app-shell").classList.add("hidden");
  switchAuthMode("login");
}

function showApp() {
  $("#login-page").classList.remove("active");
  $("#app-shell").classList.remove("hidden");

  // Set user avatar
  if (state.user?.name) {
    $("#user-avatar span").textContent = state.user.name
      .charAt(0)
      .toUpperCase();
  }
  $("#user-role-badge").textContent = getCurrentUserRole();
  applyRoleAccessControls();
  applyEnrollmentAccessControls();
  populateProfileModal();

  // Open route-aligned section on login/refresh.
  navigateTo(getInitialPagePreference(), { replaceRoute: true });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  NAVIGATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setupNavigation() {
  $$(".nav-item[data-page]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });

  window.addEventListener("popstate", () => {
    if (!state.token) return;
    const page = resolvePageFromPath(window.location.pathname);
    navigateTo(page, { updateRoute: false });
  });
}

function navigateTo(page, options = {}) {
  const targetPage = VALID_PAGES.includes(page) ? page : "dashboard";

  // Update active nav
  $$(".nav-item[data-page]").forEach((n) => n.classList.remove("active"));
  const activeNav = $(`.nav-item[data-page="${targetPage}"]`);
  if (activeNav) activeNav.classList.add("active");

  // Update page sections
  $$(".page-section").forEach((s) => s.classList.remove("active"));
  const section = $(`#page-${targetPage}`);
  if (section) section.classList.add("active");

  // Update title
  const titles = {
    dashboard: "Dashboard",
    students: "Students",
    courses: "Courses",
    enrollments: "Enrollments",
    grades: "Grades"
  };
  $("#page-title").textContent = titles[targetPage] || targetPage;
  state.currentPage = targetPage;

  if (options.updateRoute !== false) {
    syncBrowserRoute(targetPage, { replace: options.replaceRoute === true });
  }

  if (targetPage === "enrollments") {
    startEnrollmentPolling();
  } else {
    stopEnrollmentPolling();
  }

  // Close mobile sidebar
  $("#sidebar").classList.remove("open");
  const overlay = $(".sidebar-overlay");
  if (overlay) overlay.classList.remove("show");

  // Load page data
  if (!options.skipPageLoad) {
    switch (targetPage) {
      case "dashboard":
        loadDashboard();
        break;
      case "students":
        loadStudents();
        break;
      case "courses":
        loadCourses();
        break;
      case "enrollments":
        loadAllEnrollments();
        break;
      case "grades":
        break; // loaded on filter
    }
  }
}

function startEnrollmentPolling() {
  stopEnrollmentPolling();
  state.enrollmentPoller = setInterval(() => {
    if (state.currentPage === "enrollments") {
      refreshEnrollmentView();
    }
  }, 8000);
}

function stopEnrollmentPolling() {
  if (!state.enrollmentPoller) return;
  clearInterval(state.enrollmentPoller);
  state.enrollmentPoller = null;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MOBILE MENU
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setupMobileMenu() {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  $("#menu-toggle").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", () => {
    $("#sidebar").classList.remove("open");
    overlay.classList.remove("show");
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  DASHBOARD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function loadDashboard() {
  checkSystemHealth();
  loadDashboardStats();
}

async function loadDashboardStats() {
  const role = getCurrentUserRole();
  const ownId = getCurrentStudentId();

  // Students count
  try {
    if (role !== "admin") {
      if (!ownId) throw new Error("Missing student id");
      await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students/${ownId}`);
      $("#stat-students").textContent = "1";
    } else {
      const localCount = Array.isArray(state.adminCreatedStudents)
        ? state.adminCreatedStudents.length
        : 0;
      $("#stat-students").textContent = String(localCount);
    }
  } catch {
    $("#stat-students").textContent = "0";
  }

  // Courses count
  try {
    const courses = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`);
    const count = Array.isArray(courses) ? courses.length : courses?.count || 0;
    $("#stat-courses").textContent = count;
  } catch {
    $("#stat-courses").textContent = "0";
  }

  // Enrollments count (admin = all, student = own)
  try {
    const enrollments =
      role === "admin"
        ? await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments`)
        : await fetchAPI(
            `${CONFIG.GATEWAY_URL}/api/enrollments/student/${ownId}`
          );
    $("#stat-enrollments").textContent = Array.isArray(enrollments)
      ? enrollments.length
      : "0";
    if (Array.isArray(enrollments)) {
      const enriched = await enrichEnrollmentRows(enrollments.slice(0, 5));
      updateRecentEnrollments(enriched);
    }
  } catch {
    $("#stat-enrollments").textContent = "0";
    updateRecentEnrollments([]);
  }
  $("#stat-gpa").textContent = "-";
}

async function checkSystemHealth() {
  const services = ["gateway", "student", "course", "enrollment", "grade"];
  let gatewayOnline = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${CONFIG.GATEWAY_URL}/health`, {
      mode: "cors",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok)
      throw new Error(`Gateway health failed: ${response.status}`);
    gatewayOnline = true;
  } catch {
    gatewayOnline = false;
  }

  for (const id of services) {
    const dotEl = $(`#health-${id}`)
      ?.closest(".health-item")
      ?.querySelector(".health-dot");
    const statusEl = $(`#health-${id}`);

    if (gatewayOnline) {
      if (dotEl) dotEl.classList.add("online");
      if (dotEl) dotEl.classList.remove("offline");
      if (statusEl) {
        statusEl.textContent = id === "gateway" ? "Online" : "Via Gateway";
        statusEl.style.color =
          id === "gateway" ? "var(--emerald)" : "var(--text-secondary)";
      }
    } else {
      if (dotEl) dotEl.classList.add("offline");
      if (dotEl) dotEl.classList.remove("online");
      if (statusEl) {
        statusEl.textContent = "Offline";
        statusEl.style.color = "var(--rose)";
      }
    }
  }

  const badge = $("#gateway-badge");
  if (gatewayOnline) {
    badge.textContent = "Gateway Online";
    badge.className = "badge badge-success";
  } else {
    badge.textContent = "Offline";
    badge.className = "badge badge-danger";
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  STUDENTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function loadStudents() {
  const tbody = $("#students-tbody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="empty-state">Loading students...</td></tr>';

  try {
    const role = getCurrentUserRole();
    const studentId = getCurrentStudentId();
    let students = [];

    if (role === "admin") {
      // Fetch the full student list from the backend
      const list = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students`);
      if (Array.isArray(list)) students = list;

      // Merge any students created this session that may not yet be in the list
      if (Array.isArray(state.adminCreatedStudents)) {
        const dedup = new Map();
        students.forEach((s) =>
          dedup.set(String(s._id || s.id || s.studentId), s)
        );
        state.adminCreatedStudents.forEach((s) =>
          dedup.set(String(s._id || s.id || s.studentId), s)
        );
        students = [...dedup.values()];
      }
    } else if (studentId) {
      // Non-admin: fetch only own record
      const student = await fetchAPI(
        `${CONFIG.GATEWAY_URL}/api/students/${studentId}`
      );
      if (student) students.push(student);
    }

    if (!Array.isArray(students) || students.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No students found</td></tr>';
      return;
    }

    const isAdminUser = getCurrentUserRole() === "admin";
    tbody.innerHTML = students
      .map((s) => {
        const rowId = s._id || s.id || "";
        const publicStudentId = s.studentId || toPublicStudentId(rowId);
        const canMutateStudent =
          !!rowId &&
          (isAdminUser ||
            String(rowId || "") === String(getCurrentStudentId() || ""));
        const displayName =
          s.name || [s.firstName, s.lastName].filter(Boolean).join(" ") || "-";
        return `
            <tr>
                <td><code>${publicStudentId}</code></td>
                <td>${displayName}</td>
                <td>${s.email || "-"}</td>
                <td>${s.programme || s.department || "-"}</td>
                <td><span class="badge badge-success">${s.status || "Active"}</span></td>
                <td class="actions-cell">
                    <button class="btn btn-outline btn-xs" onclick="viewStudentEnrollments('${rowId}')">Enrollments</button>
                    ${canMutateStudent ? `<button class="btn btn-outline btn-xs" onclick="editStudent('${rowId}')">Edit</button>` : ""}
                    ${canMutateStudent ? `<button class="btn btn-danger btn-xs" onclick="promptDeleteStudent('${rowId}', '${publicStudentId}')">Delete</button>` : ""}
                </td>
            </tr>
        `;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Unable to load students - ${err.message}</td></tr>`;
  }
}

function viewStudentEnrollments(studentId) {
  navigateTo("enrollments", { skipPageLoad: true });
  $("#filter-student-id").value = studentId;
  loadEnrollmentsByStudent(studentId);
}

function setStudentFormStatus(elementId, message, type = "") {
  const el = $(`#${elementId}`);
  if (!el) return;

  if (!message) {
    el.textContent = "";
    el.className = "modal-form-status hidden";
    return;
  }

  el.textContent = message;
  el.className = `modal-form-status ${type}`.trim();
}

function normalizeStudentRecord(student, fallback = {}) {
  const id = student?.id || student?._id || fallback.id || fallback._id || "";
  const studentId = student?.studentId || fallback.studentId || "";
  return {
    ...fallback,
    ...student,
    _id: id,
    id,
    studentId
  };
}

async function resolveStudentReference(studentRef) {
  const raw = String(studentRef || "").trim();
  if (!raw) return "";
  if (isMongoObjectId(raw)) return raw;

  const ownInternalId = getCurrentStudentId();
  const ownPublicId = state.user?.studentId || "";
  if (ownInternalId && raw === ownPublicId) {
    return ownInternalId;
  }

  try {
    const students = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students`);
    if (Array.isArray(students)) {
      const match = students.find(
        (student) =>
          String(student?.studentId || "")
            .trim()
            .toUpperCase() === raw.toUpperCase() ||
          String(student?._id || student?.id || "").trim() === raw
      );
      if (match) {
        return match._id || match.id || raw;
      }
    }
  } catch {
    // Fall back to the supplied reference if lookup is unavailable.
  }

  return raw;
}

function upsertAdminStudentCache(student) {
  const normalized = normalizeStudentRecord(student);
  const studentId = normalized.id || normalized._id;
  if (!studentId) return;

  const current = Array.isArray(state.adminCreatedStudents)
    ? state.adminCreatedStudents
    : [];
  const filtered = current.filter(
    (item) =>
      String(item?._id || item?.id || item?.studentId) !== String(studentId)
  );
  state.adminCreatedStudents = [...filtered, normalized];
  localStorage.setItem(
    "uniportal_admin_students",
    JSON.stringify(state.adminCreatedStudents)
  );
}

function removeAdminStudentFromCache(studentId) {
  if (!studentId) return;
  const current = Array.isArray(state.adminCreatedStudents)
    ? state.adminCreatedStudents
    : [];
  state.adminCreatedStudents = current.filter(
    (item) =>
      String(item?._id || item?.id || item?.studentId) !== String(studentId)
  );
  localStorage.setItem(
    "uniportal_admin_students",
    JSON.stringify(state.adminCreatedStudents)
  );
}

function resetStudentCreateForm() {
  $("#student-create-form")?.reset();
  if ($("#student-create-student-id")) {
    $("#student-create-student-id").value = "";
  }
  if ($("#student-create-role")) {
    $("#student-create-role").value = "student";
  }
  syncCreateStudentIdField();
  setStudentFormStatus("student-create-status", "");
}

function syncCreateStudentIdField() {
  const roleInput = $("#student-create-role");
  const studentIdGroup = $("#student-create-student-id-group");
  const studentIdInput = $("#student-create-student-id");
  if (!roleInput || !studentIdGroup || !studentIdInput) return;

  const isStudentRole =
    String(roleInput.value || "student").toLowerCase() === "student";
  studentIdGroup.classList.toggle("hidden", !isStudentRole);
  studentIdInput.disabled = !isStudentRole;
  if (!isStudentRole) {
    studentIdInput.value = "";
  }
}

function resetStudentEditForm() {
  $("#student-edit-form")?.reset();
  if ($("#student-edit-id")) {
    $("#student-edit-id").value = "";
  }
  if ($("#student-edit-student-id")) {
    $("#student-edit-student-id").value = "";
  }
  setStudentFormStatus("student-edit-status", "");
}

function setupStudentDeleteModal() {
  const confirmBtn = $("#student-delete-confirm-btn");
  if (!confirmBtn) return;

  confirmBtn.addEventListener("click", async () => {
    const studentId = uiState.pendingStudentDeletion?.id;
    if (!studentId) {
      closeModal("modal-student-delete");
      return;
    }

    const original = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML =
      '<div class="loading-spinner"></div> <span>Deleting...</span>';

    try {
      await deleteStudent(studentId);
      closeModal("modal-student-delete");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = original;
      uiState.pendingStudentDeletion = null;
    }
  });
}

function promptDeleteStudent(studentId, studentLabel = "") {
  if (!studentId) {
    showToast("Invalid student reference", "error");
    return;
  }

  uiState.pendingStudentDeletion = {
    id: String(studentId),
    label: String(studentLabel || "")
  };

  const idBadge = $("#student-delete-id");
  if (idBadge) {
    idBadge.textContent =
      uiState.pendingStudentDeletion.label || toPublicStudentId(studentId);
  }

  openModal("modal-student-delete");
}

function setupStudentCreateForm() {
  const addStudentBtn = $("#add-student-btn");
  const form = $("#student-create-form");
  const roleInput = $("#student-create-role");
  if (!addStudentBtn || !form) return;

  if (roleInput) {
    roleInput.addEventListener("change", syncCreateStudentIdField);
  }
  syncCreateStudentIdField();

  addStudentBtn.addEventListener("click", () => {
    if (getCurrentUserRole() !== "admin") {
      showToast("Only admins can create users", "warning");
      return;
    }

    resetStudentCreateForm();
    openModal("modal-student");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const requestedStudentId = normalizeStudentIdInput(
      $("#student-create-student-id")?.value || ""
    );
    const payload = {
      name: $("#student-create-name").value.trim(),
      email: $("#student-create-email").value.trim(),
      phone: $("#student-create-phone").value.trim(),
      password: $("#student-create-password").value,
      role: ($("#student-create-role").value || "student").trim().toLowerCase()
    };

    if (payload.role === "student" && requestedStudentId) {
      if (!isValidStudentIdFormat(requestedStudentId)) {
        setStudentFormStatus(
          "student-create-status",
          "Invalid Student ID format. Use 3-32 chars: letters, numbers, hyphen.",
          "error"
        );
        showToast("Invalid Student ID format", "warning");
        return;
      }
      payload.studentId = requestedStudentId;
    }

    if (
      !payload.name ||
      !payload.email ||
      !payload.phone ||
      !payload.password ||
      !payload.role
    ) {
      setStudentFormStatus(
        "student-create-status",
        "Please fill in all fields.",
        "error"
      );
      showToast("Please fill in all fields", "warning");
      return;
    }

    if (payload.password.length < 6) {
      setStudentFormStatus(
        "student-create-status",
        "Password must be at least 6 characters.",
        "error"
      );
      showToast("Password must be at least 6 characters", "warning");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<div class="loading-spinner"></div> <span>Creating...</span>';
    setStudentFormStatus(
      "student-create-status",
      "Creating student account...",
      "info"
    );

    try {
      const created = await registerStudent(payload);
      const createdStudent = normalizeStudentRecord(created, {
        name: payload.name,
        email: payload.email,
        phone: payload.phone
      });
      upsertAdminStudentCache(createdStudent);

      const createdLabel = createdStudent.studentId
        ? `Student account created. ID: ${createdStudent.studentId}`
        : "Student account created.";
      setStudentFormStatus("student-create-status", createdLabel, "success");
      closeModal("modal-student");
      resetStudentCreateForm();
      showToast(createdLabel, "success");
      if (state.currentPage === "students") {
        loadStudents();
      }
    } catch (err) {
      setStudentFormStatus(
        "student-create-status",
        err.message || "Failed to create student",
        "error"
      );
      showToast(err.message || "Failed to create student", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

function setupStudentEditForm() {
  const form = $("#student-edit-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const studentId = $("#student-edit-id").value.trim();
    const payload = {
      name: $("#student-edit-name").value.trim(),
      email: $("#student-edit-email").value.trim(),
      phone: $("#student-edit-phone").value.trim(),
      password: $("#student-edit-password").value
    };

    if (!studentId) {
      setStudentFormStatus(
        "student-edit-status",
        "Student ID is missing. Please retry.",
        "error"
      );
      return;
    }

    if (!payload.name || !payload.email || !payload.phone) {
      setStudentFormStatus(
        "student-edit-status",
        "Name, email and phone are required.",
        "error"
      );
      showToast("Please fill in all required fields", "warning");
      return;
    }

    if (payload.password && payload.password.length < 6) {
      setStudentFormStatus(
        "student-edit-status",
        "Password must be at least 6 characters.",
        "error"
      );
      showToast("Password must be at least 6 characters", "warning");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<div class="loading-spinner"></div> <span>Saving...</span>';
    setStudentFormStatus("student-edit-status", "Saving changes...", "info");

    try {
      const updatePayload = {
        name: payload.name,
        email: payload.email,
        phone: payload.phone
      };
      if (payload.password) {
        updatePayload.password = payload.password;
      }

      const updated = await fetchAPI(
        `${CONFIG.GATEWAY_URL}/api/students/${studentId}`,
        {
          method: "PUT",
          body: JSON.stringify(updatePayload)
        }
      );

      const updatedStudent = normalizeStudentRecord(updated, {
        id: studentId,
        _id: studentId,
        name: payload.name,
        email: payload.email,
        phone: payload.phone
      });

      upsertAdminStudentCache(updatedStudent);

      if (String(studentId) === String(getCurrentStudentId() || "")) {
        state.user = {
          ...(state.user || {}),
          id: studentId,
          _id: studentId,
          studentId: updatedStudent.studentId || state.user?.studentId,
          name: updatedStudent.name || state.user?.name,
          email: updatedStudent.email || state.user?.email,
          phone: updatedStudent.phone || state.user?.phone
        };
        localStorage.setItem("uniportal_user", JSON.stringify(state.user));
        populateProfileModal();
      }

      setStudentFormStatus(
        "student-edit-status",
        "Student details updated.",
        "success"
      );
      closeModal("modal-student-edit");
      resetStudentEditForm();
      showToast("Student updated", "success");
      await loadStudents();
    } catch (err) {
      setStudentFormStatus(
        "student-edit-status",
        err.message || "Failed to update student",
        "error"
      );
      showToast(err.message || "Failed to update student", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

async function editStudent(studentId) {
  try {
    const current = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/students/${studentId}`
    );
    const normalized = normalizeStudentRecord(current, {
      id: studentId,
      _id: studentId
    });

    resetStudentEditForm();
    const rawId = normalized.id || normalized._id || studentId;
    $("#student-edit-id").value = rawId;
    $("#student-edit-student-id").value =
      normalized.studentId || toPublicStudentId(rawId);
    $("#student-edit-name").value = normalized.name || "";
    $("#student-edit-email").value = normalized.email || "";
    $("#student-edit-phone").value = normalized.phone || "";
    $("#student-edit-password").value = "";

    openModal("modal-student-edit");
  } catch (err) {
    showToast(err.message || "Failed to update student", "error");
  }
}

async function deleteStudent(studentId) {
  try {
    await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students/${studentId}`, {
      method: "DELETE"
    });

    removeAdminStudentFromCache(studentId);

    showToast("Student deleted", "success");

    if (String(studentId) === String(getCurrentStudentId())) {
      stopEnrollmentPolling();
      clearStoredAuth();
      showLogin();
      return;
    }

    await loadStudents();
  } catch (err) {
    showToast(err.message || "Failed to delete student", "error");
  }
}

function setupCourseCreateForm() {
  const btn = $("#add-course-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (getCurrentUserRole() !== "admin") {
      showToast("Only admins can create courses", "warning");
      return;
    }
    openModal("modal-course");
  });

  const form = $("#course-create-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: $("#course-create-name").value.trim(),
      description: $("#course-create-description").value.trim(),
      capacity: Number($("#course-create-capacity").value),
      credits: Number($("#course-create-credits").value)
    };

    if (
      !payload.name ||
      !Number.isFinite(payload.capacity) ||
      !Number.isFinite(payload.credits)
    ) {
      showToast("Name, capacity and credits are required", "warning");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const original = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<div class="loading-spinner"></div> <span>Creating...</span>';

    try {
      await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showToast("Course created", "success");
      form.reset();
      $("#course-create-capacity").value = "30";
      $("#course-create-credits").value = "3";
      closeModal("modal-course");
      if (state.currentPage === "courses") {
        await loadCourses();
      }
    } catch (err) {
      showToast(err.message || "Failed to create course", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });
}

function applyRoleAccessControls() {
  const isAdmin = getCurrentUserRole() === "admin";
  const studentBtn = $("#add-student-btn");
  const courseBtn = $("#add-course-btn");

  if (studentBtn) {
    studentBtn.style.display = isAdmin ? "" : "none";
  }
  if (courseBtn) {
    courseBtn.style.display = isAdmin ? "" : "none";
  }
}
//  COURSES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function loadCourses() {
  const grid = $("#courses-grid");
  grid.innerHTML = '<div class="empty-state">Loading courses...</div>';

  try {
    const courses = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`);

    if (!Array.isArray(courses) || courses.length === 0) {
      grid.innerHTML = '<div class="empty-state">No courses found</div>';
      return;
    }

    grid.innerHTML = courses
      .map((c) => {
        const courseId = c._id || c.courseId || c.id || "-";
        const role = state.user?.role || "";
        const userId = state.user?.id || "";

        const checkStudentBtn =
          role === "admin"
            ? `<button class="btn btn-outline btn-xs" onclick="promptCheckStudent('${courseId}')">Check Student</button>`
            : userId
              ? `<button class="btn btn-outline btn-xs" onclick="checkMyEnrollment('${courseId}', '${userId}')">Check My Enrollment</button>`
              : "";

        return `
                <div class="course-card" id="course-card-${courseId}">
                    <h4>${c.name || c.courseName || c.title || "-"}</h4>
                    <p><strong>ID:</strong> ${courseId}</p>
                    <p>${c.description || ""}</p>
                    <div class="course-enrollment-info" id="enroll-info-${courseId}" style="display:flex;gap:12px;margin:6px 0;font-size:13px;color:var(--color-text-secondary);">
                        <span>Loading stats...</span>
                    </div>
                    <div class="course-card-footer">
                        <span class="course-credits">${c.credits || "-"} Credits</span>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="btn btn-outline btn-xs" onclick="viewCourseStudents('${courseId}', '${(c.name || "").replace(/'/g, "\\'")}')">View Students</button>
                            ${checkStudentBtn}
                            ${
                              role === "admin"
                                ? `
                            <button class="btn btn-outline btn-xs" onclick="openCourseEdit('${courseId}', '${(c.name || "").replace(/'/g, "\\'")}', '${(c.description || "").replace(/'/g, "\\'")}', ${c.credits || 3})">Edit</button>
                            <button class="btn btn-outline btn-xs" onclick="openCapacityModal('${courseId}', '${(c.name || "").replace(/'/g, "\\'")}', ${c.capacity || 30}, 0)">Capacity</button>
                            `
                                : ""
                            }
                        </div>
                    </div>
                </div>
            `;
      })
      .join("");

    // Load enrollment stats one by one with delay to avoid rate limiting
    for (const c of courses) {
      const courseId = c._id || c.courseId || c.id;
      try {
        const detail = await fetchAPI(
          `${CONFIG.GATEWAY_URL}/api/courses/${courseId}`
        );
        const enrolledCount =
          detail.enrolled_count !== undefined ? detail.enrolled_count : "-";
        const availableSeats =
          detail.available_seats !== undefined ? detail.available_seats : "-";
        const isFull =
          typeof detail.available_seats === "number" &&
          detail.available_seats <= 0;

        const infoEl = $(`#enroll-info-${courseId}`);
        if (infoEl) {
          infoEl.innerHTML = `
                        <span>👥 Enrolled: <strong>${enrolledCount}</strong></span>
                        <span style="color:${isFull ? "var(--rose)" : "var(--emerald)"}">
                            🪑 Available: <strong>${availableSeats}</strong>
                        </span>
                    `;
        }
      } catch {
        const infoEl = $(`#enroll-info-${courseId}`);
        if (infoEl)
          infoEl.innerHTML =
            '<span style="color:var(--color-text-secondary);font-size:12px;">Stats unavailable</span>';
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Unable to load courses - ${err.message}</div>`;
  }
}

// Load enrollment stats for a single course on demand
async function loadCourseStats(courseId, btn) {
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const c = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses/${courseId}`);
    const enrolledCount =
      c.enrolled_count !== undefined ? c.enrolled_count : "-";
    const availableSeats =
      c.available_seats !== undefined ? c.available_seats : "-";
    const isFull =
      typeof c.available_seats === "number" && c.available_seats <= 0;

    const infoEl = $(`#enroll-info-${courseId}`);
    if (infoEl) {
      infoEl.innerHTML = `
                <span>👥 Enrolled: <strong>${enrolledCount}</strong></span>
                <span style="color:${isFull ? "var(--rose)" : "var(--emerald)"}">
                    🪑 Available: <strong>${availableSeats}</strong>
                </span>
            `;
    }
    btn.textContent = "Refresh";
    btn.disabled = false;
  } catch (err) {
    btn.textContent = "Retry";
    btn.disabled = false;
    showToast("Could not load stats: " + err.message, "error");
  }
}
async function viewCourseStudents(courseId, courseName) {
  $("#course-students-title").textContent = `Students — ${courseName}`;
  $("#course-students-body").innerHTML =
    '<p style="padding:8px">Loading...</p>';
  openModal("modal-course-students");

  try {
    const enrollments = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/enrollments/course/${courseId}`
    );

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      $("#course-students-body").innerHTML =
        '<p style="padding:8px;color:var(--color-text-secondary)">No students enrolled in this course.</p>';
      return;
    }

    // Enrich with student names
    const enriched = await enrichEnrollmentRows(enrollments);

    $("#course-students-body").innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Student ID</th>
                        <th>Status</th>
                        <th>Enrolled At</th>
                    </tr>
                </thead>
                <tbody>
                    ${enriched
                      .map(
                        (e) => `
                        <tr>
                            <td>${e.student_name || "-"}</td>
                            <td><code>${e.student_id || "-"}</code></td>
                            <td><span class="badge ${e.status === "ACTIVE" ? "badge-success" : e.status === "CANCELLED" ? "badge-danger" : "badge-info"}">${e.status || "-"}</span></td>
                            <td>${e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString() : "-"}</td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        `;
  } catch (err) {
    $("#course-students-body").innerHTML =
      `<p style="padding:8px;color:var(--rose)">Error: ${err.message}</p>`;
  }
}

// ── Edit Course ───────────────────────────────────────────────────
function openCourseEdit(courseId, name, description, credits) {
  $("#course-edit-id").value = courseId;
  $("#course-edit-name").value = name;
  $("#course-edit-description").value = description;
  $("#course-edit-credits").value = credits;
  openModal("modal-course-edit");
}

function setupCourseEditForm() {
  const form = $("#course-edit-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const courseId = $("#course-edit-id").value;
    const payload = {
      name: $("#course-edit-name").value.trim(),
      description: $("#course-edit-description").value.trim(),
      credits: Number($("#course-edit-credits").value)
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses/${courseId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showToast("Course updated successfully", "success");
      closeModal("modal-course-edit");
      await loadCourses();
    } catch (err) {
      showToast(err.message || "Failed to update course", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
    }
  });
}

// ── Update Capacity ───────────────────────────────────────────────
let _capacityCourseId = null;

function openCapacityModal(courseId, courseName, capacity, enrolled) {
  _capacityCourseId = courseId;
  $("#capacity-modal-info").textContent =
    `${courseName} — Current capacity: ${capacity}, Enrolled: ${enrolled}`;
  openModal("modal-course-capacity");
}

function setupCapacityButtons() {
  const incBtn = $("#capacity-increment-btn");
  const decBtn = $("#capacity-decrement-btn");
  if (!incBtn || !decBtn) return;

  incBtn.addEventListener("click", () => updateCourseCapacity("increment"));
  decBtn.addEventListener("click", () => updateCourseCapacity("decrement"));
}

async function updateCourseCapacity(action) {
  if (!_capacityCourseId) return;
  try {
    await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/courses/${_capacityCourseId}/capacity`,
      {
        method: "PUT",
        body: JSON.stringify({ action })
      }
    );
    showToast(
      `Capacity ${action === "increment" ? "increased" : "decreased"} successfully`,
      "success"
    );
    closeModal("modal-course-capacity");
    await loadCourses();
  } catch (err) {
    showToast(err.message || "Failed to update capacity", "error");
  }
}

// Admin: prompt for a student ID then check enrollment
async function promptCheckStudent(courseId) {
  const studentId = prompt("Enter Student ID to check enrollment:");
  if (!studentId) return;
  await checkStudentEnrollmentUI(courseId, studentId.trim());
}

// Student: check their own enrollment in a course
async function checkMyEnrollment(courseId, studentId) {
  await checkStudentEnrollmentUI(courseId, studentId);
}

// Shared: calls GET /api/courses/:courseId/check-student/:studentId
async function checkStudentEnrollmentUI(courseId, studentId) {
  try {
    const result = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/courses/${courseId}/check-student/${studentId}`
    );
    const status = result.enrolled
      ? `✅ Enrolled — Status: ${result.enrollmentStatus || "ACTIVE"}`
      : `❌ Not enrolled in this course`;
    showToast(
      `Student ${studentId}: ${status}`,
      result.enrolled ? "success" : "info"
    );
  } catch (err) {
    showToast(`Could not check enrollment: ${err.message}`, "error");
  }
}

function viewCourseRoster(courseId) {
  navigateTo("enrollments", { skipPageLoad: true });
  showToast(`Loading roster for course ${courseId}...`, "info");
  loadEnrollmentsByCourse(courseId);
}

async function enrichEnrollmentRows(enrollments) {
  if (!Array.isArray(enrollments) || enrollments.length === 0) return [];

  const courseNameById = {};
  try {
    const courses = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`);
    if (Array.isArray(courses)) {
      for (const c of courses) {
        const id = c?._id || c?.courseId || c?.id;
        const name = c?.name || c?.courseName || c?.title;
        if (id && name) courseNameById[String(id)] = name;
      }
    }
  } catch {
    // Keep IDs if lookup fails
  }

  const studentIds = [
    ...new Set(
      enrollments.map((e) => String(e?.student_id || "")).filter(Boolean)
    )
  ];
  const studentNameById = {};
  await Promise.all(
    studentIds.map(async (id) => {
      try {
        const student = await fetchAPI(
          `${CONFIG.GATEWAY_URL}/api/students/${id}`
        );
        if (student?.name) studentNameById[id] = student.name;
      } catch {
        // Keep IDs if lookup fails
      }
    })
  );

  return enrollments.map((e) => ({
    ...e,
    student_name: studentNameById[String(e.student_id)] || e.student_id,
    course_name: courseNameById[String(e.course_id)] || e.course_id
  }));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  ENROLLMENTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setupFilters() {
  $("#filter-enrollments-btn").addEventListener("click", async () => {
    if (getCurrentUserRole() !== "admin") {
      const ownId = getCurrentStudentId();
      if (ownId) {
        loadEnrollmentsByStudent(ownId);
      }
      return;
    }
    const studentId = $("#filter-student-id").value.trim();
    if (!studentId) {
      loadAllEnrollments();
      return;
    }
    const resolvedStudentId = await resolveStudentReference(studentId);
    loadEnrollmentsByStudent(resolvedStudentId);
  });

  // Enter key support
  $("#filter-student-id").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("#filter-enrollments-btn").click();
    }
  });

  $("#filter-grades-btn").addEventListener("click", () => {
    const studentId = $("#grade-student-id").value.trim();
    if (!studentId) {
      showToast("Please enter a Student ID", "warning");
      return;
    }
    loadGrades(studentId);
  });

  $("#grade-student-id").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      $("#filter-grades-btn").click();
    }
  });
}

function applyEnrollmentAccessControls() {
  const isAdmin = getCurrentUserRole() === "admin";
  const ownId = getCurrentStudentId();
  const ownStudentId = state.user?.studentId || "";
  const filterInput = $("#filter-student-id");
  const filterBtn = $("#filter-enrollments-btn");

  if (!filterInput || !filterBtn) return;

  if (!isAdmin) {
    filterInput.value = ownStudentId || (ownId ? toPublicStudentId(ownId) : "");
    filterInput.dataset.internalId = ownId || "";
    filterInput.disabled = true;
    filterInput.placeholder = "Your student ID";
    filterBtn.textContent = "My Enrollments";
  } else {
    delete filterInput.dataset.internalId;
    filterInput.disabled = false;
    filterInput.placeholder = "Enter public or internal student ID";
    filterBtn.textContent = "Search";
  }
}

async function loadEnrollmentsByStudent(studentId, options = {}) {
  const { silent = false } = options;
  const ownId = getCurrentStudentId();
  if (getCurrentUserRole() !== "admin" && ownId && studentId !== ownId) {
    studentId = ownId;
  }

  const filterInput = $("#filter-student-id");
  if (filterInput && getCurrentUserRole() !== "admin") {
    filterInput.value = state.user?.studentId || toPublicStudentId(studentId);
    filterInput.dataset.internalId = studentId || "";
  }

  state.enrollmentView = { type: "student", value: studentId };
  const tbody = $("#enrollments-tbody");
  if (!silent) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Loading enrollments...</td></tr>';
  }

  try {
    const enrollments = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/enrollments/student/${studentId}`
    );

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No enrollments found for this student</td></tr>';
      return;
    }

    const enriched = await enrichEnrollmentRows(enrollments);
    renderEnrollmentsTable(enriched);
    updateRecentEnrollments(enriched);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || "Error loading enrollments"}</td></tr>`;
  }
}

async function loadEnrollmentsByCourse(courseId, options = {}) {
  const { silent = false } = options;
  state.enrollmentView = { type: "course", value: courseId };
  const tbody = $("#enrollments-tbody");
  if (!silent) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Loading roster...</td></tr>';
  }

  try {
    const enrollments = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/enrollments/course/${courseId}`
    );

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No enrollments found for this course</td></tr>';
      return;
    }

    const enriched = await enrichEnrollmentRows(enrollments);
    renderEnrollmentsTable(enriched);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || "Error loading roster"}</td></tr>`;
  }
}

async function loadAllEnrollments(options = {}) {
  const { silent = false } = options;
  const ownId = getCurrentStudentId();
  if (getCurrentUserRole() !== "admin" && ownId) {
    return loadEnrollmentsByStudent(ownId, options);
  }

  state.enrollmentView = { type: "all", value: null };
  const tbody = $("#enrollments-tbody");
  if (!silent) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Loading all recent enrollments...</td></tr>';
  }

  try {
    const enrollments = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments`);

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No enrollments found in the system</td></tr>';
      return;
    }

    const enriched = await enrichEnrollmentRows(enrollments);
    renderEnrollmentsTable(enriched);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || "Error loading enrollments"}</td></tr>`;
  }
}

function renderEnrollmentsTable(enrollments) {
  const tbody = $("#enrollments-tbody");
  tbody.innerHTML = enrollments
    .map((e) => {
      const statusClass =
        {
          ACTIVE: "badge-success",
          CANCELLED: "badge-danger",
          WITHDRAWN: "badge-warning",
          COMPLETED: "badge-info"
        }[e.status] || "badge-neutral";

      const date = e.enrolled_at
        ? new Date(e.enrolled_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric"
          })
        : "-";

      return `
            <tr>
                <td><code>${e._id || "-"}</code></td>
                <td>${e.student_name || e.student_id || "-"}</td>
                <td>${e.course_name || e.course_id || "-"}</td>
                <td><span class="badge ${statusClass}">${e.status || "-"}</span></td>
                <td>${date}</td>
                <td class="actions-cell">
                    <button class="btn btn-outline btn-xs" onclick="openStatusModal('${e._id}', '${e.status}')">
                        Status
                    </button>
                    ${
                      e.status === "ACTIVE"
                        ? `
                        <button class="btn btn-danger btn-xs" onclick="cancelEnrollment('${e._id}')">
                            Cancel
                        </button>
                    `
                        : ""
                    }
                </td>
            </tr>
        `;
    })
    .join("");
}

async function refreshEnrollmentView() {
  if (state.enrollmentRefreshInProgress) return;
  state.enrollmentRefreshInProgress = true;

  const view = state.enrollmentView || { type: "all", value: null };
  try {
    if (view.type === "student" && view.value) {
      await loadEnrollmentsByStudent(view.value, { silent: true });
      return;
    }
    if (view.type === "course" && view.value) {
      await loadEnrollmentsByCourse(view.value, { silent: true });
      return;
    }
    await loadAllEnrollments({ silent: true });
  } finally {
    state.enrollmentRefreshInProgress = false;
  }
}

function updateRecentEnrollments(enrollments) {
  const list = $("#recent-enrollments-list");
  const recent = enrollments.slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = '<div class="empty-state-sm">No recent enrollments</div>';
    return;
  }

  list.innerHTML = recent
    .map((e) => {
      const statusClass =
        {
          ACTIVE: "badge-success",
          CANCELLED: "badge-danger",
          WITHDRAWN: "badge-warning",
          COMPLETED: "badge-info"
        }[e.status] || "badge-neutral";

      const date = e.enrolled_at
        ? new Date(e.enrolled_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
          })
        : "";

      return `
            <div class="list-item">
                <div class="list-item-info">
                    <span class="list-item-title">${e.student_name || e.student_id} -> ${e.course_name || e.course_id}</span>
                    <span class="list-item-sub">${date}</span>
                </div>
                <span class="badge ${statusClass}">${e.status}</span>
            </div>
        `;
    })
    .join("");
}

// â”€â”€ Create Enrollment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupEnrollmentForm() {
  $("#new-enrollment-btn").addEventListener("click", () => {
    const isAdmin = getCurrentUserRole() === "admin";
    const ownId = getCurrentStudentId();
    const studentInput = $("#enroll-student-id");
    if (!isAdmin && ownId) {
      studentInput.value = ownId;
      studentInput.readOnly = true;
    } else {
      studentInput.readOnly = false;
      studentInput.value = "";
    }
    openModal("modal-enrollment");
  });

  $("#enrollment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    let student_id = $("#enroll-student-id").value.trim();
    const course_id = $("#enroll-course-id").value.trim();
    const ownId = getCurrentStudentId();
    if (getCurrentUserRole() !== "admin" && ownId) {
      student_id = ownId;
    } else {
      student_id = await resolveStudentReference(student_id);
    }

    if (!student_id || !course_id) {
      showToast("Please fill in both fields", "warning");
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<div class="loading-spinner"></div> <span>Enrolling...</span>';

    showToast("Processing enrollment...", "info");

    try {
      await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enroll`, {
        method: "POST",
        body: JSON.stringify({ student_id, course_id })
      });
      showToast("Enrollment created successfully!", "success");
      closeModal("modal-enrollment");
      $("#enrollment-form").reset();

      // Switch to enrollments page and load data
      navigateTo("enrollments", { skipPageLoad: true });
      $("#filter-student-id").value = student_id;
      await loadEnrollmentsByStudent(student_id);
    } catch (err) {
      showToast(err.message || "Failed to create enrollment", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}

function setupProfile() {
  const avatar = $("#user-avatar");
  if (avatar) {
    avatar.addEventListener("click", () => {
      populateProfileModal();
      openModal("modal-profile");
    });
  }
}

function populateProfileModal() {
  const user = state.user || {};
  const role = getCurrentUserRole();
  const rawStudentId = getCurrentStudentId();
  $("#profile-name").textContent = user.name || "-";
  $("#profile-email").textContent = user.email || "-";
  $("#profile-phone").textContent = user.phone || "-";
  $("#profile-id").textContent =
    user.studentId || (rawStudentId ? toPublicStudentId(rawStudentId) : "-");
  $("#profile-role").textContent = role;
}

// â”€â”€ Cancel Enrollment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function cancelEnrollment(enrollmentId) {
  if (!confirm("Are you sure you want to cancel this enrollment?")) return;

  try {
    await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enroll/${enrollmentId}`, {
      method: "DELETE"
    });
    showToast("Enrollment cancelled", "success");
    await refreshEnrollmentView();
  } catch (err) {
    showToast(err.message || "Failed to cancel enrollment", "error");
  }
}

// â”€â”€ Update Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupStatusForm() {
  $("#status-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#status-enrollment-id").value;
    const status = $("#status-select").value;

    if (!status) {
      showToast("Please select a status", "warning");
      return;
    }

    try {
      await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      showToast(`Status updated to ${status}`, "success");
      closeModal("modal-status");
      await refreshEnrollmentView();
    } catch (err) {
      showToast(err.message || "Failed to update status", "error");
    }
  });
}

function openStatusModal(enrollmentId, currentStatus) {
  $("#status-enrollment-id").value = enrollmentId;
  $("#status-select").value = currentStatus || "";
  openModal("modal-status");
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  GRADES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function loadGrades(studentId) {
  const tbody = $("#grades-tbody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="empty-state">Loading grades...</td></tr>';
  $("#gpa-summary").classList.add("hidden");

  try {
    const grades = await fetchAPI(
      `${CONFIG.GATEWAY_URL}/api/grades/student/${studentId}`
    );

    if (!Array.isArray(grades) || grades.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No grades found for this student</td></tr>';
      return;
    }

    tbody.innerHTML = grades
      .map(
        (g) => `
            <tr>
                <td><code>${g.course_id || g.courseId || "-"}</code></td>
                <td>${g.courseName || g.course_name || "-"}</td>
                <td><strong>${g.grade || "-"}</strong></td>
                <td>${g.score || g.marks || "-"}</td>
                <td>${g.credits || "-"}</td>
                <td>${g.semester || "-"}</td>
            </tr>
        `
      )
      .join("");

    // Try loading GPA
    try {
      const gpaData = await fetchAPI(
        `${CONFIG.GATEWAY_URL}/api/gpa/${studentId}`
      );
      if (gpaData?.gpa !== undefined) {
        $("#gpa-value").textContent = parseFloat(gpaData.gpa).toFixed(2);
        $("#gpa-summary").classList.remove("hidden");
      }
    } catch {
      // GPA endpoint might not exist
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || "Error loading grades"}</td></tr>`;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MODALS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setupModals() {
  // Close buttons
  $$(".modal-close, [data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.dataset.close || btn.closest(".modal-overlay")?.id;
      if (modalId) closeModal(modalId);
    });
  });

  // Click outside to close
  $$(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".modal-overlay.show").forEach((m) => closeModal(m.id));
    }
  });
}

function openModal(id) {
  const modal = $(`#${id}`);
  if (modal) modal.classList.add("show");
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (modal) modal.classList.remove("show");
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TOAST NOTIFICATIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function showToast(message, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = {
    success: "OK",
    error: "X",
    warning: "!",
    info: "i"
  };

  toast.innerHTML = `<span style="font-weight:700">${icons[type] || "i"}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  API HELPER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function fetchAPI(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      mode: "cors",
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(
      "Network error. Check API Gateway/CORS/service availability."
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.details ||
      `HTTP ${response.status}: ${response.statusText}`;
    const shouldForceLogout =
      (response.status === 401 || response.status === 403) &&
      /invalid token|token expired|jwt expired|authorization required|token required|missing token|not authenticated/i.test(
        message
      );

    if (shouldForceLogout) {
      clearStoredAuth();
      showLogin();
    }
    throw new Error(message);
  }

  return data;
}

// â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

// Make functions globally available for inline handlers
window.navigateTo = navigateTo;
window.viewStudentEnrollments = viewStudentEnrollments;
window.viewCourseRoster = viewCourseRoster;
window.editStudent = editStudent;
window.promptDeleteStudent = promptDeleteStudent;
window.deleteStudent = deleteStudent;
window.cancelEnrollment = cancelEnrollment;
window.openStatusModal = openStatusModal;
