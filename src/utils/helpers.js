export const VALID_TOPIC_STATUSES = ['pendiente', 'en_progreso', 'completado', 'reforzar']
export const VALID_IMPORTANCE_VALUES = ['baja', 'media', 'alta']

const STATUS_ALIASES = {
  pendiente: 'pendiente',
  'sin empezar': 'pendiente',
  sin_empezar: 'pendiente',
  sinempezar: 'pendiente',
  progreso: 'en_progreso',
  'en progreso': 'en_progreso',
  en_progreso: 'en_progreso',
  enprogreso: 'en_progreso',
  completado: 'completado',
  completo: 'completado',
  completada: 'completado',
  terminado: 'completado',
  reforzar: 'reforzar',
  refuerzo: 'reforzar',
  repasar: 'reforzar',
}

const normalizeText = (value) => (
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
)

export const normalizeLookupKey = normalizeText

export const normalizeStatus = (status, fallback = 'pendiente') => {
  const compact = normalizeText(status)
  const withSpaces = compact.replace(/_/g, ' ')
  return STATUS_ALIASES[compact] ?? STATUS_ALIASES[withSpaces] ?? fallback
}

export const normalizeImportance = (importance, fallback = 'media') => {
  const normalized = normalizeText(importance)
  return VALID_IMPORTANCE_VALUES.includes(normalized) ? normalized : fallback
}

export const getStatusMeta = (status) => {
  const normalized = normalizeStatus(status)
  const meta = {
    pendiente: {
      key: 'pendiente',
      label: 'Pendiente',
      className: 'status-pendiente',
    },
    en_progreso: {
      key: 'en_progreso',
      label: 'En progreso',
      className: 'status-en-progreso',
    },
    completado: {
      key: 'completado',
      label: 'Completado',
      className: 'status-completado',
    },
    reforzar: {
      key: 'reforzar',
      label: 'Reforzar',
      className: 'status-reforzar',
    },
  }

  return meta[normalized] ?? meta.pendiente
}

export const getTopicStatus = (topic) => normalizeStatus(topic?.status ?? (topic?.done ? 'completado' : 'pendiente'))

export const getCourseStatus = (course) => {
  const topics = course?.topics ?? []
  if (!topics.length) return 'pendiente'
  if (topics.every((topic) => getTopicStatus(topic) === 'completado' || topic.done)) return 'completado'
  if (topics.some((topic) => getTopicStatus(topic) === 'reforzar')) return 'reforzar'
  if (topics.some((topic) => getTopicStatus(topic) === 'en_progreso' || topic.done)) return 'en_progreso'
  return 'pendiente'
}

const parseCsvLine = (line) => {
  const values = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

export const parseCsvTopics = (text) => {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())

  if (!lines.length) return []

  const headers = parseCsvLine(lines[0]).map((header) => normalizeText(header))

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line)
    return headers.reduce((row, header, headerIndex) => ({
      ...row,
      [header]: values[headerIndex] ?? '',
      rowNumber: index + 2,
    }), {})
  })
}

export const buildImportedTopicName = (topic, subtopic) => {
  const main = String(topic ?? '').trim()
  const child = String(subtopic ?? '').trim()
  return child ? `${main}: ${child}` : main
}

export const validateImportedTopicRows = (rows, courses, { createMissingCourses = false, skipDuplicates = true } = {}) => {
  const courseByName = new Map((courses ?? []).map((course) => [normalizeText(course.name), course]))
  const existingTopicKeys = new Set(
    (courses ?? []).flatMap((course) => (
      (course.topics ?? []).map((topic) => `${normalizeText(course.name)}::${normalizeText(topic.name)}`)
    )),
  )
  const seenTopicKeys = new Set()

  return rows.map((row) => {
    const courseName = String(row.curso ?? '').trim()
    const topicName = buildImportedTopicName(row.tema, row.subtema)
    const status = normalizeStatus(row.estado, 'pendiente')
    const importance = normalizeImportance(row.importancia, 'media')
    const courseKey = normalizeText(courseName)
    const topicKey = `${courseKey}::${normalizeText(topicName)}`
    const duplicate = existingTopicKeys.has(topicKey) || seenTopicKeys.has(topicKey)
    const warnings = []
    const errors = []

    if (!courseName) errors.push('Falta curso.')
    if (!topicName) errors.push('Falta tema.')
    if (courseName && !courseByName.has(courseKey) && !createMissingCourses) {
      errors.push('El curso no existe.')
    }
    if (duplicate) warnings.push('Tema duplicado en este curso.')

    seenTopicKeys.add(topicKey)

    return {
      rowNumber: row.rowNumber,
      courseName,
      topicName,
      subtopic: String(row.subtema ?? '').trim(),
      importance,
      status,
      notes: String(row.notas ?? '').trim(),
      duplicate,
      skipped: skipDuplicates && duplicate,
      errors,
      warnings,
    }
  })
}

export const TOPICS_CSV_TEMPLATE = `curso,tema,subtema,importancia,estado,notas
Matematica,Aritmetica,Porcentajes,alta,pendiente,Practicar problemas tipo examen
Matematica,Algebra,Factorizacion,alta,pendiente,Reforzar productos notables
Fisica,Cinematica,MRUV,alta,en progreso,Dominar graficas y formulas
`
