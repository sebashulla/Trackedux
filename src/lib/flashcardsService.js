import { supabase } from './supabase'
import { buildDeckPayload, cloneDeckWithCards, normalizeCardDrafts } from '../utils/flashcards'

const normalizeDeck = (row) => {
  const sessions = row.flashcard_study_sessions ?? []
  const lastStudyAt = sessions
    .map((session) => session.studied_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? '',
    courseName: row.course_name ?? '',
    topicName: row.topic_name ?? '',
    isPublic: row.is_public ?? false,
    tags: row.tags ?? [],
    sourceDeckId: row.source_deck_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cardCount: row.flashcards?.length ?? row.cardCount ?? 0,
    lastStudyAt,
    authorName: row.profiles?.display_name ?? row.authorName ?? 'Estudiante',
  }
}

export const normalizeFlashcard = (row) => ({
  id: row.id,
  deckId: row.deck_id,
  front: row.front,
  back: row.back,
  note: row.note ?? '',
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const fetchFlashcardDecks = async () => {
  const { data, error } = await supabase
    .from('flashcard_decks')
    .select(`
      id,
      user_id,
      title,
      description,
      course_name,
      topic_name,
      is_public,
      tags,
      source_deck_id,
      created_at,
      updated_at,
      flashcards ( id ),
      flashcard_study_sessions ( studied_at )
    `)
    .order('updated_at', { ascending: false })

  if (error) throw error
  const rows = data ?? []
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]
  let authorById = new Map()

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)

    authorById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))
  }

  return rows.map((row) => normalizeDeck({
    ...row,
    authorName: authorById.get(row.user_id) ?? row.authorName,
  }))
}

export const fetchDeckWithCards = async (deckId) => {
  const [{ data: deck, error: deckError }, { data: cards, error: cardsError }] = await Promise.all([
    supabase
      .from('flashcard_decks')
      .select(`
        id,
        user_id,
        title,
        description,
        course_name,
        topic_name,
        is_public,
        tags,
        source_deck_id,
        created_at,
        updated_at
      `)
      .eq('id', deckId)
      .single(),
    supabase
      .from('flashcards')
      .select('id, deck_id, front, back, note, sort_order, created_at, updated_at')
      .eq('deck_id', deckId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (deckError) throw deckError
  if (cardsError) throw cardsError

  return {
    deck: normalizeDeck(deck),
    cards: (cards ?? []).map(normalizeFlashcard),
  }
}

export const saveDeckWithCards = async ({ deckId, form, cards, userId }) => {
  const deckPayload = buildDeckPayload({ form, userId })
  const normalizedCards = normalizeCardDrafts(cards)

  if (!deckPayload.title) throw new Error('El mazo necesita un titulo.')
  if (!normalizedCards.length) throw new Error('Agrega al menos una tarjeta con anverso y reverso.')

  const deckRequest = deckId
    ? supabase
      .from('flashcard_decks')
      .update(deckPayload)
      .eq('id', deckId)
      .select('id')
      .single()
    : supabase
      .from('flashcard_decks')
      .insert(deckPayload)
      .select('id')
      .single()

  const { data: deckRow, error: deckError } = await deckRequest
  if (deckError) throw deckError

  const targetDeckId = deckRow.id
  if (deckId) {
    const { error: deleteError } = await supabase.from('flashcards').delete().eq('deck_id', targetDeckId)
    if (deleteError) throw deleteError
  }

  const { error: cardError } = await supabase
    .from('flashcards')
    .insert(normalizedCards.map((card) => ({
      deck_id: targetDeckId,
      front: card.front,
      back: card.back,
      note: card.note,
      sort_order: card.sort_order,
    })))

  if (cardError) throw cardError
  return targetDeckId
}

export const deleteDeck = async (deckId) => {
  const { error } = await supabase.from('flashcard_decks').delete().eq('id', deckId)
  if (error) throw error
}

export const saveStudySession = async ({ deckId, userId, summary }) => {
  const { error } = await supabase.from('flashcard_study_sessions').insert({
    deck_id: deckId,
    user_id: userId,
    total_cards: summary.totalCards,
    difficult_count: summary.difficultCount,
    normal_count: summary.normalCount,
    easy_count: summary.easyCount,
    mastery_percentage: summary.masteryPercentage,
  })

  if (error) throw error
}

export const clonePublicDeck = async ({ deckId, userId }) => {
  const { deck, cards } = await fetchDeckWithCards(deckId)
  const payload = cloneDeckWithCards({ deck, cards, userId })

  const { data: createdDeck, error: deckError } = await supabase
    .from('flashcard_decks')
    .insert(payload.deck)
    .select('id')
    .single()

  if (deckError) throw deckError

  if (payload.cards.length) {
    const { error: cardsError } = await supabase
      .from('flashcards')
      .insert(payload.cards.map((card) => ({ ...card, deck_id: createdDeck.id })))

    if (cardsError) throw cardsError
  }

  return createdDeck.id
}
