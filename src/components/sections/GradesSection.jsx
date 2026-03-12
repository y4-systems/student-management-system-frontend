export default function GradesSection({
  active,
  studentId,
  onStudentIdChange,
  onViewGrades,
  grades,
  loading,
  error,
  gpa,
}) {
  const sectionClass = active ? 'page-section active' : 'page-section';

  return (
    <section id="page-grades" className={sectionClass}>
      <div className="section-header">
        <h3>Grade Reports</h3>
        <div className="section-actions">
          <div className="filter-group">
            <label htmlFor="grade-student-id">Student ID:</label>
            <input
              id="grade-student-id"
              type="text"
              className="input-sm"
              placeholder="e.g. S1001"
              value={studentId}
              onChange={(event) => onStudentIdChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onViewGrades();
                }
              }}
            />
            <button className="btn btn-outline btn-sm" type="button" onClick={onViewGrades}>
              View Grades
            </button>
          </div>
        </div>
      </div>

      <div className={gpa === null ? 'gpa-summary hidden' : 'gpa-summary'}>
        <div className="gpa-card glass-card">
          <span className="gpa-label">Cumulative GPA</span>
          <span className="gpa-value">{gpa === null ? '0.00' : Number(gpa).toFixed(2)}</span>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course ID</th>
                <th>Course Name</th>
                <th>Grade</th>
                <th>Score</th>
                <th>Credits</th>
                <th>Semester</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    Loading grades...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    {error}
                  </td>
                </tr>
              ) : grades.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    Enter a Student ID to view grades
                  </td>
                </tr>
              ) : (
                grades.map((grade, index) => (
                  <tr key={`${grade.course_id || grade.courseId || 'course'}-${index}`}>
                    <td>
                      <code>{grade.course_id || grade.courseId || '-'}</code>
                    </td>
                    <td>{grade.courseName || grade.course_name || '-'}</td>
                    <td>
                      <strong>{grade.grade || '-'}</strong>
                    </td>
                    <td>{grade.score || grade.marks || '-'}</td>
                    <td>{grade.credits || '-'}</td>
                    <td>{grade.semester || '-'}</td>
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
