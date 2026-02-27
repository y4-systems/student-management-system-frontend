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
};

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
    // Check if user is logged in
    if (state.token) {
        showApp();
    } else {
        showLogin();
    }

    // Event Listeners
    setupLoginForm();
    setupNavigation();
    setupModals();
    setupEnrollmentForm();
    setupStatusForm();
    setupFilters();
    setupLogout();
    setupMobileMenu();
}

// ═══════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════
function setupLoginForm() {
    const form = $('#login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#login-email').value.trim();
        const password = $('#login-password').value;

        if (!email || !password) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        const btn = $('#login-btn');
        btn.disabled = true;
        btn.innerHTML = '<span>Signing in…</span>';

        try {
            // Try to authenticate via API Gateway
            const response = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/auth/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            state.token = response.token || 'demo-token-' + Date.now();
            state.user = response.user || { email, name: email.split('@')[0] };
        } catch (err) {
            // Fallback: allow demo login
            console.warn('Auth service unavailable, using demo login');
            state.token = 'demo-token-' + Date.now();
            state.user = {
                email,
                name: email.split('@')[0],
                role: 'admin'
            };
        }

        localStorage.setItem('uniportal_token', state.token);
        localStorage.setItem('uniportal_user', JSON.stringify(state.user));

        btn.disabled = false;
        btn.innerHTML = '<span>Sign In</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

        showToast('Welcome back!', 'success');
        showApp();
    });
}

function setupLogout() {
    $('#logout-btn').addEventListener('click', () => {
        state.token = null;
        state.user = null;
        localStorage.removeItem('uniportal_token');
        localStorage.removeItem('uniportal_user');
        showLogin();
        showToast('Logged out successfully', 'info');
    });
}

function showLogin() {
    $('#login-page').classList.add('active');
    $('#app-shell').classList.add('hidden');
}

function showApp() {
    $('#login-page').classList.remove('active');
    $('#app-shell').classList.remove('hidden');

    // Set user avatar
    if (state.user?.name) {
        $('#user-avatar span').textContent = state.user.name.charAt(0).toUpperCase();
    }

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

function navigateTo(page) {
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

    // Close mobile sidebar
    $('#sidebar').classList.remove('open');
    const overlay = $('.sidebar-overlay');
    if (overlay) overlay.classList.remove('show');

    // Load page data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'students': loadStudents(); break;
        case 'courses': loadCourses(); break;
        case 'enrollments': loadAllEnrollments(); break;
        case 'grades': break; // loaded on filter
    }
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
        const students = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students`);
        const count = Array.isArray(students) ? students.length : (students?.count || '—');
        $('#stat-students').textContent = count;
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
        const students = await fetchAPI(`${CONFIG.GATEWAY_URL}/api/students`);

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
    navigateTo('enrollments');
    $('#filter-student-id').value = studentId;
    loadEnrollmentsByStudent(studentId);
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
    navigateTo('enrollments');
    showToast(`Loading roster for course ${courseId}…`, 'info');
    loadEnrollmentsByCourse(courseId);
}

// ═══════════════════════════════════════════
//  ENROLLMENTS
// ═══════════════════════════════════════════
function setupFilters() {
    $('#filter-enrollments-btn').addEventListener('click', () => {
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

async function loadEnrollmentsByStudent(studentId) {
    const tbody = $('#enrollments-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading enrollments…</td></tr>';

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

async function loadEnrollmentsByCourse(courseId) {
    const tbody = $('#enrollments-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading roster…</td></tr>';

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

async function loadAllEnrollments() {
    const tbody = $('#enrollments-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading all recent enrollments…</td></tr>';

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
        openModal('modal-enrollment');
    });

    $('#enrollment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const student_id = $('#enroll-student-id').value.trim();
        const course_id = $('#enroll-course-id').value.trim();

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
            navigateTo('enrollments');
            $('#filter-student-id').value = student_id;

            // Give the DB a moment to index if needed, then load
            setTimeout(() => {
                loadEnrollmentsByStudent(student_id);
            }, 800);

        } catch (err) {
            showToast(err.message || 'Failed to create enrollment', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// ── Cancel Enrollment ──────────────────────
async function cancelEnrollment(enrollmentId) {
    if (!confirm('Are you sure you want to cancel this enrollment?')) return;

    try {
        await fetchAPI(`${CONFIG.GATEWAY_URL}/api/enroll/${enrollmentId}`, {
            method: 'DELETE',
        });
        showToast('Enrollment cancelled', 'success');

        // Refresh current view
        const studentId = $('#filter-student-id').value.trim();
        if (studentId) loadEnrollmentsByStudent(studentId);
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

            // Refresh current view
            const studentId = $('#filter-student-id').value.trim();
            if (studentId) loadEnrollmentsByStudent(studentId);
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

    const response = await fetch(url, {
        ...options,
        headers,
        mode: 'cors',
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message || `HTTP ${response.status}: ${response.statusText}`);
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
