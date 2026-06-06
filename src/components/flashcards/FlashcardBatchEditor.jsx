import { Plus, Trash2 } from 'lucide-react'
import { createEmptyFlashcardDraft } from '../../utils/flashcards'

function FlashcardBatchEditor({ cards, setCards }) {
  const updateCard = (index, field, value) => {
    setCards((current) => current.map((card, cardIndex) => (
      cardIndex === index ? { ...card, [field]: value } : card
    )))
  }

  const addCard = () => {
    setCards((current) => [...current, createEmptyFlashcardDraft(current.length)])
  }

  const removeCard = (index) => {
    setCards((current) => (
      current.length === 1
        ? [createEmptyFlashcardDraft()]
        : current.filter((_, cardIndex) => cardIndex !== index)
    ))
  }

  return (
    <section className="flashcard-batch-editor">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Tarjetas en lote</p>
          <h2>Agrega varias flashcards</h2>
        </div>
        <button className="secondary-btn" type="button" onClick={addCard}>
          <Plus size={17} />
          Agregar otra tarjeta
        </button>
      </div>

      <div className="batch-card-list">
        {cards.map((card, index) => (
          <article className="batch-card-row" key={card.id ?? index}>
            <div className="batch-card-index">{index + 1}</div>
            <label>
              Anverso
              <textarea
                value={card.front}
                onChange={(event) => updateCard(index, 'front', event.target.value)}
                placeholder="Pregunta, concepto o formula. Ej. $E = mc^2$"
              />
            </label>
            <label>
              Reverso
              <textarea
                value={card.back}
                onChange={(event) => updateCard(index, 'back', event.target.value)}
                placeholder="Respuesta, explicacion o desarrollo"
              />
            </label>
            <label>
              Nota opcional
              <textarea
                value={card.note}
                onChange={(event) => updateCard(index, 'note', event.target.value)}
                placeholder="Mnemotecnia, pista o referencia"
              />
            </label>
            <button
              className="icon-btn batch-remove-btn"
              type="button"
              aria-label={`Eliminar tarjeta ${index + 1}`}
              onClick={() => removeCard(index)}
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default FlashcardBatchEditor
