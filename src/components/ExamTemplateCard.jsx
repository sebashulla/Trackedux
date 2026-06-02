import { CalendarDays, GraduationCap, LoaderCircle, Sparkles } from 'lucide-react'
import { countTemplateTopics } from '../data/examTemplates'

function ExamTemplateCard({
  template,
  form,
  setForm,
  onSubmit,
  loading,
  hasExistingTemplate,
}) {
  const topicCount = countTemplateTopics(template)

  return (
    <article className="template-card">
      <div className="template-card-head">
        <span className="template-icon"><GraduationCap size={24} /></span>
        <div>
          <p className="eyebrow">{template.institution}</p>
          <h2>{template.name}</h2>
          <p>{template.description}</p>
        </div>
      </div>

      <div className="template-stats">
        <span><Sparkles size={15} /> {template.courses.length} cursos</span>
        <span><CalendarDays size={15} /> {topicCount} temas iniciales</span>
      </div>

      {hasExistingTemplate && (
        <div className="template-warning">
          Ya tienes una preparacion {template.shortName ?? template.name}. Puedes crear otra si le das un nombre distinto.
        </div>
      )}

      <form className="stack-form" onSubmit={onSubmit}>
        <label>
          Nombre de la preparacion
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={template.defaultName}
          />
        </label>
        <label>
          Fecha del examen
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={form.targetDate}
            onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
          />
        </label>
        {(template.fields ?? []).map((field) => (
          <label key={field.name}>
            {field.label}{field.optional ? ' (opcional)' : ''}
            {field.type === 'select' ? (
              <select
                value={form[field.name] ?? field.defaultValue ?? ''}
                onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
              >
                {(field.options ?? []).map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                value={form[field.name] ?? ''}
                onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                placeholder={field.placeholder}
              />
            )}
          </label>
        ))}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? <LoaderCircle className="spinner" size={18} /> : <Sparkles size={18} />}
          Crear preparacion con plantilla
        </button>
      </form>

      <p className="template-note">{template.sourceNote}</p>
    </article>
  )
}

export default ExamTemplateCard
