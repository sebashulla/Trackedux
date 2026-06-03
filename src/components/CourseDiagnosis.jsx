const renderSubjectList = (items, emptyText) => {
  if (!items.length) return <span className="diagnosis-empty">{emptyText}</span>

  return items.map((item) => (
    <span className={`diagnosis-chip subject-tone-${item.status.key}`} key={item.subjectKey}>
      {item.subjectName}
    </span>
  ))
}

function CourseDiagnosis({ diagnosis }) {
  return (
    <section className="subject-panel course-diagnosis">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Diagnostico</p>
          <h3>Diagnostico por curso</h3>
        </div>
      </div>

      <div className="diagnosis-grid">
        <article>
          <span>Prioridad maxima</span>
          <div>{renderSubjectList(diagnosis.priorityMax, 'Sin cursos criticos')}</div>
        </article>
        <article>
          <span>Reforzar pronto</span>
          <div>{renderSubjectList(diagnosis.reinforceSoon, 'Sin cursos por reforzar')}</div>
        </article>
        <article>
          <span>Buen dominio</span>
          <div>{renderSubjectList(diagnosis.strong, 'Aun sin cursos fuertes')}</div>
        </article>
      </div>

      <p className="diagnosis-reason">{diagnosis.topReason}</p>
    </section>
  )
}

export default CourseDiagnosis
