/* ═══════════════════════════════════════════
   UNIPORTAL — Application Logic
   Student Management System Frontend
   ═══════════════════════════════════════════ */

// ── API Configuration ─────────────────────
const CONFIG = {
    // Point to the API Gateway
    GATEWAY_URL: 'https://api-gateway-763150334229.us-central1.run.app',
    // Or for local dev:
    // GATEWAY_URL: 'http://localhost:8080',

    // Individual service URLs (fallback / direct access)
    STUDENT_SERVICE: 'https://student-service-283974567418.us-central1.run.app',
    COURSE_SERVICE: 'https://course-service-506720768686.us-central1.run.app',
    ENROLLMENT_SERVICE: 'https://enrollment-service-763150334229.us-central1.run.app',
    GRADE_SERVICE: 'https://grade-service-placeholder.us-central1.run.app',
};

// ── State ─────────────────────────────────
let state = {
    token: localStorage.getItem('uniportal_token') || null,
    user: JSON.parse(localStorage.getItem('uniportal_user') || 'null'),
    currentPage: 'dashboard',
    enrollmentView: { type: 'all', value: null },
    enrollmentPoller: null,
    enrollmentRefreshInProgress: false,
};

function looksLikeJWT(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts.every(Boolean);
}

function clearStoredAuth() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('uniportal_token');
    localStorage.removeItem('uniportal_user');
}

function decodeJWTPayload(token) {
    if (!looksLikeJWT(token)) return null;
    try {
        const payload = token.split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

function hydrateUserFromToken() {
    const claims = decodeJWTPayload(state.token);
    if (!claims) return;

    state.user = {
        ...(state.user || {}),
        id: state.user?.id || state.user?._id || claims.id || claims.sub || null,
        email: state.user?.email || claims.email || null,
        name: state.user?.name || claims.name || claims.email?.split('@')?.[0] || 'User',
        role: state.user?.role || claims.role || 'student',
    };

    localStorage.setItem('uniportal_user', JSON.stringify(state.user));
}

function getCurrentStudentId() {
    return state.user?.id || state.user?._id || decodeJWTPayload(state.token)?.id || decodeJWTPayload(state.token)?.sub || null;
}

function getCurrentUserRole() {
    return state.user?.role || decodeJWTPayload(state.token)?.role || 'student';
}

// ── DOM References ────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ═══════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Ignore stale/demo tokens that are not real JWTs.
    if (state.token && !looksLikeJWT(state.token)) {
        clearStoredAuth();
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
    setupEnrollmentForm();
    setupStatusForm();
    setupFilters();
    setupProfile();
    setupLogout();
    setupMobileMenu();
}

// ═══════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════
function setupAuthForms() {
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');

    $('#auth-tab-login').addEventListener('click', () => switchAuthMode('login'));
    $('#auth-tab-register').addEventListener('click', () => switchAuthMode('register'));

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthStatus('');
        const email = $('#login-email').value.trim();
        const password = $('#login-password').value;

        if (!email || !password) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        const btn = $('#login-btn');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Signing in...</span>';
        setAuthStatus('Signing in...', 'info');

        try {
            await loginWithCredentials(email, password);
            setAuthStatus('Login successful', 'success');
            showToast('Welcome back!', 'success');
            showApp();
        } catch (err) {
            setAuthStatus(err.message || 'Login failed', 'error');
            showToast(err.message || 'Login failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthStatus('');
        const payload = {
            name: $('#register-name').value.trim(),
            email: $('#register-email').value.trim(),
            phone: $('#register-phone').value.trim(),
            password: $('#register-password').value,
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.password) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        const btn = $('#register-btn');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Creating account...</span>';
        setAuthStatus('Creating account...', 'info');

        try {
            await registerStudent(payload);
            setAuthStatus('Account created. Signing you in...', 'success');
            await loginWithCredentials(payload.email, payload.password);
            showToast('Registration successful', 'success');
            showApp();
        } catch (err) {
            setAuthStatus(err.message || 'Registration failed', 'error');
            showToast(err.message || 'Registration failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
}

function switchAuthMode(mode) {
    const isLogin = mode === 'login';
    $('#auth-tab-login').classList.toggle('active', isLogin);
    $('#auth-tab-register').classList.toggle('active', !isLogin);
    $('#login-form').classList.toggle('hidden', !isLogin);
    $('#register-form').classList.toggle('hidden', isLogin);
    setAuthStatus('');
}

function setAuthStatus(message, type = '') {
    const el = $('#auth-status');
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.className = 'auth-status hidden';
        return;
    }
    el.textContent = message;
    el.className = `auth-status ${type}`.trim();
}

async function loginWithCredentials(email, password) {
    let response;
    try {
        response = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    } catch (err) {
        if (!isConnectivityError(err)) throw err;
        setAuthStatus('Gateway auth timeout. Retrying via Student Service...', 'info');
        response = await fetchAPI(`${CONFIG.STUDENT_SERVICE}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    }

    if (!response?.token) {
        throw new Error('Invalid login response from auth service');
    }

    state.token = response.token;
    const claims = decodeJWTPayload(response.token) || {};
    const baseUser = response.user || { email, name: email.split('@')[0] };
    state.user = {
        ...baseUser,
        id: baseUser.id || baseUser._id || claims.id || claims.sub || null,
        role: baseUser.role || claims.role || 'student',
    };
    localStorage.setItem('uniportal_token', state.token);
    localStorage.setItem('uniportal_user', JSON.stringify(state.user));
}

async function registerStudent(payload) {
    try {
        await fetchAPI(`${CONFIG.GATEWAY_URL}/api/auth/register`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    } catch (err) {
        if (!isConnectivityError(err)) throw err;
        setAuthStatus('Gateway register timeout. Retrying via Student Service...', 'info');
        await fetchAPI(`${CONFIG.STUDENT_SERVICE}/auth/register`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }
}

function isConnectivityError(err) {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('timed out') || msg.includes('network error') || msg.includes('failed to fetch');
}

function setupLogout() {
    $('#logout-btn').addEventListener('click', () => {
        stopEnrollmentPolling();
        clearStoredAuth();
        showLogin();
        showToast('Logged out successfully', 'info');
    });
}

function showLogin() {
    stopEnrollmentPolling();
    $('#login-page').classList.add('active');
    $('#app-shell').classList.add('hidden');
    switchAuthMode('login');
}

function showApp() {
    $('#login-page').classList.remove('active');
    $('#app-shell').classList.remove('hidden');

    // Set user avatar
    if (state.user?.name) {
        $('#user-avatar span').textContent = state.user.name.charAt(0).toUpperCase();
    }
    $('#user-role-badge').textContent = getCurrentUserRole();
    applyEnrollmentAccessControls();
    populateProfileModal();

    // Load dashboard data
    loadDashboard();
}

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
function setupNavigation() {
    $$('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page, options = {}) {
    // Update active nav
    $$('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
    const activeNav = $(`.nav-item[data-page="${page}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update page sections
    $$('.page-section').forEach(s => s.classList.remove('active'));
    const section = $(`#page-${page}`);
    if (section) section.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        students: 'Students',
        courses: 'Courses',
        enrollments: 'Enrollments',
        grades: 'Grades',
    };
    $('#page-title').textContent = titles[page] || page;
    state.currentPage = page;
    if (page === 'enrollments') {
        startEnrollmentPolling();
    } else {
        stopEnrollmentPolling();
    }

    // Close mobile sidebar
    $('#sidebar').classList.remove('open');
    const overlay = $('.sidebar-overlay');
    if (overlay) overlay.classList.remove('show');

    // Load page data
    if (!options.skipPageLoad) {
        switch (page) {
            case 'dashboard': loadDashboard(); break;
            case 'students': loadStudents(); break;
            case 'courses': loadCourses(); break;
            case 'enrollments': loadAllEnrollments(); break;
            case 'grades': break; // loaded on filter
        }
    }
}

function startEnrollmentPolling() {
    stopEnrollmentPolling();
    state.enrollmentPoller = setInterval(() => {
        if (state.currentPage === 'enrollments') {
            refreshEnrollmentView();
        }
    }, 8000);
}

function stopEnrollmentPolling() {
    if (!state.enrollmentPoller) return;
    clearInterval(state.enrollmentPoller);
    state.enrollmentPoller = null;
}

// ═══════════════════════════════════════════
//  MOBILE MENU
// ═══════════════════════════════════════════
function setupMobileMenu() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    $('#menu-toggle').addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
        overlay.classList.toggle('show');
    });

    overlay.addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
        overlay.classList.remove('show');
    });
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
async function loadDashboard() {
    checkSystemHealth();
    loadDashboardStats();
}

async function loadDashboardStats() {
    // Students count
    try {
        const studentId = getCurrentStudentId();
        if (!studentId) throw new Error('Missing student id');
        await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students/${studentId}`);
        $('#stat-students').textContent = '1';
    } catch {
        $('#stat-students').textContent = '—';
    }

    // Courses count
    try {
        const courses = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`);
        const count = Array.isArray(courses) ? courses.length : (courses?.count || '—');
        $('#stat-courses').textContent = count;
    } catch {
        $('#stat-courses').textContent = '—';
    }

    // We can't easily get total enrollments without a dedicated endpoint
    $('#stat-enrollments').textContent = '—';
    $('#stat-gpa').textContent = '—';
}

async function checkSystemHealth() {
    const services = [
        { id: 'gateway', url: CONFIG.GATEWAY_URL, name: 'API Gateway' },
        { id: 'student', url: CONFIG.STUDENT_SERVICE, name: 'Student Service' },
        { id: 'course', url: CONFIG.COURSE_SERVICE, name: 'Course Service' },
        { id: 'enrollment', url: CONFIG.ENROLLMENT_SERVICE, name: 'Enrollment Service' },
        { id: 'grade', url: CONFIG.GRADE_SERVICE, name: 'Grade Service' },
    ];

    let allOnline = true;

    for (const svc of services) {
        const dotEl = $(`#health-${svc.id}`)?.closest('.health-item')?.querySelector('.health-dot');
        const statusEl = $(`#health-${svc.id}`);

        try {
            if (svc.url.includes('placeholder')) {
                throw new Error('Service URL placeholder');
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            await fetch(svc.url, {
                mode: 'cors',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (dotEl) dotEl.classList.add('online');
            if (dotEl) dotEl.classList.remove('offline');
            if (statusEl) statusEl.textContent = 'Online';
            if (statusEl) statusEl.style.color = 'var(--emerald)';
        } catch {
            allOnline = false;
            if (dotEl) dotEl.classList.add('offline');
            if (dotEl) dotEl.classList.remove('online');
            if (statusEl) statusEl.textContent = 'Offline';
            if (statusEl) statusEl.style.color = 'var(--rose)';
        }
    }

    const badge = $('#gateway-badge');
    if (allOnline) {
        badge.textContent = 'All Online';
        badge.className = 'badge badge-success';
    } else {
        badge.textContent = 'Partial';
        badge.className = 'badge badge-warning';
    }
}

// ═══════════════════════════════════════════
//  STUDENTS
// ═══════════════════════════════════════════
async function loadStudents() {
    const tbody = $('#students-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading students…</td></tr>';

    try {
        const studentId = getCurrentStudentId();
        if (!studentId) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No student id in session</td></tr>';
            return;
        }
        const student = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students/${studentId}`);
        const students = student ? [student] : [];

        if (!Array.isArray(students) || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No students found</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => `
            <tr>
                <td><code>${s._id || s.studentId || s.id || '—'}</code></td>
                <td>${s.name || s.firstName + ' ' + (s.lastName || '') || '—'}</td>
                <td>${s.email || '—'}</td>
                <td>${s.programme || s.department || '—'}</td>
                <td><span class="badge badge-success">${s.status || 'Active'}</span></td>
                <td class="actions-cell">
                    <button class="btn btn-outline btn-xs" onclick="viewStudentEnrollments('${s._id || s.studentId || s.id}')">Enrollments</button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Unable to load students — ${err.message}</td></tr>`;
    }
}

function viewStudentEnrollments(studentId) {
    navigateTo('enrollments', { skipPageLoad: true });
    $('#filter-student-id').value = studentId;
    loadEnrollmentsByStudent(studentId);
}

function setupStudentCreateForm() {
    $('#add-student-btn').addEventListener('click', () => {
        openModal('modal-student');
    });

    $('#student-create-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: $('#student-create-name').value.trim(),
            email: $('#student-create-email').value.trim(),
            phone: $('#student-create-phone').value.trim(),
            password: $('#student-create-password').value,
        };

        if (!payload.name || !payload.email || !payload.phone || !payload.password) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> <span>Creating...</span>';

        try {
            await registerStudent(payload);
            closeModal('modal-student');
            $('#student-create-form').reset();
            showToast('Student account created', 'success');
            if (state.currentPage === 'students') {
                loadStudents();
            }
        } catch (err) {
            showToast(err.message || 'Failed to create student', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
}

// ═══════════════════════════════════════════
//  COURSES
// ═══════════════════════════════════════════
async function loadCourses() {
    const grid = $('#courses-grid');
    grid.innerHTML = '<div class="empty-state">Loading courses…</div>';

    try {
        const courses = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/courses`);

        if (!Array.isArray(courses) || courses.length === 0) {
            grid.innerHTML = '<div class="empty-state">No courses found</div>';
            return;
        }

        grid.innerHTML = courses.map(c => {
            const colors = ['var(--indigo)', 'var(--emerald)', 'var(--amber)', 'var(--rose)', 'var(--cyan)', 'var(--violet)'];
            const color = colors[Math.abs(hashCode(c._id || c.courseId || '')) % colors.length];
            return `
                <div class="course-card">
                    <h4>${c.name || c.courseName || c.title || '—'}</h4>
                    <p><strong>ID:</strong> ${c._id || c.courseId || c.id || '—'}</p>
                    <p>${c.description || ''}</p>
                    <div class="course-card-footer">
                        <span class="course-credits">${c.credits || '—'} Credits</span>
                        <button class="btn btn-outline btn-xs" onclick="viewCourseRoster('${c._id || c.courseId || c.id}')">View Roster</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        grid.innerHTML = `<div class="empty-state">Unable to load courses — ${err.message}</div>`;
    }
}

function viewCourseRoster(courseId) {
    navigateTo('enrollments', { skipPageLoad: true });
    showToast(`Loading roster for course ${courseId}…`, 'info');
    loadEnrollmentsByCourse(courseId);
}

// ═══════════════════════════════════════════
//  ENROLLMENTS
// ═══════════════════════════════════════════
function setupFilters() {
    $('#filter-enrollments-btn').addEventListener('click', () => {
        if (getCurrentUserRole() !== 'admin') {
            const ownId = getCurrentStudentId();
            if (ownId) {
                loadEnrollmentsByStudent(ownId);
            }
            return;
        }
        const studentId = $('#filter-student-id').value.trim();
        if (!studentId) {
            loadAllEnrollments();
            return;
        }
        loadEnrollmentsByStudent(studentId);
    });

    // Enter key support
    $('#filter-student-id').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            $('#filter-enrollments-btn').click();
        }
    });

    $('#filter-grades-btn').addEventListener('click', () => {
        const studentId = $('#grade-student-id').value.trim();
        if (!studentId) {
            showToast('Please enter a Student ID', 'warning');
            return;
        }
        loadGrades(studentId);
    });

    $('#grade-student-id').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            $('#filter-grades-btn').click();
        }
    });
}

function applyEnrollmentAccessControls() {
    const isAdmin = getCurrentUserRole() === 'admin';
    const ownId = getCurrentStudentId();
    const filterInput = $('#filter-student-id');
    const filterBtn = $('#filter-enrollments-btn');

    if (!filterInput || !filterBtn) return;

    if (!isAdmin) {
        filterInput.value = ownId || '';
        filterInput.disabled = true;
        filterInput.placeholder = 'Your student ID';
        filterBtn.textContent = 'My Enrollments';
    } else {
        filterInput.disabled = false;
        filterInput.placeholder = 'e.g. S1001';
        filterBtn.textContent = 'Search';
    }
}

async function loadEnrollmentsByStudent(studentId, options = {}) {
    const { silent = false } = options;
    const ownId = getCurrentStudentId();
    if (getCurrentUserRole() !== 'admin' && ownId && studentId !== ownId) {
        studentId = ownId;
        $('#filter-student-id').value = ownId;
    }

    state.enrollmentView = { type: 'student', value: studentId };
    const tbody = $('#enrollments-tbody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading enrollments…</td></tr>';
    }

    try {
        const enrollments = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments/student/${studentId}`);

        if (!Array.isArray(enrollments) || enrollments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No enrollments found for this student</td></tr>';
            return;
        }

        renderEnrollmentsTable(enrollments);
        updateRecentEnrollments(enrollments);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || 'Error loading enrollments'}</td></tr>`;
    }
}

async function loadEnrollmentsByCourse(courseId, options = {}) {
    const { silent = false } = options;
    state.enrollmentView = { type: 'course', value: courseId };
    const tbody = $('#enrollments-tbody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading roster…</td></tr>';
    }

    try {
        const enrollments = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments/course/${courseId}`);

        if (!Array.isArray(enrollments) || enrollments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No enrollments found for this course</td></tr>';
            return;
        }

        renderEnrollmentsTable(enrollments);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || 'Error loading roster'}</td></tr>`;
    }
}

async function loadAllEnrollments(options = {}) {
    const { silent = false } = options;
    const ownId = getCurrentStudentId();
    if (getCurrentUserRole() !== 'admin' && ownId) {
        return loadEnrollmentsByStudent(ownId, options);
    }

    state.enrollmentView = { type: 'all', value: null };
    const tbody = $('#enrollments-tbody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading all recent enrollments…</td></tr>';
    }

    try {
        const enrollments = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments`);

        if (!Array.isArray(enrollments) || enrollments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No enrollments found in the system</td></tr>';
            return;
        }

        renderEnrollmentsTable(enrollments);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || 'Error loading enrollments'}</td></tr>`;
    }
}

function renderEnrollmentsTable(enrollments) {
    const tbody = $('#enrollments-tbody');
    tbody.innerHTML = enrollments.map(e => {
        const statusClass = {
            ACTIVE: 'badge-success',
            CANCELLED: 'badge-danger',
            WITHDRAWN: 'badge-warning',
            COMPLETED: 'badge-info',
        }[e.status] || 'badge-neutral';

        const date = e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        }) : '—';

        return `
            <tr>
                <td><code>${e._id || '—'}</code></td>
                <td>${e.student_id || '—'}</td>
                <td>${e.course_id || '—'}</td>
                <td><span class="badge ${statusClass}">${e.status || '—'}</span></td>
                <td>${date}</td>
                <td class="actions-cell">
                    <button class="btn btn-outline btn-xs" onclick="openStatusModal('${e._id}', '${e.status}')">
                        Status
                    </button>
                    ${e.status === 'ACTIVE' ? `
                        <button class="btn btn-danger btn-xs" onclick="cancelEnrollment('${e._id}')">
                            Cancel
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function refreshEnrollmentView() {
    if (state.enrollmentRefreshInProgress) return;
    state.enrollmentRefreshInProgress = true;

    const view = state.enrollmentView || { type: 'all', value: null };
    try {
        if (view.type === 'student' && view.value) {
            await loadEnrollmentsByStudent(view.value, { silent: true });
            return;
        }
        if (view.type === 'course' && view.value) {
            await loadEnrollmentsByCourse(view.value, { silent: true });
            return;
        }
        await loadAllEnrollments({ silent: true });
    } finally {
        state.enrollmentRefreshInProgress = false;
    }
}

function updateRecentEnrollments(enrollments) {
    const list = $('#recent-enrollments-list');
    const recent = enrollments.slice(0, 5);

    if (recent.length === 0) {
        list.innerHTML = '<div class="empty-state-sm">No recent enrollments</div>';
        return;
    }

    list.innerHTML = recent.map(e => {
        const statusClass = {
            ACTIVE: 'badge-success',
            CANCELLED: 'badge-danger',
            WITHDRAWN: 'badge-warning',
            COMPLETED: 'badge-info',
        }[e.status] || 'badge-neutral';

        const date = e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        }) : '';

        return `
            <div class="list-item">
                <div class="list-item-info">
                    <span class="list-item-title">${e.student_id} → ${e.course_id}</span>
                    <span class="list-item-sub">${date}</span>
                </div>
                <span class="badge ${statusClass}">${e.status}</span>
            </div>
        `;
    }).join('');
}

// ── Create Enrollment ──────────────────────
function setupEnrollmentForm() {
    $('#new-enrollment-btn').addEventListener('click', () => {
        const isAdmin = getCurrentUserRole() === 'admin';
        const ownId = getCurrentStudentId();
        const studentInput = $('#enroll-student-id');
        if (!isAdmin && ownId) {
            studentInput.value = ownId;
            studentInput.readOnly = true;
        } else {
            studentInput.readOnly = false;
            studentInput.value = '';
        }
        openModal('modal-enrollment');
    });

    $('#enrollment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        let student_id = $('#enroll-student-id').value.trim();
        const course_id = $('#enroll-course-id').value.trim();
        const ownId = getCurrentStudentId();
        if (getCurrentUserRole() !== 'admin' && ownId) {
            student_id = ownId;
        }

        if (!student_id || !course_id) {
            showToast('Please fill in both fields', 'warning');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> <span>Enrolling…</span>';

        showToast('Processing enrollment...', 'info');

        try {
            await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enroll`, {
                method: 'POST',
                body: JSON.stringify({ student_id, course_id }),
            });
            showToast('Enrollment created successfully!', 'success');
            closeModal('modal-enrollment');
            $('#enrollment-form').reset();

            // Switch to enrollments page and load data
            navigateTo('enrollments', { skipPageLoad: true });
            $('#filter-student-id').value = student_id;
            await loadEnrollmentsByStudent(student_id);

        } catch (err) {
            showToast(err.message || 'Failed to create enrollment', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

function setupProfile() {
    const avatar = $('#user-avatar');
    if (avatar) {
        avatar.addEventListener('click', () => {
            populateProfileModal();
            openModal('modal-profile');
        });
    }
}

function populateProfileModal() {
    const user = state.user || {};
    const role = getCurrentUserRole();
    $('#profile-name').textContent = user.name || '—';
    $('#profile-email').textContent = user.email || '—';
    $('#profile-phone').textContent = user.phone || '—';
    $('#profile-id').textContent = getCurrentStudentId() || '—';
    $('#profile-role').textContent = role;
}

// ── Cancel Enrollment ──────────────────────
async function cancelEnrollment(enrollmentId) {
    if (!confirm('Are you sure you want to cancel this enrollment?')) return;

    try {
        await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enroll/${enrollmentId}`, {
            method: 'DELETE',
        });
        showToast('Enrollment cancelled', 'success');
        await refreshEnrollmentView();
    } catch (err) {
        showToast(err.message || 'Failed to cancel enrollment', 'error');
    }
}

// ── Update Status ──────────────────────────
function setupStatusForm() {
    $('#status-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('#status-enrollment-id').value;
        const status = $('#status-select').value;

        if (!status) {
            showToast('Please select a status', 'warning');
            return;
        }

        try {
            await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enrollments/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status }),
            });
            showToast(`Status updated to ${status}`, 'success');
            closeModal('modal-status');
            await refreshEnrollmentView();
        } catch (err) {
            showToast(err.message || 'Failed to update status', 'error');
        }
    });
}

function openStatusModal(enrollmentId, currentStatus) {
    $('#status-enrollment-id').value = enrollmentId;
    $('#status-select').value = currentStatus || '';
    openModal('modal-status');
}

// ═══════════════════════════════════════════
//  GRADES
// ═══════════════════════════════════════════
async function loadGrades(studentId) {
    const tbody = $('#grades-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading grades…</td></tr>';
    $('#gpa-summary').classList.add('hidden');

    try {
        const grades = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/grades/student/${studentId}`);

        if (!Array.isArray(grades) || grades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No grades found for this student</td></tr>';
            return;
        }

        tbody.innerHTML = grades.map(g => `
            <tr>
                <td><code>${g.course_id || g.courseId || '—'}</code></td>
                <td>${g.courseName || g.course_name || '—'}</td>
                <td><strong>${g.grade || '—'}</strong></td>
                <td>${g.score || g.marks || '—'}</td>
                <td>${g.credits || '—'}</td>
                <td>${g.semester || '—'}</td>
            </tr>
        `).join('');

        // Try loading GPA
        try {
            const gpaData = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/gpa/${studentId}`);
            if (gpaData?.gpa !== undefined) {
                $('#gpa-value').textContent = parseFloat(gpaData.gpa).toFixed(2);
                $('#gpa-summary').classList.remove('hidden');
            }
        } catch {
            // GPA endpoint might not exist
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${err.message || 'Error loading grades'}</td></tr>`;
    }
}

// ═══════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════
function setupModals() {
    // Close buttons
    $$('.modal-close, [data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.close || btn.closest('.modal-overlay')?.id;
            if (modalId) closeModal(modalId);
        });
    });

    // Click outside to close
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            $$('.modal-overlay.show').forEach(m => closeModal(m.id));
        }
    });
}

function openModal(id) {
    const modal = $(`#${id}`);
    if (modal) modal.classList.add('show');
}

function closeModal(id) {
    const modal = $(`#${id}`);
    if (modal) modal.classList.remove('show');
}

// ═══════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    toast.innerHTML = `<span style="font-weight:700">${icons[type] || 'ℹ'}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ═══════════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════════
async function fetchAPI(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            mode: 'cors',
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        throw new Error('Network error. Check API Gateway/CORS/service availability.');
    } finally {
        clearTimeout(timer);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || data?.error || data?.details || `HTTP ${response.status}: ${response.statusText}`;
        if ((response.status === 401 || response.status === 403) && /invalid|expired|token|required/i.test(message)) {
            clearStoredAuth();
            showLogin();
        }
        throw new Error(
            message
        );
    }

    return data;
}

// ── Utility ───────────────────────────────
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash;
}

// Make functions globally available for inline handlers
window.navigateTo = navigateTo;
window.viewStudentEnrollments = viewStudentEnrollments;
window.viewCourseRoster = viewCourseRoster;
window.cancelEnrollment = cancelEnrollment;
window.openStatusModal = openStatusModal;
