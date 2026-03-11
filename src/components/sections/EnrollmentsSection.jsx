function enrollmentBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'CANCELLED') return 'badge badge-danger';
  if (status === 'WITHDRAWN') return 'badge badge-warning';
  if (status === 'COMPLETED') return 'badge badge-info';
  return 'badge badge-neutral';
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '-';
  }
}

export default function EnrollmentsSection({
  active,
  enrollments,
  loading,
  error,
  isAdmin,
  filterStudentId,
  onFilterStudentIdChange,
  onFilterSubmit,
  onOpenNewEnrollment,
  onOpenStatusModal,
  onCancelEnrollment,
}) {
  const sectionClass = active ? 'page-section active' : 'page-section';

  return (
    <section id="page-enrollments" className={sectionClass}>
      <div className="section-header">
        <h3>Enrollment Records</h3>
        <div className="section-actions">
          <div className="filter-group">
            <label htmlFor="filter-student-id">Student ID:</label>
            <input
              id="filter-student-id"
              type="text"
              className="input-sm"
              placeholder={isAdmin ? 'e.g. S1001' : 'Your student ID'}
              disabled={!isAdmin}
              value={filterStudentId}
              onChange={(event) => onFilterStudentIdChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onFilterSubmit();
                }
              }}
            />
            <button className="btn btn-outline btn-sm" type="button" onClick={onFilterSubmit}>
              {isAdmin ? 'Search' : 'My Enrollments'}
            </button>
          </div>

          <button className="btn btn-primary btn-sm" type="button" onClick={onOpenNewEnrollment}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Enrollment
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Enrollment ID</th>
                <th>Student</th>
                <th>Course</th>
                <th>Status</th>
                <th>Enrolled At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    Loading enrollments...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    {error}
                  </td>
                </tr>
              ) : enrollments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No enrollments found
                  </td>
                </tr>
              ) : (
                enrollments.map((enrollment) => (
                  <tr key={enrollment._id || `${enrollment.student_id}-${enrollment.course_id}`}>
                    <td>
                      <code>{enrollment._id || '-'}</code>
                    </td>
                    <td>{enrollment.student_name || enrollment.student_id || '-'}</td>
                    <td>{enrollment.course_name || enrollment.course_id || '-'}</td>
                    <td>
                      <span className={enrollmentBadgeClass(enrollment.status)}>
                        {enrollment.status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td>{formatDate(enrollment.enrolled_at)}</td>
                    <td className="actions-cell">
                      <button
                        className="btn btn-outline btn-xs"
                        type="button"
                        onClick={() => onOpenStatusModal(enrollment._id, enrollment.status)}
                      >
                        Status
                      </button>
                      {enrollment.status === 'ACTIVE' && (
                        <button
                          className="btn btn-danger btn-xs"
                          type="button"
                          onClick={() => onCancelEnrollment(enrollment._id)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
