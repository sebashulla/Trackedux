import { BookOpenCheck, Brain, Layers3, LoaderCircle, Plus, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import DeckCard from '../components/flashcards/DeckCard'
import DeckEditor from '../components/flashcards/DeckEditor'
import PublicDecksPage from '../components/flashcards/PublicDecksPage'
import StudyDeckPage from '../components/flashcards/StudyDeckPage'
import {
  clonePublicDeck,
  deleteDeck,
  fetchDeckWithCards,
  fetchFlashcardDecks,
  saveDeckWithCards,
  saveStudySession,
} from '../lib/flashcardsService'

const normalizeSearch = (value) => String(value ?? '').trim().toLowerCase()
const EMPTY_COURSES = []

const filterDecks = ({ decks, currentUserId, scope, query, course, topic }) => {
  const search = normalizeSearch(query)

  return decks.filter((deck) => {
    const isMine = deck.userId === currentUserId
    const matchesScope = scope === 'public'
      ? deck.isPublic && !isMine
      : scope === 'mine'
        ? isMine
        : true
    const matchesCourse = !course || deck.courseName === course
    const matchesTopic = !topic || deck.topicName === topic
    const matchesSearch = !search || [
      deck.title,
      deck.description,
      deck.courseName,
      deck.topicName,
      ...(deck.tags ?? []),
    ].some((value) => normalizeSearch(value).includes(search))

    return matchesScope && matchesCourse && matchesTopic && matchesSearch
  })
}

function FlashcardsPage({ currentUserId, exam, showToast }) {
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('library')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('mine')
  const [courseFilter, setCourseFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [selectedDeck, setSelectedDeck] = useState(null)
  const [selectedCards, setSelectedCards] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cloneLoadingId, setCloneLoadingId] = useState('')

  const courses = useMemo(() => exam?.courses ?? EMPTY_COURSES, [exam?.courses])
  const selectedDeckId = selectedDeck?.id

  const loadDecks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchFlashcardDecks()
      setDecks(rows)
    } catch (loadError) {
      setDecks([])
      setError(
        /relation|flashcard_decks|schema cache/i.test(loadError?.message ?? '')
          ? 'Aun falta ejecutar supabase/flashcards_module.sql en Supabase.'
          : loadError?.message ?? 'No se pudo cargar Repaso.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDecks()
  }, [loadDecks])

  const courseOptions = useMemo(() => {
    const values = new Set([
      ...courses.map((course) => course.name),
      ...decks.map((deck) => deck.courseName).filter(Boolean),
    ])
    return [...values].sort((a, b) => a.localeCompare(b, 'es'))
  }, [courses, decks])

  const topicOptions = useMemo(() => {
    const courseTopics = courses
      .filter((course) => !courseFilter || course.name === courseFilter)
      .flatMap((course) => course.topics.map((topic) => topic.name))
    const deckTopics = decks
      .filter((deck) => !courseFilter || deck.courseName === courseFilter)
      .map((deck) => deck.topicName)
      .filter(Boolean)
    return [...new Set([...courseTopics, ...deckTopics])].sort((a, b) => a.localeCompare(b, 'es'))
  }, [courseFilter, courses, decks])

  const filteredDecks = useMemo(() => filterDecks({
    decks,
    currentUserId,
    scope,
    query,
    course: courseFilter,
    topic: topicFilter,
  }), [courseFilter, currentUserId, decks, query, scope, topicFilter])

  const publicDecks = useMemo(() => filterDecks({
    decks,
    currentUserId,
    scope: 'public',
    query,
    course: courseFilter,
    topic: topicFilter,
  }), [courseFilter, currentUserId, decks, query, topicFilter])

  const myDecksCount = decks.filter((deck) => deck.userId === currentUserId).length
  const publicCount = decks.filter((deck) => deck.isPublic && deck.userId !== currentUserId).length
  const totalCards = decks
    .filter((deck) => deck.userId === currentUserId)
    .reduce((sum, deck) => sum + deck.cardCount, 0)

  const openNewDeck = () => {
    setSelectedDeck(null)
    setSelectedCards([])
    setMode('editor')
  }

  const openEditor = async (deckId) => {
    try {
      const data = await fetchDeckWithCards(deckId)
      setSelectedDeck(data.deck)
      setSelectedCards(data.cards)
      setMode('editor')
    } catch (openError) {
      showToast(openError?.message ?? 'No se pudo abrir el mazo.', 'error')
    }
  }

  const openStudy = async (deckId) => {
    try {
      const data = await fetchDeckWithCards(deckId)
      setSelectedDeck(data.deck)
      setSelectedCards(data.cards)
      setMode('study')
    } catch (openError) {
      showToast(openError?.message ?? 'No se pudo iniciar la sesion.', 'error')
    }
  }

  const handleSave = async ({ form, cards }) => {
    setSaving(true)
    try {
      await saveDeckWithCards({
        deckId: selectedDeckId,
        form,
        cards,
        userId: currentUserId,
      })
      await loadDecks()
      setMode('library')
      showToast('Mazo guardado.')
    } catch (saveError) {
      showToast(saveError?.message ?? 'No se pudo guardar el mazo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedDeck || !window.confirm('Eliminar este mazo y todas sus tarjetas?')) return
    setDeleting(true)
    try {
      await deleteDeck(selectedDeck.id)
      await loadDecks()
      setSelectedDeck(null)
      setSelectedCards([])
      setMode('library')
      showToast('Mazo eliminado.', 'info')
    } catch (deleteError) {
      showToast(deleteError?.message ?? 'No se pudo eliminar el mazo.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleClone = async (deckId) => {
    setCloneLoadingId(deckId)
    try {
      await clonePublicDeck({ deckId, userId: currentUserId })
      await loadDecks()
      setScope('mine')
      showToast('Mazo clonado en tu biblioteca.')
    } catch (cloneError) {
      showToast(cloneError?.message ?? 'No se pudo clonar el mazo.', 'error')
    } finally {
      setCloneLoadingId('')
    }
  }

  const handleSaveSession = useCallback(async (summary) => {
    if (!selectedDeckId) return

    try {
      await saveStudySession({ deckId: selectedDeckId, userId: currentUserId, summary })
      await loadDecks()
    } catch (sessionError) {
      showToast(sessionError?.message ?? 'No se pudo guardar la sesion.', 'error')
    }
  }, [currentUserId, loadDecks, selectedDeckId, showToast])

  if (mode === 'editor') {
    return (
      <DeckEditor
        deck={selectedDeck}
        initialCards={selectedCards}
        courses={courses}
        onBack={() => setMode('library')}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        deleting={deleting}
      />
    )
  }

  if (mode === 'study' && selectedDeck) {
    return (
      <StudyDeckPage
        deck={selectedDeck}
        cards={selectedCards}
        onBack={() => {
          setMode('library')
          setSelectedDeck(null)
          setSelectedCards([])
        }}
        onSaveSession={handleSaveSession}
      />
    )
  }

  return (
    <main className="flashcards-page reveal">
      <section className="flashcards-hero">
        <div>
          <p className="eyebrow">Repaso inteligente</p>
          <h1>Biblioteca de Repaso</h1>
          <p>Crea mazos de flashcards, estudia con volteo rapido y refuerza al final las tarjetas marcadas como dificiles.</p>
        </div>
        <button className="primary-btn" type="button" onClick={openNewDeck}>
          <Plus size={18} />
          Nuevo mazo
        </button>
      </section>

      {error && <div className="template-warning">{error}</div>}

      <section className="flashcard-stats-grid">
        <article>
          <BookOpenCheck size={20} />
          <span>Mis mazos</span>
          <strong>{myDecksCount}</strong>
        </article>
        <article>
          <Layers3 size={20} />
          <span>Tarjetas</span>
          <strong>{totalCards}</strong>
        </article>
        <article>
          <Sparkles size={20} />
          <span>Publicos</span>
          <strong>{publicCount}</strong>
        </article>
      </section>

      <section className="flashcard-toolbar">
        <div className="flashcard-scope-tabs" role="tablist" aria-label="Filtro de mazos">
          <button type="button" className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>Mis mazos</button>
          <button type="button" className={scope === 'public' ? 'active' : ''} onClick={() => setScope('public')}>Publicos</button>
          <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Todos</button>
        </div>

        <div className="course-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mazos, cursos o etiquetas" />
        </div>

        <select value={courseFilter} onChange={(event) => {
          setCourseFilter(event.target.value)
          setTopicFilter('')
        }}>
          <option value="">Todos los cursos</option>
          {courseOptions.map((course) => <option value={course} key={course}>{course}</option>)}
        </select>

        <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
          <option value="">Todos los temas</option>
          {topicOptions.map((topic) => <option value={topic} key={topic}>{topic}</option>)}
        </select>
      </section>

      {loading ? (
        <section className="flashcard-loading">
          <LoaderCircle className="spinner" size={26} />
          Cargando biblioteca...
        </section>
      ) : scope === 'public' ? (
        <PublicDecksPage
          decks={publicDecks}
          currentUserId={currentUserId}
          query={query}
          setQuery={setQuery}
          onStudy={openStudy}
          onClone={handleClone}
          cloneLoadingId={cloneLoadingId}
        />
      ) : (
        <section className="deck-grid">
          {filteredDecks.map((deck) => (
            <DeckCard
              deck={deck}
              currentUserId={currentUserId}
              onStudy={openStudy}
              onEdit={openEditor}
              onClone={handleClone}
              cloneLoading={cloneLoadingId === deck.id}
              key={deck.id}
            />
          ))}

          {!filteredDecks.length && (
            <div className="empty-state flashcards-empty">
              <Brain size={34} />
              <h2>{scope === 'mine' ? 'Tu biblioteca esta lista para empezar' : 'No encontre mazos'}</h2>
              <p>Crea un mazo nuevo o cambia los filtros para ver otros resultados.</p>
              <button className="primary-btn" type="button" onClick={openNewDeck}>
                <Plus size={18} />
                Nuevo mazo
              </button>
            </div>
          )}
        </section>
      )}

      <section className="quiz-placeholder">
        <div>
          <p className="eyebrow">Fase 2</p>
          <h2>Quizzes rapidos proximamente</h2>
          <p>La estructura queda preparada para evaluaciones cortas de 5 a 10 preguntas por tema o mazo.</p>
        </div>
        <span>Manual / IA-ready</span>
      </section>
    </main>
  )
}

export default FlashcardsPage
