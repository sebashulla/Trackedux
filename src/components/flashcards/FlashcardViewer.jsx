import { RotateCcw } from 'lucide-react'
import MarkdownMathRenderer from '../MarkdownMathRenderer'

function FlashcardViewer({ card, flipped, onFlip }) {
  return (
    <article className={flipped ? 'flashcard-viewer flipped' : 'flashcard-viewer'}>
      <div className="flashcard-face-label">{flipped ? 'Reverso' : 'Anverso'}</div>
      <div className="flashcard-content">
        <MarkdownMathRenderer content={flipped ? card.back : card.front} />
      </div>
      {flipped && card.note && (
        <div className="flashcard-note">
          <span>Nota</span>
          <MarkdownMathRenderer content={card.note} />
        </div>
      )}
      <button className="primary-btn flashcard-flip-btn" type="button" onClick={onFlip}>
        <RotateCcw size={18} />
        {flipped ? 'Ver anverso' : 'Voltear tarjeta'}
      </button>
    </article>
  )
}

export default FlashcardViewer
