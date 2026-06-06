import { ArrowLeft, Check, LoaderCircle, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createEmptyFlashcardDraft, getTagsText } from '../../utils/flashcards'
import FlashcardBatchEditor from './FlashcardBatchEditor'

const getInitialForm = (deck) => ({
  title: deck?.title ?? '',
  description: deck?.description ?? '',
  courseName: deck?.courseName ?? '',
  topicName: deck?.topicName ?? '',
  visibility: deck?.isPublic ? 'public' : 'private',
  tagsText: getTagsText(deck?.tags),
})

function DeckEditor({
  deck,
  initialCards,
  courses,
  onBack,
  onSave,
  onDelete,
  saving,
  deleting,
}) {
  const [form, setForm] = useState(() => getInitialForm(deck))
  const [cards, setCards] = useState(() => (
    initialCards?.length
      ? initialCards.map((card, index) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        note: card.note ?? '',
        sortOrder: index,
      }))
      : [createEmptyFlashcardDraft()]
  ))

  const selectedCourse = useMemo(() => (
    courses.find((course) => course.name === form.courseName) ?? null
  ), [courses, form.courseName])

  const topics = selectedCourse?.topics ?? []

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'courseName' ? { topicName: '' } : {}),
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSave({ form, cards })
  }

  return (
    <main className="flashcards-page reveal">
      <section className="flashcards-hero editor-hero">
        <button className="ghost-btn" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Volver
        </button>
        <div>
          <p className="eyebrow">Biblioteca de repaso</p>
          <h1>{deck ? 'Editar mazo' : 'Nuevo mazo'}</h1>
          <p>Escribe tarjetas en lote con Markdown basico y formulas LaTeX entre signos de dolar.</p>
        </div>
      </section>

      <form className="deck-editor-layout" onSubmit={handleSubmit}>
        <section className="deck-form-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Datos del mazo</p>
              <h2>Configuracion</h2>
            </div>
          </div>

          <label>
            Titulo del mazo
            <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="Ej. Cinematica UNI" />
          </label>

          <label>
            Descripcion
            <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Objetivo, enfoque o notas del mazo" />
          </label>

          <div className="deck-editor-grid">
            <label>
              Curso relacionado
              <input
                list="flashcard-course-options"
                value={form.courseName}
                onChange={(event) => updateForm('courseName', event.target.value)}
                placeholder="Curso manual o existente"
              />
              <datalist id="flashcard-course-options">
                {courses.map((course) => <option value={course.name} key={course.id} />)}
              </datalist>
            </label>

            <label>
              Tema relacionado
              <input
                list="flashcard-topic-options"
                value={form.topicName}
                onChange={(event) => updateForm('topicName', event.target.value)}
                placeholder="Tema manual u opcional"
              />
              <datalist id="flashcard-topic-options">
                {topics.map((topic) => <option value={topic.name} key={topic.id} />)}
              </datalist>
            </label>
          </div>

          <label>
            Etiquetas
            <input value={form.tagsText} onChange={(event) => updateForm('tagsText', event.target.value)} placeholder="formulas, teoria, errores frecuentes" />
          </label>

          <div className="visibility-control" role="radiogroup" aria-label="Visibilidad del mazo">
            <button
              type="button"
              className={form.visibility === 'private' ? 'active' : ''}
              onClick={() => updateForm('visibility', 'private')}
            >
              Privado
            </button>
            <button
              type="button"
              className={form.visibility === 'public' ? 'active' : ''}
              onClick={() => updateForm('visibility', 'public')}
            >
              Publico
            </button>
          </div>

          <div className="deck-form-actions">
            {deck && (
              <button className="danger-btn" type="button" onClick={onDelete} disabled={saving || deleting}>
                {deleting ? <LoaderCircle className="spinner" size={18} /> : <Trash2 size={18} />}
                Eliminar
              </button>
            )}
            <button className="primary-btn" type="submit" disabled={saving || deleting}>
              {saving ? <LoaderCircle className="spinner" size={18} /> : deck ? <Check size={18} /> : <Save size={18} />}
              Guardar mazo
            </button>
          </div>
        </section>

        <FlashcardBatchEditor cards={cards} setCards={setCards} />
      </form>
    </main>
  )
}

export default DeckEditor
