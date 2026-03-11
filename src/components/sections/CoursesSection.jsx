export default function CoursesSection({
  active,
  courses,
  loading,
  error,
  isAdmin,
  onAddCourse,
  onViewRoster,
}) {
  const sectionClass = active ? 'page-section active' : 'page-section';

  return (
    <section id="page-courses" className={sectionClass}>
      <div className="section-header">
        <h3>Course Catalog</h3>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" type="button" onClick={onAddCourse}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Course
          </button>
        )}
      </div>

      <div className="courses-grid">
        {loading ? (
          <div className="empty-state">Loading courses...</div>
        ) : error ? (
          <div className="empty-state">{error}</div>
        ) : courses.length === 0 ? (
          <div className="empty-state">No courses found</div>
        ) : (
          courses.map((course) => {
            const courseId = course?._id || course?.courseId || course?.id || '-';
            return (
              <div className="course-card" key={courseId}>
                <h4>{course?.name || course?.courseName || course?.title || '-'}</h4>
                <p>
                  <strong>ID:</strong> {courseId}
                </p>
                <p>{course?.description || ''}</p>
                <div className="course-card-footer">
                  <span className="course-credits">{course?.credits || '-'} Credits</span>
                  <button className="btn btn-outline btn-xs" type="button" onClick={() => onViewRoster(courseId)}>
                    View Roster
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
