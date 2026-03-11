function enrollmentBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'CANCELLED') return 'badge badge-danger';
  if (status === 'WITHDRAWN') return 'badge badge-warning';
  if (status === 'COMPLETED') return 'badge badge-info';
  return 'badge badge-neutral';
}

function formatShortDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function DashboardSection({
  active,
  stats,
  recentEnrollments,
  health,
  onViewEnrollments,
}) {
  const sectionClass = active ? 'page-section active' : 'page-section';
  const gatewayBadgeClass =
    health.allOnline === true
      ? 'badge badge-success'
      : health.allOnline === false
        ? 'badge badge-warning'
        : 'badge badge-info';
  const gatewayBadgeLabel =
    health.allOnline === true
      ? 'All Online'
      : health.allOnline === false
        ? 'Partial'
        : 'Checking...';

  const healthItems = [
    { key: 'gateway', label: 'API Gateway' },
    { key: 'student', label: 'User Service' },
    { key: 'course', label: 'Course Service' },
    { key: 'enrollment', label: 'Enrollment Service' },
    { key: 'grade', label: 'Grade Service' },
  ];

  return (
    <section id="page-dashboard" className={sectionClass}>
      <div className="stats-grid">
        <div className="stat-card stat-indigo">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.students}</span>
            <span className="stat-label">Total Students</span>
          </div>
        </div>

        <div className="stat-card stat-emerald">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.courses}</span>
            <span className="stat-label">Active Courses</span>
          </div>
        </div>

        <div className="stat-card stat-amber">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.enrollments}</span>
            <span className="stat-label">Enrollments</span>
          </div>
        </div>

        <div className="stat-card stat-rose">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.gpa}</span>
            <span className="stat-label">Avg. GPA</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card recent-enrollments-card">
          <div className="card-header">
            <h3>Recent Enrollments</h3>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onViewEnrollments}>
              View All
            </button>
          </div>
          <div className="card-body">
            <div className="list-items">
              {recentEnrollments.length === 0 ? (
                <div className="empty-state-sm">No recent enrollments</div>
              ) : (
                recentEnrollments.slice(0, 5).map((item) => (
                  <div className="list-item" key={item._id || `${item.student_id}-${item.course_id}-${item.enrolled_at}`}>
                    <div className="list-item-info">
                      <span className="list-item-title">
                        {item.student_name || item.student_id} -&gt; {item.course_name || item.course_id}
                      </span>
                      <span className="list-item-sub">{formatShortDate(item.enrolled_at)}</span>
                    </div>
                    <span className={enrollmentBadgeClass(item.status)}>{item.status || 'UNKNOWN'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card system-health-card">
          <div className="card-header">
            <h3>System Health</h3>
            <span className={gatewayBadgeClass}>{gatewayBadgeLabel}</span>
          </div>
          <div className="card-body">
            <div className="health-items">
              {healthItems.map((item) => {
                const online = health[item.key];
                const dotClass =
                  online === true
                    ? 'health-dot online'
                    : online === false
                      ? 'health-dot offline'
                      : 'health-dot';

                return (
                  <div className="health-item" key={item.key}>
                    <span className={dotClass} />
                    <span>{item.label}</span>
                    <span className="health-status">
                      {online === true ? 'Online' : online === false ? 'Offline' : '...'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
