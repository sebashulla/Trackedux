export const FLASHCARD_RATINGS = {
  difficult: 'dificil',
  normal: 'normal',
  easy: 'facil',
}

export const normalizeRating = (rating) => {
  const value = String(rating ?? '').trim().toLowerCase()

  if (['dificil', 'difícil', 'difficult', 'hard'].includes(value)) return FLASHCARD_RATINGS.difficult
  if (['facil', 'fácil', 'easy'].includes(value)) return FLASHCARD_RATINGS.easy
  return FLASHCARD_RATINGS.normal
}

export const calculateMasteryPercentage = ({ totalCards = 0, difficultCount = 0, normalCount = 0, easyCount = 0 }) => {
  const total = Number(totalCards) || Number(difficultCount) + Number(normalCount) + Number(easyCount)
  if (!total) return 0

  const points = (Number(easyCount) * 1) + (Number(normalCount) * 0.72)
  return Math.round((points / total) * 100)
}

export const reorderDifficultCards = (queue, card, rating) => {
  const normalizedRating = normalizeRating(rating)
  if (normalizedRating !== FLASHCARD_RATINGS.difficult) return queue

  return [...queue, { ...card, repeated: true }]
}

export const createEmptyFlashcardDraft = (sortOrder = 0) => ({
  front: '',
  back: '',
  note: '',
  sortOrder,
})

export const getTagsFromText = (value) => (
  String(value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
)

export const getTagsText = (tags) => (
  Array.isArray(tags) ? tags.join(', ') : ''
)

export const buildDeckPayload = ({ form, userId }) => ({
  user_id: userId,
  title: form.title.trim(),
  description: form.description?.trim() || null,
  course_name: form.courseName?.trim() || null,
  topic_name: form.topicName?.trim() || null,
  is_public: form.visibility === 'public',
  tags: getTagsFromText(form.tagsText),
})

export const normalizeCardDrafts = (cards) => (
  cards
    .map((card, index) => ({
      id: card.id,
      front: card.front.trim(),
      back: card.back.trim(),
      note: card.note?.trim() || null,
      sort_order: index,
    }))
    .filter((card) => card.front && card.back)
)

export const cloneDeckWithCards = ({ deck, cards, userId }) => ({
  deck: {
    user_id: userId,
    title: `${deck.title} (copia)`,
    description: deck.description || null,
    course_name: deck.courseName || null,
    topic_name: deck.topicName || null,
    is_public: false,
    tags: Array.isArray(deck.tags) ? deck.tags : [],
    source_deck_id: deck.id,
  },
  cards: cards.map((card, index) => ({
    front: card.front,
    back: card.back,
    note: card.note || null,
    sort_order: index,
  })),
})
