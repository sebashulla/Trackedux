import { ArrowLeft, CheckCircle2, Flame, RotateCcw, Trophy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateMasteryPercentage, normalizeRating } from '../../utils/flashcards'
import FlashcardViewer from './FlashcardViewer'

const emptyCounts = {
  difficultCount: 0,
  normalCount: 0,
  easyCount: 0,
}

function StudyDeckPage({ deck, cards, onBack, onSaveSession }) {
  const [queue, setQueue] = useState(() => cards.map((card) => ({ ...card, repeated: false })))
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [counts, setCounts] = useState(emptyCounts)
  const [difficultCards, setDifficultCards] = useState([])
  const sessionSavedRef = useRef(false)

  const currentCard = queue[index] ?? null
  const finished = index >= queue.length
  const totalRatings = counts.difficultCount + counts.normalCount + counts.easyCount
  const masteryPercentage = calculateMasteryPercentage({ totalCards: totalRatings, ...counts })
  const progressPercent = queue.length ? Math.min(100, Math.round((index / queue.length) * 100)) : 0

  const summary = useMemo(() => ({
    totalCards: totalRatings,
    difficultCount: counts.difficultCount,
    normalCount: counts.normalCount,
    easyCount: counts.easyCount,
    masteryPercentage,
  }), [counts, masteryPercentage, totalRatings])

  useEffect(() => {
    if (!finished || sessionSavedRef.current || !summary.totalCards) return
    sessionSavedRef.current = true
    onSaveSession(summary)
  }, [finished, onSaveSession, summary])

  const rateCard = (rating) => {
    if (!currentCard) return
    const normalized = normalizeRating(rating)

    setCounts((current) => ({
      difficultCount: current.difficultCount + (normalized === 'dificil' ? 1 : 0),
      normalCount: current.normalCount + (normalized === 'normal' ? 1 : 0),
      easyCount: current.easyCount + (normalized === 'facil' ? 1 : 0),
    }))

    if (normalized === 'dificil' && !currentCard.repeated) {
      setDifficultCards((current) => (
        current.some((card) => card.id === currentCard.id) ? current : [...current, currentCard]
      ))
      setQueue((current) => [...current, { ...currentCard, repeated: true }])
    }

    setIndex((current) => current + 1)
    setFlipped(false)
  }

  const repeatDifficult = () => {
    if (!difficultCards.length) return
    setQueue(difficultCards.map((card) => ({ ...card, repeated: true })))
    setIndex(0)
    setFlipped(false)
    setCounts(emptyCounts)
    sessionSavedRef.current = false
  }

  if (!cards.length) {
    return (
      <main className="flashcards-page reveal">
        <section className="empty-state">
          <h2>Este mazo aun no tiene tarjetas</h2>
          <p>Agrega tarjetas para empezar una sesion de estudio.</p>
          <button className="secondary-btn" type="button" onClick={onBack}>
            <ArrowLeft size={18} />
            Volver a Repaso
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="flashcards-page study-page reveal">
      <section className="study-topbar">
        <button className="ghost-btn" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Repaso
        </button>
        <div>
          <p className="eyebrow">Sesion de flashcards</p>
          <h1>{deck.title}</h1>
        </div>
        <div className="study-progress-chip">
          {Math.min(index + (finished ? 0 : 1), queue.length)} / {queue.length}
        </div>
      </section>

      {!finished ? (
        <>
          <section className="study-progress-panel">
            <div className="study-progress-bar" aria-label={`Avance ${progressPercent}%`}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="study-metrics">
              <span>{progressPercent}% avance</span>
              <span><Flame size={14} /> {counts.difficultCount} dificiles</span>
              <span><CheckCircle2 size={14} /> {counts.normalCount + counts.easyCount} dominadas</span>
            </div>
          </section>

          <FlashcardViewer card={currentCard} flipped={flipped} onFlip={() => setFlipped((current) => !current)} />

          {flipped && (
            <section className="rating-actions" aria-label="Autoevaluacion">
              <button className="rating-btn difficult" type="button" onClick={() => rateCard('dificil')}>Dificil</button>
              <button className="rating-btn normal" type="button" onClick={() => rateCard('normal')}>Normal</button>
              <button className="rating-btn easy" type="button" onClick={() => rateCard('facil')}>Facil</button>
            </section>
          )}
        </>
      ) : (
        <section className="study-summary">
          <span className="summary-icon"><Trophy size={28} /></span>
          <p className="eyebrow">Sesion terminada</p>
          <h2>Resumen de dominio</h2>
          <div className="summary-score">{masteryPercentage}%</div>
          <div className="summary-grid">
            <span><strong>{summary.totalCards}</strong> estudiadas</span>
            <span><strong>{summary.difficultCount}</strong> dificiles</span>
            <span><strong>{summary.normalCount}</strong> normales</span>
            <span><strong>{summary.easyCount}</strong> faciles</span>
          </div>
          <div className="summary-actions">
            <button className="secondary-btn" type="button" onClick={repeatDifficult} disabled={!difficultCards.length}>
              <RotateCcw size={18} />
              Repetir dificiles
            </button>
            <button className="primary-btn" type="button" onClick={onBack}>
              <ArrowLeft size={18} />
              Volver a Repaso
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

export default StudyDeckPage
