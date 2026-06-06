import { BookOpen, CalendarClock, Edit3, Eye, Lock, Play, Tags, Users } from 'lucide-react'
import CloneDeckButton from './CloneDeckButton'

const formatStudyDate = (value) => {
  if (!value) return 'Sin estudio'

  return new Date(value).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function DeckCard({
  deck,
  currentUserId,
  onStudy,
  onEdit,
  onClone,
  cloneLoading,
}) {
  const isOwner = deck.userId === currentUserId
  const canClone = deck.isPublic && !isOwner

  return (
    <article className="deck-card">
      <div className="deck-card-head">
        <span className="deck-icon"><BookOpen size={20} /></span>
        <span className={deck.isPublic ? 'deck-visibility public' : 'deck-visibility private'}>
          {deck.isPublic ? <Users size={14} /> : <Lock size={14} />}
          {deck.isPublic ? 'Publico' : 'Privado'}
        </span>
      </div>

      <div className="deck-card-copy">
        <h3>{deck.title}</h3>
        {deck.description && <p>{deck.description}</p>}
      </div>

      <div className="deck-meta-grid">
        <span>{deck.courseName || 'Curso manual'}</span>
        <span>{deck.topicName || 'Sin tema'}</span>
        <span>{deck.cardCount} tarjeta(s)</span>
        <span><CalendarClock size={14} /> {formatStudyDate(deck.lastStudyAt)}</span>
      </div>

      {!isOwner && (
        <div className="deck-author">
          <Eye size={14} />
          Autor: {deck.authorName}
        </div>
      )}

      {deck.tags?.length > 0 && (
        <div className="deck-tags">
          <Tags size={14} />
          {deck.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}

      <div className="deck-card-actions">
        <button className="primary-btn deck-action" type="button" onClick={() => onStudy(deck.id)} disabled={!deck.cardCount}>
          <Play size={17} />
          Estudiar
        </button>
        {isOwner && (
          <button className="secondary-btn deck-action" type="button" onClick={() => onEdit(deck.id)}>
            <Edit3 size={17} />
            Editar
          </button>
        )}
        {canClone && (
          <CloneDeckButton
            onClone={() => onClone(deck.id)}
            loading={cloneLoading}
            disabled={cloneLoading}
          />
        )}
      </div>
    </article>
  )
}

export default DeckCard
