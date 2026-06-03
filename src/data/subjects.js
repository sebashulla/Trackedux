export const UNASSIGNED_SUBJECT = {
  id: null,
  name: 'Sin curso asignado',
  slug: 'sin-curso-asignado',
  area: null,
  sortOrder: 9999,
}

export const EXAM_SUBJECTS = [
  { name: 'Biología', slug: 'biologia', area: 'Ciencias', sortOrder: 10 },
  { name: 'Química', slug: 'quimica', area: 'Ciencias', sortOrder: 20 },
  { name: 'Física', slug: 'fisica', area: 'Ciencias', sortOrder: 30 },
  { name: 'Aritmética', slug: 'aritmetica', area: 'Matemática', sortOrder: 40 },
  { name: 'Álgebra', slug: 'algebra', area: 'Matemática', sortOrder: 50 },
  { name: 'Geometría', slug: 'geometria', area: 'Matemática', sortOrder: 60 },
  { name: 'Trigonometría', slug: 'trigonometria', area: 'Matemática', sortOrder: 70 },
  { name: 'Razonamiento Matemático', slug: 'razonamiento-matematico', area: 'Aptitud', sortOrder: 80 },
  { name: 'Razonamiento Verbal', slug: 'razonamiento-verbal', area: 'Aptitud', sortOrder: 90 },
  { name: 'Economía', slug: 'economia', area: 'Sociales', sortOrder: 100 },
  { name: 'Cívica', slug: 'civica', area: 'Sociales', sortOrder: 110 },
  { name: 'Literatura', slug: 'literatura', area: 'Letras', sortOrder: 120 },
  { name: 'Lenguaje', slug: 'lenguaje', area: 'Letras', sortOrder: 130 },
  { name: 'Geografía', slug: 'geografia', area: 'Sociales', sortOrder: 140 },
  { name: 'Historia del Perú', slug: 'historia-del-peru', area: 'Sociales', sortOrder: 150 },
  { name: 'Historia Universal', slug: 'historia-universal', area: 'Sociales', sortOrder: 160 },
  { name: 'Psicología', slug: 'psicologia', area: 'Humanidades', sortOrder: 170 },
  { name: 'Filosofía', slug: 'filosofia', area: 'Humanidades', sortOrder: 180 },
  { name: 'Inglés', slug: 'ingles', area: 'Idiomas', sortOrder: 190 },
  { name: 'Cálculo Introducción', slug: 'calculo-introduccion', area: 'Matemática', sortOrder: 200 },
]

export const EXAM_SUBJECTS_WITH_FALLBACK_IDS = EXAM_SUBJECTS.map((subject) => ({
  ...subject,
  id: subject.slug,
  isLocalFallback: true,
}))
