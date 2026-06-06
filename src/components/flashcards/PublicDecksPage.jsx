import { Search, Sparkles } from 'lucide-react'
import DeckCard from './DeckCard'

function PublicDecksPage({
  decks,
  currentUserId,
  query,
  setQuery,
  onStudy,
  onClone,
  cloneLoadingId,
}) {
  return (
    <section className="public-decks-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Mazos publicos</p>
          <h2>Biblioteca compartida</h2>
        </div>
        <div className="course-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar publicos" />
        </div>
      </div>

      {decks.length ? (
        <div className="deck-grid">
          {decks.map((deck) => (
            <DeckCard
              deck={deck}
              currentUserId={currentUserId}
              onStudy={onStudy}
              onEdit={() => {}}
              onClone={onClone}
              cloneLoading={cloneLoadingId === deck.id}
              key={deck.id}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state small">
          <Sparkles size={28} />
          <h2>No hay mazos publicos visibles</h2>
          <p>Cuando otro estudiante comparta un mazo, aparecera aqui para estudiarlo o clonarlo.</p>
        </div>
      )}
    </section>
  )
}

export default PublicDecksPage
