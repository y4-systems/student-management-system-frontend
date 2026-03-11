function formatStudentName(student) {
  if (student?.name) return student.name;
  const composite = [student?.firstName, student?.lastName].filter(Boolean).join(' ');
  return composite || '-';
}

export default function StudentsSection({
  active,
  students,
  loading,
  error,
  isAdmin,
  currentStudentId,
  onAddStudent,
  onViewEnrollments,
  onEdit,
  onDelete,
}) {
  const sectionClass = active ? 'page-section active' : 'page-section';

  return (
    <section id="page-students" className={sectionClass}>
      <div className="section-header">
        <h3>Student Directory</h3>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" type="button" onClick={onAddStudent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Student
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Programme</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    Loading students...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    {error}
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No students found
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const rowId = student?._id || student?.studentId || student?.id || '-';
                  const canMutate = isAdmin || String(rowId) === String(currentStudentId || '');

                  return (
                    <tr key={rowId}>
                      <td>
                        <code>{rowId}</code>
                      </td>
                      <td>{formatStudentName(student)}</td>
                      <td>{student?.email || '-'}</td>
                      <td>{student?.programme || student?.department || '-'}</td>
                      <td>
                        <span className="badge badge-success">{student?.status || 'Active'}</span>
                      </td>
                      <td className="actions-cell">
                        <button className="btn btn-outline btn-xs" type="button" onClick={() => onViewEnrollments(rowId)}>
                          Enrollments
                        </button>
                        {canMutate && (
                          <button className="btn btn-outline btn-xs" type="button" onClick={() => onEdit(rowId)}>
                            Edit
                          </button>
                        )}
                        {canMutate && (
                          <button className="btn btn-danger btn-xs" type="button" onClick={() => onDelete(rowId)}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
