import { UNASSIGNED_SUBJECT } from '../data/subjects'

export const MIN_GLOBAL_COMPARISON_USERS = 1

const roundPercentage = (value) => Number((Number(value || 0)).toFixed(1))

export const formatPercentage = (value) => {
  const rounded = roundPercentage(value)
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

export const normalizeSubjectName = (subject) => {
  const value = typeof subject === 'object' ? subject?.name : subject
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-')
    .toLowerCase()
}

const getSubjectKey = ({ id, slug, name }) => {
  if (id) return `id:${id}`
  if (slug) return `slug:${slug}`
  const normalized = normalizeSubjectName(name)
  return normalized ? `slug:${normalized}` : `slug:${UNASSIGNED_SUBJECT.slug}`
}

const getQuestionSubject = (question) => {
  const subjectId = question?.subjectId ?? question?.courseId ?? question?.course_id ?? null
  const subjectName = question?.subjectName ?? question?.courseName ?? question?.subject?.name ?? UNASSIGNED_SUBJECT.name
  const subjectSlug = question?.subjectSlug ?? question?.courseSlug ?? question?.subject?.slug ?? normalizeSubjectName(subjectName)

  return {
    id: subjectId,
    name: subjectName || UNASSIGNED_SUBJECT.name,
    slug: subjectSlug || UNASSIGNED_SUBJECT.slug,
    sortOrder: question?.subjectSortOrder ?? 9999,
  }
}

export const getSubjectPerformanceStatus = (percentage) => {
  if (percentage < 40) {
    return { key: 'critical', label: 'Crítico', tone: 'red' }
  }

  if (percentage < 60) {
    return { key: 'regular', label: 'Regular', tone: 'amber' }
  }

  if (percentage < 80) {
    return { key: 'good', label: 'Bien', tone: 'cyan' }
  }

  return { key: 'excellent', label: 'Excelente', tone: 'green' }
}

export const getSubjectPriority = (percentage, globalAverage = null) => {
  const diff = typeof globalAverage === 'number' ? percentage - globalAverage : 0

  if (percentage < 40 || diff <= -20) {
    return { key: 'max', label: 'Prioridad máxima' }
  }

  if (percentage < 60 || diff <= -10) {
    return { key: 'soon', label: 'Reforzar pronto' }
  }

  if (percentage < 80) {
    return { key: 'practice', label: 'Mantener práctica' }
  }

  return { key: 'mastery', label: 'Buen dominio' }
}

export const calculateSubjectStats = (answers, questions) => {
  const groups = new Map()

  ;(questions ?? []).forEach((question) => {
    const subject = getQuestionSubject(question)
    const subjectKey = getSubjectKey(subject)
    const current = groups.get(subjectKey) ?? {
      subjectKey,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectSlug: subject.slug,
      sortOrder: subject.sortOrder,
      total: 0,
      correct: 0,
    }
    const selectedAnswer = answers?.[question.id]
    const isCorrect = selectedAnswer === question.correctOption

    current.total += 1
    current.correct += isCorrect ? 1 : 0
    groups.set(subjectKey, current)
  })

  return Array.from(groups.values())
    .map((group) => {
      const percentage = group.total ? roundPercentage((group.correct / group.total) * 100) : 0
      const status = getSubjectPerformanceStatus(percentage)
      const priority = getSubjectPriority(percentage)

      return {
        ...group,
        incorrect: group.total - group.correct,
        percentage,
        status,
        priority,
      }
    })
    .sort((a, b) => (
      a.sortOrder - b.sortOrder
      || a.subjectName.localeCompare(b.subjectName, 'es')
    ))
}

const buildGlobalLookup = (globalRows) => {
  const lookup = new Map()

  ;(globalRows ?? []).forEach((row) => {
    const idKey = row.subjectId ? `id:${row.subjectId}` : null
    const slugKey = row.subjectSlug ? `slug:${row.subjectSlug}` : null
    const nameKey = row.subjectName ? `slug:${normalizeSubjectName(row.subjectName)}` : null

    ;[idKey, slugKey, nameKey].filter(Boolean).forEach((key) => lookup.set(key, row))
  })

  return lookup
}

export const getComparisonMessage = (userPercentage, globalAverage, subjectName) => {
  if (typeof globalAverage !== 'number') {
    return 'Aun no hay suficientes intentos para comparar este curso.'
  }

  const difference = roundPercentage(userPercentage - globalAverage)

  if (userPercentage < 40 && difference < 0) {
    return `${subjectName} esta en zona critica. Priorizala en tu siguiente semana de estudio.`
  }

  if (difference >= 10) {
    return `Estas por encima del promedio en ${subjectName}.`
  }

  if (difference >= 0) {
    return `Estas ligeramente por encima del promedio en ${subjectName}.`
  }

  if (difference <= -20) {
    return `${subjectName} necesita prioridad alta frente al promedio global.`
  }

  return `${subjectName} esta por debajo del promedio; refuerzala pronto.`
}

export const buildSubjectComparisons = (subjectStats, globalRows) => {
  const lookup = buildGlobalLookup(globalRows)

  return (subjectStats ?? []).map((stat) => {
    const global = lookup.get(stat.subjectKey) ?? lookup.get(`slug:${stat.subjectSlug}`) ?? null
    const peerAverage = typeof global?.peerAverage === 'number' ? global.peerAverage : null
    const hasReliableGlobalAverage = Boolean(global && global.peerUserCount >= MIN_GLOBAL_COMPARISON_USERS && peerAverage !== null)
    const difference = hasReliableGlobalAverage ? roundPercentage(stat.percentage - peerAverage) : null
    const priority = getSubjectPriority(stat.percentage, hasReliableGlobalAverage ? peerAverage : null)

    return {
      ...stat,
      priority,
      peerAverage,
      globalAverage: typeof global?.globalAverage === 'number' ? global.globalAverage : null,
      peerUserCount: global?.peerUserCount ?? 0,
      globalUserCount: global?.globalUserCount ?? 0,
      userRank: global?.currentUserRank ?? null,
      participantCount: global?.participantCount ?? 0,
      hasReliableGlobalAverage,
      difference,
      message: getComparisonMessage(
        stat.percentage,
        hasReliableGlobalAverage ? peerAverage : null,
        stat.subjectName,
      ),
    }
  })
}

const sortByPriority = (a, b) => (
  a.percentage - b.percentage
  || (a.difference ?? 0) - (b.difference ?? 0)
  || a.subjectName.localeCompare(b.subjectName, 'es')
)

export const buildCourseDiagnosis = (subjectStats, comparisons = []) => {
  const comparisonByKey = new Map(comparisons.map((comparison) => [comparison.subjectKey, comparison]))
  const enrichedStats = (subjectStats ?? []).map((stat) => comparisonByKey.get(stat.subjectKey) ?? stat)
  const priorityMax = enrichedStats
    .filter((stat) => stat.priority?.key === 'max' || stat.status?.key === 'critical')
    .sort(sortByPriority)
  const reinforceSoon = enrichedStats
    .filter((stat) => stat.priority?.key === 'soon' || stat.status?.key === 'regular')
    .filter((stat) => !priorityMax.some((priority) => priority.subjectKey === stat.subjectKey))
    .sort(sortByPriority)
  const strong = enrichedStats
    .filter((stat) => stat.status?.key === 'excellent')
    .sort((a, b) => b.percentage - a.percentage)

  const topPriority = priorityMax[0] ?? reinforceSoon[0] ?? null
  const topDifference = topPriority?.difference
  const topReason = topPriority
    ? typeof topDifference === 'number' && topDifference < 0
      ? `Tu prioridad maxima deberia ser ${topPriority.subjectName}, porque estas ${formatPercentage(Math.abs(topDifference))} debajo del promedio global y tu acierto fue ${formatPercentage(topPriority.percentage)}.`
      : `Tu prioridad maxima deberia ser ${topPriority.subjectName}, porque tu acierto fue ${formatPercentage(topPriority.percentage)}.`
    : 'No hay cursos en zona critica. Mantén la practica distribuida para sostener el avance.'

  return {
    priorityMax,
    reinforceSoon,
    strong,
    topReason,
  }
}
