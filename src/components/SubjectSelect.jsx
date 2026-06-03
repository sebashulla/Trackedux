function SubjectSelect({
  value,
  subjects,
  onChange,
  disabled = false,
  required = false,
  showUnassignedWarning = false,
}) {
  return (
    <label className="subject-select">
      Curso de la pregunta
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
      >
        <option value="">{disabled ? 'Ejecuta el SQL de cursos' : 'Sin curso asignado'}</option>
        {(subjects ?? []).map((subject) => (
          <option
            value={subject.id}
            key={subject.id ?? subject.slug}
            disabled={!subject.id || subject.isLocalFallback}
          >
            {subject.name}
          </option>
        ))}
      </select>
      {showUnassignedWarning && (
        <small>Sin curso asignado: esta pregunta no aportara estadisticas por curso.</small>
      )}
    </label>
  )
}

export default SubjectSelect
