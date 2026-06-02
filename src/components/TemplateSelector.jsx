import { FileText, Sparkles } from 'lucide-react'
import ExamTemplateCard from './ExamTemplateCard'
import { getTemplateFormDefaults } from '../data/examTemplates'

function TemplateSelector({
  mode,
  setMode,
  customForm,
  setCustomForm,
  onCustomSubmit,
  customLoading,
  templates,
  templateForms,
  setTemplateForms,
  onTemplateSubmit,
  getTemplateLoading,
  hasExistingTemplate,
  customSubmitText,
}) {
  const activeTemplate = templates.find((template) => template.code === mode) ?? templates[0]
  const activeTemplateForm = templateForms[activeTemplate.code] ?? getTemplateFormDefaults(activeTemplate)

  const updateActiveTemplateForm = (nextForm) => {
    setTemplateForms((current) => ({
      ...current,
      [activeTemplate.code]: nextForm,
    }))
  }

  return (
    <div className="template-selector">
      <div className="template-tabs" aria-label="Tipo de preparacion">
        <button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
          <FileText size={17} />
          Personalizada
        </button>
        {templates.map((template) => (
          <button type="button" className={mode === template.code ? 'active' : ''} onClick={() => setMode(template.code)} key={template.code}>
            <Sparkles size={17} />
            {template.shortName ?? template.name}
          </button>
        ))}
      </div>

      {mode === 'custom' ? (
        <form onSubmit={onCustomSubmit} className="stack-form">
          <label>
            Nombre del examen
            <input
              value={customForm.name}
              onChange={(event) => setCustomForm({ ...customForm, name: event.target.value })}
              placeholder="Ej. Admision UNI"
              autoFocus
            />
          </label>
          <label>
            Fecha para la que te preparas
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={customForm.targetDate}
              onChange={(event) => setCustomForm({ ...customForm, targetDate: event.target.value })}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={customLoading}>
            <FileText size={18} />
            {customSubmitText}
          </button>
        </form>
      ) : (
        <ExamTemplateCard
          template={activeTemplate}
          form={activeTemplateForm}
          setForm={updateActiveTemplateForm}
          onSubmit={onTemplateSubmit}
          loading={getTemplateLoading(activeTemplate)}
          hasExistingTemplate={hasExistingTemplate(activeTemplate)}
        />
      )}
    </div>
  )
}

export default TemplateSelector
