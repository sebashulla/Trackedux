import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  BriefcaseBusiness,
  Bug,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  ExternalLink,
  FileDown,
  FileText,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import TemplateSelector from './components/TemplateSelector'
import StatusBadge from './components/StatusBadge'
import SubjectSelect from './components/SubjectSelect'
import GlobalComparisonCard from './components/GlobalComparisonCard'
import CourseDiagnosis from './components/CourseDiagnosis'
import FlashcardsPage from './pages/FlashcardsPage'
import { EXAM_TEMPLATES, OFFICIAL_TEMPLATE_STRUCTURE_NOTE, TOPIC_STATUS_OPTIONS, getExamTemplateByCode, getTemplateFormDefaults } from './data/examTemplates'
import { EXAM_SUBJECTS_WITH_FALLBACK_IDS, UNASSIGNED_SUBJECT } from './data/subjects'
import { createPreparationFromTemplate } from './lib/templateService'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  buildCourseDiagnosis,
  buildSubjectComparisons,
  calculateSubjectStats,
  formatPercentage,
} from './utils/analytics'
import {
  TOPICS_CSV_TEMPLATE,
  getCourseStatus,
  getTopicStatus,
  normalizeLookupKey,
  normalizeStatus,
  parseCsvTopics,
  validateImportedTopicRows,
} from './utils/helpers'
import heroArt from './assets/hero.png'
import logoArt from '../logo.png'
import './App.css'

const todayISO = () => new Date().toISOString().slice(0, 10)

const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max)

const shiftDateKey = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const getCompletedDateKey = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const daysUntil = (targetDate) => {
  if (!targetDate) return 0
  const now = new Date()
  const target = new Date(`${targetDate}T23:59:59`)
  const diff = target.getTime() - now.getTime()

  return Math.max(0, Math.ceil(diff / 86400000))
}

const weeksUntil = (targetDate) => Math.max(0, Math.ceil(daysUntil(targetDate) / 7))

const formatDate = (targetDate) => {
  if (!targetDate) return 'Sin fecha'
  return new Date(`${targetDate}T00:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatDuration = (totalSeconds) => {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formatElapsedDuration = (totalSeconds) => {
  if (totalSeconds == null) return 'Sin tiempo'

  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) return `${hours} h ${minutes} min`
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`
  return `${seconds} s`
}

const getDisplayName = (session, profile) => {
  if (profile?.display_name) return profile.display_name
  if (session?.user?.user_metadata?.display_name) return session.user.user_metadata.display_name
  return session?.user?.email?.split('@')[0] ?? 'Estudiante'
}

const collectStats = (exam) => {
  const topics = exam?.courses.flatMap((course) => course.topics) ?? []
  const learned = topics.filter(isCompletedTopic).length
  const total = topics.length

  return {
    learned,
    total,
    pending: Math.max(total - learned, 0),
    percent: total ? Math.round((learned / total) * 100) : 0,
  }
}

const getCourseStats = (course) => {
  const total = course.topics.length
  const learned = course.topics.filter(isCompletedTopic).length

  return {
    total,
    learned,
    pending: Math.max(total - learned, 0),
    percent: total ? Math.round((learned / total) * 100) : 0,
  }
}

const getActivityDays = (topics) => (
  [...new Set(
    topics
      .filter((topic) => isCompletedTopic(topic) && topic.completedAt)
      .map((topic) => getCompletedDateKey(topic.completedAt))
      .filter(Boolean),
  )].sort()
)

const getStreakStats = (activityDays) => {
  if (!activityDays.length) {
    return { current: 0, longest: 0, lastActiveDay: null, nextMilestone: 10 }
  }

  const daySet = new Set(activityDays)
  const today = todayISO()
  const yesterday = shiftDateKey(today, -1)
  const lastActiveDay = activityDays.at(-1)
  let current = 0

  if (lastActiveDay === today || lastActiveDay === yesterday) {
    let cursor = lastActiveDay
    while (daySet.has(cursor)) {
      current += 1
      cursor = shiftDateKey(cursor, -1)
    }
  }

  let longest = 0
  let run = 0
  let previousDay = null

  activityDays.forEach((day) => {
    run = previousDay && shiftDateKey(previousDay, 1) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    previousDay = day
  })

  const nextMilestone = Math.max(10, (Math.floor(current / 10) + 1) * 10)

  return { current, longest, lastActiveDay, nextMilestone }
}

const collectUserStats = (exams) => {
  const courses = exams.flatMap((exam) => exam.courses.map((course) => ({ ...course, examName: exam.name })))
  const topics = courses.flatMap((course) => course.topics)
  const learnedTopics = topics.filter(isCompletedTopic)
  const totalTopics = topics.length
  const activityDays = getActivityDays(topics)
  const today = todayISO()
  const weekStart = shiftDateKey(today, -6)
  const topicsThisWeek = learnedTopics.filter((topic) => {
    const key = getCompletedDateKey(topic.completedAt)
    return key && key >= weekStart && key <= today
  }).length
  const courseProgress = courses.map((course) => {
    const stats = getCourseStats(course)
    return { id: course.id, name: course.name, examName: course.examName, ...stats }
  })
  const finishedCourses = courseProgress.filter((course) => course.total > 0 && course.percent === 100).length
  const bestCourse = courseProgress
    .filter((course) => course.total > 0)
    .sort((a, b) => b.percent - a.percent || b.learned - a.learned)[0] ?? null

  return {
    totalCourses: courses.length,
    finishedCourses,
    totalTopics,
    learnedTopics: learnedTopics.length,
    globalPercent: totalTopics ? Math.round((learnedTopics.length / totalTopics) * 100) : 0,
    activeDays: activityDays.length,
    activityDays,
    topicsThisWeek,
    streak: getStreakStats(activityDays),
    bestCourse,
    courseProgress,
  }
}

const getFlamePalette = (percent) => {
  const safePercent = clamp(percent)
  if (safePercent >= 85) return { start: '#ffd166', mid: '#ff7a59', end: '#bf47ff' }
  if (safePercent >= 60) return { start: '#22e7c3', mid: '#6cc6de', end: '#ffd166' }
  if (safePercent >= 30) return { start: '#3288ff', mid: '#22e7c3', end: '#6cc6de' }
  return { start: '#6cc6de', mid: '#3288ff', end: '#bf47ff' }
}

const getMotivationMessage = (streak) => {
  const messages = [
    'Diez dias cuentan: tu constancia ya esta dejando huella.',
    'Tu ritmo esta vivo. Sigue sumando dias y el plan se vuelve mas ligero.',
    'Otra decena completa. Estas entrenando foco, no solo temas.',
    'La racha se esta poniendo seria. Un dia mas, una ventaja mas.',
  ]

  return messages[Math.floor(streak / 10 - 1) % messages.length]
}

const mapLeaderboardRow = (row) => ({
  id: row.user_id ?? row.id,
  displayName: row.display_name ?? row.displayName ?? 'Estudiante',
  currentStreak: row.current_streak ?? row.currentStreak ?? 0,
  longestStreak: row.longest_streak ?? row.longestStreak ?? 0,
  completedTopics: row.completed_topics ?? row.completedTopics ?? 0,
  activeDays: row.active_days ?? row.activeDays ?? 0,
})

const buildLeaderboard = (remoteRows, userStats, displayName, userId) => {
  const ownEntry = {
    id: userId,
    displayName,
    currentStreak: userStats.streak.current,
    longestStreak: userStats.streak.longest,
    completedTopics: userStats.learnedTopics,
    activeDays: userStats.activeDays,
  }
  const rows = remoteRows.map(mapLeaderboardRow)
  const hasOwnEntry = rows.some((row) => row.id === userId)
  const mergedRows = hasOwnEntry ? rows : [ownEntry, ...rows]

  return mergedRows.sort((a, b) => (
    b.currentStreak - a.currentStreak
    || b.longestStreak - a.longestStreak
    || b.completedTopics - a.completedTopics
    || a.displayName.localeCompare(b.displayName)
  ))
}

const getUrgency = (course, examDate) => {
  const { pending } = getCourseStats(course)
  const pressure = pending - weeksUntil(examDate)

  if (pressure < 0) {
    return { label: 'Ritmo tranquilo', tone: 'green', detail: `${Math.abs(pressure)} semana(s) de margen` }
  }
  if (pressure === 0) {
    return { label: 'Ritmo exacto', tone: 'gray', detail: 'Vas justo a tiempo' }
  }
  if (pressure <= 2) {
    return { label: 'Sube el ritmo', tone: 'yellow', detail: `${pressure} tema(s) sobre el plan` }
  }

  return { label: 'Prioridad alta', tone: 'red', detail: `${pressure} tema(s) por recuperar` }
}

const normalizeError = (error) => error?.message ?? 'Ocurrio un error inesperado.'

const isMissingColumnError = (error) => (
  error?.code === '42703'
  || error?.code === 'PGRST204'
  || /column|schema cache/i.test(error?.message ?? '')
)

const isCompletedTopic = (topic) => getTopicStatus(topic) === 'completado' || topic.done

const TOPIC_GROUPS = [
  { key: 'pendiente', title: 'Pendientes' },
  { key: 'en_progreso', title: 'En progreso' },
  { key: 'reforzar', title: 'Para reforzar' },
  { key: 'completado', title: 'Completados' },
]

const getTopicGroupCollapseKey = (courseId, groupKey) => `${courseId}-${groupKey}`

const getTemplateForExam = (exam) => {
  if (!exam) return null
  return (
    getExamTemplateByCode(exam.templateCode)
    ?? EXAM_TEMPLATES.find((template) => exam.name?.toUpperCase().includes(template.shortName ?? template.slug?.toUpperCase()))
    ?? null
  )
}

const getTemplateNotice = (exam, template) => {
  if (!template) return null
  const sourceNote = exam?.sourceNote ?? template.sourceNote
  if (!sourceNote) return OFFICIAL_TEMPLATE_STRUCTURE_NOTE
  if (sourceNote.includes(OFFICIAL_TEMPLATE_STRUCTURE_NOTE)) return sourceNote
  return `${sourceNote} ${OFFICIAL_TEMPLATE_STRUCTURE_NOTE}`
}

const isTemplatePreparation = (exam, template) => (
  exam?.templateCode === template.code
  || exam?.name?.toUpperCase().includes(template.shortName ?? template.slug?.toUpperCase())
)

const CONTACT_LINKS = {
  instagram: 'https://www.instagram.com/sebasshulla/',
  github: 'https://github.com/sebashulla',
  primaryEmail: 'sebastian.17shulla@gmail.com',
  secondaryEmail: 'sebas8shulla@outlook.es',
}

const SIMULATION_ADMIN_USER_IDS = new Set([
  '66ec7f4b-ee05-42b4-81a6-482f044f6ea1',
  '244726d8-4d30-49de-8aa9-5996244e460b',
])
const ANSWER_OPTIONS = ['A', 'B', 'C', 'D', 'E']

const isSimulationAdminUser = (userId) => SIMULATION_ADMIN_USER_IDS.has(userId)

const createDraftId = () => (
  window.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
)

const createEmptyQuestion = (position = 0) => ({
  id: createDraftId(),
  prompt: '',
  imageUrl: '',
  subjectId: '',
  subjectName: '',
  subjectSlug: '',
  options: Object.fromEntries(ANSWER_OPTIONS.map((option) => [option, ''])),
  correctOption: 'A',
  position,
})

const createEmptySimulationDraft = () => ({
  id: null,
  title: '',
  description: '',
  imageUrl: '',
  scoreMax: 20,
  durationMinutes: 60,
  gradingWeights: {},
  isPublished: true,
  questions: [createEmptyQuestion()],
})

const normalizeExamSubjectRow = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  area: row.area ?? null,
  sortOrder: row.sort_order ?? row.sortOrder ?? 0,
  isActive: row.is_active ?? row.isActive ?? true,
})

const normalizeQuestionSubject = (question) => {
  const subject = question.course ?? question.exam_subjects ?? question.subject ?? null

  if (!question.course_id && !subject?.id) {
    return {
      subjectId: '',
      subjectName: UNASSIGNED_SUBJECT.name,
      subjectSlug: UNASSIGNED_SUBJECT.slug,
      subjectSortOrder: UNASSIGNED_SUBJECT.sortOrder,
    }
  }

  return {
    subjectId: question.course_id ?? subject?.id ?? '',
    subjectName: subject?.name ?? UNASSIGNED_SUBJECT.name,
    subjectSlug: subject?.slug ?? UNASSIGNED_SUBJECT.slug,
    subjectSortOrder: subject?.sort_order ?? subject?.sortOrder ?? 9999,
  }
}

const normalizeGradingWeights = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return Object.fromEntries(
    Object.entries(source)
      .map(([subjectId, bonus]) => [subjectId, Number(bonus)])
      .filter(([subjectId, bonus]) => subjectId && Number.isFinite(bonus) && bonus > 0),
  )
}

const normalizeSimulationRow = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description ?? '',
  imageUrl: row.image_url ?? '',
  scoreMax: Number(row.score_max ?? 20),
  durationMinutes: Number(row.duration_minutes ?? 60),
  gradingWeights: normalizeGradingWeights(row.grading_weights),
  isPublished: row.is_published ?? true,
  createdBy: row.created_by,
  createdAt: row.created_at,
  questions: (row.simulation_questions ?? [])
    .map((question) => ({
      id: question.id,
      prompt: question.prompt,
      imageUrl: question.image_url ?? '',
      ...normalizeQuestionSubject(question),
      correctOption: question.correct_option ?? 'A',
      position: question.position ?? 0,
      options: {
        A: question.option_a ?? '',
        B: question.option_b ?? '',
        C: question.option_c ?? '',
        D: question.option_d ?? '',
        E: question.option_e ?? '',
      },
    }))
    .sort((a, b) => a.position - b.position),
})

const simulationToDraft = (simulation) => ({
  id: simulation.id,
  title: simulation.title,
  description: simulation.description,
  imageUrl: simulation.imageUrl,
  scoreMax: simulation.scoreMax,
  durationMinutes: simulation.durationMinutes,
  gradingWeights: normalizeGradingWeights(simulation.gradingWeights),
  isPublished: simulation.isPublished,
  questions: simulation.questions.length
    ? simulation.questions.map((question, index) => ({ ...question, position: index }))
    : [createEmptyQuestion()],
})

const calculateQuestionPointValues = (simulation) => {
  const questionCount = simulation.questions.length
  const scoreMax = Number(simulation.scoreMax ?? 20)
  if (!questionCount) return { pointByQuestionId: {}, subjectPointSummary: [], basePoint: 0 }

  const basePoint = scoreMax / questionCount
  const gradingWeights = normalizeGradingWeights(simulation.gradingWeights)
  const hasWeights = Object.keys(gradingWeights).length > 0

  if (!hasWeights) {
    return {
      pointByQuestionId: Object.fromEntries(simulation.questions.map((question) => [question.id, basePoint])),
      subjectPointSummary: [],
      basePoint,
    }
  }

  const boostedQuestions = simulation.questions.filter((question) => Number(gradingWeights[question.subjectId] ?? 0) > 0)
  const boostedTotal = boostedQuestions.reduce((sum, question) => (
    sum + basePoint + Number(gradingWeights[question.subjectId] ?? 0)
  ), 0)
  const remainingQuestions = simulation.questions.length - boostedQuestions.length
  const canAdjustRemaining = remainingQuestions > 0 && boostedTotal < scoreMax
  const fallbackDesiredTotal = simulation.questions.reduce((sum, question) => (
    sum + basePoint + Number(gradingWeights[question.subjectId] ?? 0)
  ), 0)
  const fallbackFactor = fallbackDesiredTotal ? scoreMax / fallbackDesiredTotal : 1
  const remainingPoint = canAdjustRemaining ? (scoreMax - boostedTotal) / remainingQuestions : basePoint * fallbackFactor

  const pointByQuestionId = Object.fromEntries(simulation.questions.map((question) => {
    const bonus = Number(gradingWeights[question.subjectId] ?? 0)
    const rawPoint = bonus > 0 ? basePoint + bonus : remainingPoint
    const point = canAdjustRemaining ? rawPoint : rawPoint * (bonus > 0 ? fallbackFactor : 1)
    return [question.id, Math.max(0, point)]
  }))
  const subjectGroups = simulation.questions.reduce((groups, question) => {
    const key = question.subjectId || question.subjectName || UNASSIGNED_SUBJECT.name
    const current = groups.get(key) ?? {
      subjectId: question.subjectId,
      subjectName: question.subjectName || UNASSIGNED_SUBJECT.name,
      questionCount: 0,
      totalPoints: 0,
      pointPerQuestion: 0,
      bonus: Number(gradingWeights[question.subjectId] ?? 0),
    }

    current.questionCount += 1
    current.totalPoints += pointByQuestionId[question.id] ?? 0
    current.pointPerQuestion = current.questionCount ? current.totalPoints / current.questionCount : 0
    groups.set(key, current)
    return groups
  }, new Map())

  return {
    pointByQuestionId,
    subjectPointSummary: Array.from(subjectGroups.values())
      .sort((a, b) => b.totalPoints - a.totalPoints || a.subjectName.localeCompare(b.subjectName, 'es')),
    basePoint,
  }
}

const calculateSimulationResult = (simulation, answers) => {
  const questionCount = simulation.questions.length
  const correctCount = simulation.questions.filter((question) => answers[question.id] === question.correctOption).length
  const { pointByQuestionId, subjectPointSummary } = calculateQuestionPointValues(simulation)
  const weightedScore = simulation.questions.reduce((sum, question) => (
    answers[question.id] === question.correctOption
      ? sum + Number(pointByQuestionId[question.id] ?? 0)
      : sum
  ), 0)
  const score = questionCount ? Number(Math.min(Number(simulation.scoreMax ?? 20), weightedScore).toFixed(2)) : 0
  const subjectStats = calculateSubjectStats(answers, simulation.questions)

  return { correctCount, questionCount, score, subjectStats, subjectPointSummary }
}

const getSimulationScoreFeedback = (score, scoreMax) => {
  const percentage = scoreMax ? (score / scoreMax) * 100 : 0

  if (percentage >= 85) {
    return {
      tone: 'excellent',
      eyebrow: 'Resultado destacado',
      title: 'Excelente dominio del simulacro',
      message: 'Tu rendimiento fue alto. Ahora revisemos en que cursos conviene sostener el ritmo y donde puedes ganar puntos finos.',
    }
  }

  if (percentage >= 65) {
    return {
      tone: 'good',
      eyebrow: 'Buen avance',
      title: 'Vas por buen camino',
      message: 'Tu base esta respondiendo bien. El diagnostico separara cursos fuertes y cursos que aun pueden subir.',
    }
  }

  if (percentage >= 40) {
    return {
      tone: 'regular',
      eyebrow: 'Zona de mejora',
      title: 'Hay oportunidades claras para subir',
      message: 'El resultado muestra una ruta de refuerzo. Vamos a ordenar tus cursos por prioridad para estudiar con mas precision.',
    }
  }

  return {
    tone: 'critical',
    eyebrow: 'Diagnostico critico',
    title: 'Este intento necesita refuerzo dirigido',
    message: 'No es un cierre, es informacion util. Vamos a detectar los cursos mas debiles y compararlos con tus intentos anteriores.',
  }
}

const normalizeSimulationAttempt = (row) => ({
  id: row.id,
  simulationId: row.simulation_id,
  answers: row.answers ?? {},
  score: Number(row.score ?? 0),
  correctCount: row.correct_count ?? 0,
  questionCount: row.question_count ?? 0,
  durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
  completedAt: row.completed_at,
})

const normalizeSimulationSubjectAnalyticsRow = (row) => ({
  simulationId: row.simulation_id,
  subjectId: row.subject_id ?? '',
  subjectName: row.subject_name ?? UNASSIGNED_SUBJECT.name,
  subjectSlug: row.subject_slug ?? UNASSIGNED_SUBJECT.slug,
  questionCount: row.question_count ?? 0,
  globalAverage: row.global_average_percentage == null ? null : Number(row.global_average_percentage),
  globalUserCount: row.global_user_count ?? 0,
  peerAverage: row.peer_average_percentage == null ? null : Number(row.peer_average_percentage),
  peerUserCount: row.peer_user_count ?? 0,
  currentUserRank: row.current_user_rank ?? null,
  participantCount: row.participant_count ?? 0,
})

const normalizeSimulationRankingRow = (row) => {
  const firstAttemptScore = Number(row.first_attempt_score ?? row.best_score ?? 0)
  const firstAttemptCorrectCount = row.first_attempt_correct_count ?? row.best_correct_count ?? 0

  return {
    simulationId: row.simulation_id,
    userId: row.user_id,
    displayName: row.display_name ?? 'Estudiante',
    firstAttemptScore,
    firstAttemptCorrectCount,
    bestScore: firstAttemptScore,
    bestCorrectCount: firstAttemptCorrectCount,
    questionCount: row.question_count ?? 0,
    attemptCount: row.attempt_count ?? 0,
    lastCompletedAt: row.last_completed_at,
  }
}

const PUBLIC_NAV_LINKS = [
  { href: '/acerca-de', label: 'Acerca de' },
  { href: '/recursos', label: 'Recursos' },
  { href: '/contacto', label: 'Contacto' },
]

const PUBLIC_ROUTE_PATHS = new Set(['/acerca-de', '/contacto', '/privacidad', '/terminos', '/recursos'])

const getCurrentPath = () => {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path || '/'
}

const getPublicPath = () => {
  const path = getCurrentPath()
  return PUBLIC_ROUTE_PATHS.has(path) ? path : null
}

const getAuthRedirectUrl = () => {
  const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim()
  if (configuredRedirect) return configuredRedirect
  return window.location.origin
}

const getAuthErrorMessageFromUrl = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  const errorCode = hashParams.get('error_code') ?? searchParams.get('error_code')
  const description = hashParams.get('error_description') ?? searchParams.get('error_description')

  if (!errorCode && !description) return null
  if (errorCode === 'otp_expired') {
    return 'El enlace de confirmacion ya fue usado o expiro. Inicia sesion o solicita un correo nuevo.'
  }
  return description?.replace(/\+/g, ' ') ?? 'No se pudo completar la confirmacion del correo.'
}

function App() {
  const initialTemplateForms = () => Object.fromEntries(
    EXAM_TEMPLATES.map((template) => [template.code, getTemplateFormDefaults(template)]),
  )
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bootLoading, setBootLoading] = useState(isSupabaseConfigured)
  const [dataLoading, setDataLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [toast, setToast] = useState(null)
  const [view, setView] = useState('home')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ displayName: '', email: '', password: '' })
  const [exams, setExams] = useState([])
  const [activeExamId, setActiveExamId] = useState(null)
  const [examForm, setExamForm] = useState({ name: '', targetDate: '' })
  const [creationMode, setCreationMode] = useState('custom')
  const [templateForms, setTemplateForms] = useState(initialTemplateForms)
  const [courseName, setCourseName] = useState('')
  const [topicInputs, setTopicInputs] = useState({})
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [simulationNavigationLocked, setSimulationNavigationLocked] = useState(false)
  const [editExamForm, setEditExamForm] = useState({ name: '', targetDate: '' })
  const [simulations, setSimulations] = useState([])
  const [simulationsLoading, setSimulationsLoading] = useState(false)
  const [simulationsError, setSimulationsError] = useState('')
  const [examSubjects, setExamSubjects] = useState(EXAM_SUBJECTS_WITH_FALLBACK_IDS)
  const [examSubjectsReady, setExamSubjectsReady] = useState(false)
  const [examSubjectsLoading, setExamSubjectsLoading] = useState(false)
  const [simulationSubjectSchemaReady, setSimulationSubjectSchemaReady] = useState(true)
  const [simulationDurationSchemaReady, setSimulationDurationSchemaReady] = useState(true)
  const [simulationGradingSchemaReady, setSimulationGradingSchemaReady] = useState(true)
  const [activeSimulationId, setActiveSimulationId] = useState(null)
  const [simulationDraft, setSimulationDraft] = useState(createEmptySimulationDraft)
  const [simulationAnswers, setSimulationAnswers] = useState({})
  const [simulationResults, setSimulationResults] = useState({})
  const [simulationAttempts, setSimulationAttempts] = useState([])
  const [simulationRankings, setSimulationRankings] = useState([])
  const [simulationSubjectAnalytics, setSimulationSubjectAnalytics] = useState({})
  const [simulationSubjectAnalyticsLoading, setSimulationSubjectAnalyticsLoading] = useState({})
  const [simulationSubjectAnalyticsErrors, setSimulationSubjectAnalyticsErrors] = useState({})
  const [simulationRankingLoading, setSimulationRankingLoading] = useState(false)
  const [simulationRankingError, setSimulationRankingError] = useState('')
  const [activeRankingSimulationId, setActiveRankingSimulationId] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4200)
  }, [])

  const fetchWorkspace = useCallback(
    async ({ nextActiveId } = {}) => {
      if (!session?.user?.id || !supabase) return

      setDataLoading(true)
      try {
        const userId = session.user.id
        const profileRequest = supabase.from('profiles').select('id, display_name').eq('id', userId).maybeSingle()
        const examRequest = supabase
          .from('exams')
          .select('id, name, target_date, template_code, template_version, academic_area, target_career, current_level, source_note, created_at')
          .order('created_at', { ascending: true })

        let [
          { data: profileRow, error: profileError },
          { data: examRows, error: examError },
        ] = await Promise.all([
          profileRequest,
          examRequest,
        ])

        if (profileError) throw profileError

        if (examError && isMissingColumnError(examError)) {
          const fallback = await supabase
            .from('exams')
            .select('id, name, target_date, created_at')
            .order('created_at', { ascending: true })
          examRows = fallback.data
          examError = fallback.error
        }

        if (examError) throw examError

        if (!profileRow) {
          const fallbackName = session.user.user_metadata?.display_name ?? session.user.email?.split('@')[0] ?? 'Estudiante'
          const { data: createdProfile, error: upsertError } = await supabase
            .from('profiles')
            .upsert({ id: userId, display_name: fallbackName }, { onConflict: 'id' })
            .select('id, display_name')
            .single()

          if (upsertError) throw upsertError
          setProfile(createdProfile)
        } else {
          setProfile(profileRow)
        }

        const examIds = (examRows ?? []).map((exam) => exam.id)
        let courseRows = []
        let topicRows = []

        if (examIds.length) {
          const { data, error } = await supabase
            .from('courses')
            .select('id, exam_id, name, position, created_at')
            .in('exam_id', examIds)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })

          if (error) throw error
          courseRows = data ?? []
        }

        const courseIds = courseRows.map((course) => course.id)

        if (courseIds.length) {
          let { data, error } = await supabase
            .from('topics')
            .select('id, course_id, name, done, status, position, created_at, completed_at')
            .in('course_id', courseIds)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })

          if (error && isMissingColumnError(error)) {
            const fallback = await supabase
              .from('topics')
              .select('id, course_id, name, done, position, created_at, completed_at')
              .in('course_id', courseIds)
              .order('position', { ascending: true })
              .order('created_at', { ascending: true })
            data = fallback.data
            error = fallback.error
          }

          if (error) throw error
          topicRows = data ?? []
        }

        const topicsByCourse = topicRows.reduce((acc, topic) => {
          acc[topic.course_id] = acc[topic.course_id] ?? []
          acc[topic.course_id].push({
            id: topic.id,
            name: topic.name,
            done: topic.done,
            status: normalizeStatus(topic.status ?? (topic.done ? 'completado' : 'pendiente')),
            position: topic.position,
            completedAt: topic.completed_at,
          })
          return acc
        }, {})

        const coursesByExam = courseRows.reduce((acc, course) => {
          acc[course.exam_id] = acc[course.exam_id] ?? []
          acc[course.exam_id].push({
            id: course.id,
            name: course.name,
            position: course.position,
            topics: topicsByCourse[course.id] ?? [],
          })
          return acc
        }, {})

        const mappedExams = (examRows ?? []).map((exam) => ({
          id: exam.id,
          name: exam.name,
          targetDate: exam.target_date,
          templateCode: exam.template_code,
          templateVersion: exam.template_version,
          academicArea: exam.academic_area,
          targetCareer: exam.target_career,
          currentLevel: exam.current_level,
          sourceNote: exam.source_note,
          courses: coursesByExam[exam.id] ?? [],
        }))

        setExams(mappedExams)
        setActiveExamId((current) => {
          if (nextActiveId && mappedExams.some((exam) => exam.id === nextActiveId)) return nextActiveId
          if (current && mappedExams.some((exam) => exam.id === current)) return current
          return mappedExams[0]?.id ?? null
        })

        return mappedExams
      } catch (error) {
        showToast(normalizeError(error), 'error')
        return undefined
      } finally {
        setDataLoading(false)
      }
    },
    [session, showToast],
  )

  const fetchLeaderboard = useCallback(async () => {
    if (!session?.user?.id || !supabase) return

    setLeaderboardLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_global_streaks')
      if (error) throw error
      setLeaderboard(data ?? [])
    } catch {
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }, [session])

  const fetchExamSubjects = useCallback(async () => {
    if (!session?.user?.id || !supabase) return

    setExamSubjectsLoading(true)
    try {
      const { data, error } = await supabase
        .from('exam_subjects')
        .select('id, name, slug, area, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw error

      const mappedSubjects = (data ?? []).map(normalizeExamSubjectRow)
      setExamSubjects(mappedSubjects.length ? mappedSubjects : EXAM_SUBJECTS_WITH_FALLBACK_IDS)
      setExamSubjectsReady(Boolean(mappedSubjects.length))
    } catch {
      setExamSubjects(EXAM_SUBJECTS_WITH_FALLBACK_IDS)
      setExamSubjectsReady(false)
    } finally {
      setExamSubjectsLoading(false)
    }
  }, [session?.user?.id])

  const fetchSimulations = useCallback(async () => {
    if (!session?.user?.id || !supabase) return

    setSimulationsLoading(true)
    setSimulationsError('')
    try {
      const baseSimulationSelect = `
          id,
          title,
          description,
          image_url,
          score_max,
          is_published,
          created_by,
          created_at,
          simulation_questions (
            id,
            prompt,
            image_url,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_option,
            position
          )
        `
      const subjectSimulationSelect = `
          id,
          title,
          description,
          image_url,
          score_max,
          is_published,
          created_by,
          created_at,
          simulation_questions (
            id,
            prompt,
            image_url,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_option,
            position,
            course_id,
            course:exam_subjects (
              id,
              name,
              slug,
              sort_order
            )
          )
        `
      const subjectAndDurationSimulationSelect = `
          id,
          title,
          description,
          image_url,
          score_max,
          duration_minutes,
          is_published,
          created_by,
          created_at,
          simulation_questions (
            id,
            prompt,
            image_url,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_option,
            position,
            course_id,
            course:exam_subjects (
              id,
              name,
              slug,
              sort_order
            )
          )
        `
      const fullSimulationSelect = `
          id,
          title,
          description,
          image_url,
          score_max,
          duration_minutes,
          grading_weights,
          is_published,
          created_by,
          created_at,
          simulation_questions (
            id,
            prompt,
            image_url,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_option,
            position,
            course_id,
            course:exam_subjects (
              id,
              name,
              slug,
              sort_order
            )
          )
        `

      let response = await supabase
        .from('simulations')
        .select(fullSimulationSelect)
        .order('created_at', { ascending: false })

      if (
        response.error
        && (
          response.error?.code === '42703'
          || /grading_weights/i.test(response.error?.message ?? '')
        )
      ) {
        setSimulationGradingSchemaReady(false)
        response = await supabase
          .from('simulations')
          .select(subjectAndDurationSimulationSelect)
          .order('created_at', { ascending: false })
      } else {
        setSimulationGradingSchemaReady(true)
      }

      if (
        response.error
        && (
          response.error?.code === '42703'
          || /duration_minutes/i.test(response.error?.message ?? '')
        )
      ) {
        setSimulationDurationSchemaReady(false)
        response = await supabase
          .from('simulations')
          .select(subjectSimulationSelect)
          .order('created_at', { ascending: false })
      } else {
        setSimulationDurationSchemaReady(true)
      }

      if (
        response.error
        && (
          isMissingColumnError(response.error)
          || /exam_subjects|course_id|relationship|relation/i.test(response.error?.message ?? '')
        )
      ) {
        setSimulationSubjectSchemaReady(false)
        setSimulationDurationSchemaReady(false)
        response = await supabase
          .from('simulations')
          .select(baseSimulationSelect)
          .order('created_at', { ascending: false })
      } else {
        setSimulationSubjectSchemaReady(true)
      }

      const { data, error } = response
      if (error) throw error

      const mappedSimulations = (data ?? []).map(normalizeSimulationRow)
      setSimulations(mappedSimulations)
      setActiveSimulationId((current) => (
        current && mappedSimulations.some((simulation) => simulation.id === current)
          ? current
          : mappedSimulations[0]?.id ?? null
      ))
      setActiveRankingSimulationId((current) => {
        const publishedSimulations = mappedSimulations.filter((simulation) => simulation.isPublished)
        if (current && publishedSimulations.some((simulation) => simulation.id === current)) return current
        return publishedSimulations[0]?.id ?? null
      })
    } catch (error) {
      setSimulations([])
      setSimulationsError(
        isMissingColumnError(error) || /relation|simulation/i.test(error?.message ?? '')
          ? 'Aun falta crear las tablas de simulacros en Supabase. Ejecuta el SQL incluido en supabase/simulations.sql.'
          : normalizeError(error),
      )
    } finally {
      setSimulationsLoading(false)
    }
  }, [session?.user?.id])

  const fetchSimulationAttempts = useCallback(async () => {
    const currentUserId = session?.user?.id
    if (!currentUserId || !supabase) return

    try {
      let response = await supabase
        .from('simulation_attempts')
        .select('id, simulation_id, answers, correct_count, question_count, score, duration_seconds, completed_at')
        .eq('user_id', currentUserId)
        .order('completed_at', { ascending: false })

      if (
        response.error
        && (
          response.error?.code === '42703'
          || /duration_seconds/i.test(response.error?.message ?? '')
        )
      ) {
        response = await supabase
          .from('simulation_attempts')
          .select('id, simulation_id, answers, correct_count, question_count, score, completed_at')
          .eq('user_id', currentUserId)
          .order('completed_at', { ascending: false })
      }

      if (response.error) throw response.error
      setSimulationAttempts((response.data ?? []).map(normalizeSimulationAttempt))
    } catch {
      setSimulationAttempts([])
    }
  }, [session?.user?.id])

  const fetchSimulationRankings = useCallback(async () => {
    if (!session?.user?.id || !supabase) return

    setSimulationRankingLoading(true)
    setSimulationRankingError('')
    try {
      const { data, error } = await supabase.rpc('get_simulation_rankings')
      if (error) throw error

      const mappedRankings = (data ?? []).map(normalizeSimulationRankingRow)
      setSimulationRankings(mappedRankings)
    } catch (error) {
      setSimulationRankings([])
      setSimulationRankingError(
        /get_simulation_rankings|function|schema cache/i.test(error?.message ?? '')
          ? 'Aun falta ejecutar la funcion get_simulation_rankings incluida en supabase/simulations.sql.'
          : normalizeError(error),
      )
    } finally {
      setSimulationRankingLoading(false)
    }
  }, [session?.user?.id])

  const fetchSimulationSubjectAnalytics = useCallback(async (simulationId, { force = false } = {}) => {
    if (!session?.user?.id || !supabase || !simulationId) return
    if (!force && simulationSubjectAnalytics[simulationId]) return

    setSimulationSubjectAnalyticsLoading((current) => ({ ...current, [simulationId]: true }))
    setSimulationSubjectAnalyticsErrors((current) => ({ ...current, [simulationId]: '' }))

    try {
      const { data, error } = await supabase.rpc('get_simulation_subject_averages', {
        target_simulation_id: simulationId,
      })
      if (error) throw error

      setSimulationSubjectAnalytics((current) => ({
        ...current,
        [simulationId]: (data ?? []).map(normalizeSimulationSubjectAnalyticsRow),
      }))
    } catch (error) {
      setSimulationSubjectAnalytics((current) => ({ ...current, [simulationId]: [] }))
      setSimulationSubjectAnalyticsErrors((current) => ({
        ...current,
        [simulationId]: /get_simulation_subject_averages|function|schema cache/i.test(error?.message ?? '')
          ? 'Ejecuta supabase/simulado_subject_analytics.sql para activar la comparativa por curso.'
          : normalizeError(error),
      }))
    } finally {
      setSimulationSubjectAnalyticsLoading((current) => ({ ...current, [simulationId]: false }))
    }
  }, [session?.user?.id, simulationSubjectAnalytics])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined

    let mounted = true
    const authUrlError = getAuthErrorMessageFromUrl()

    if (authUrlError) {
      window.setTimeout(() => showToast(authUrlError, 'error'), 0)
      window.history.replaceState(null, '', window.location.pathname)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) showToast(normalizeError(error), 'error')
      setSession(data.session)
      setBootLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setExams([])
        setActiveExamId(null)
        setView('home')
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [showToast])

  useEffect(() => {
    if (session?.user?.id) {
      Promise.resolve().then(() => fetchWorkspace())
    }
  }, [fetchWorkspace, session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      Promise.resolve().then(() => fetchLeaderboard())
    }
  }, [fetchLeaderboard, session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      Promise.resolve().then(() => fetchExamSubjects())
    }
  }, [fetchExamSubjects, session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      Promise.resolve().then(() => fetchSimulations())
    }
  }, [fetchSimulations, session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      Promise.resolve().then(() => fetchSimulationAttempts())
      Promise.resolve().then(() => fetchSimulationRankings())
    }
  }, [fetchSimulationAttempts, fetchSimulationRankings, session?.user?.id])

  useEffect(() => {
    if (activeSimulationId) {
      Promise.resolve().then(() => fetchSimulationSubjectAnalytics(activeSimulationId))
    }
  }, [activeSimulationId, fetchSimulationSubjectAnalytics])

  useEffect(() => {
    if (activeRankingSimulationId) {
      Promise.resolve().then(() => fetchSimulationSubjectAnalytics(activeRankingSimulationId))
    }
  }, [activeRankingSimulationId, fetchSimulationSubjectAnalytics])

  const activeExam = useMemo(
    () => exams.find((exam) => exam.id === activeExamId) ?? exams[0] ?? null,
    [activeExamId, exams],
  )

  const stats = collectStats(activeExam)
  const userStats = collectUserStats(exams)
  const daysLeft = daysUntil(activeExam?.targetDate)
  const weeksLeft = weeksUntil(activeExam?.targetDate)
  const displayName = getDisplayName(session, profile)
  const leaderboardEntries = buildLeaderboard(leaderboard, userStats, displayName, session?.user?.id)
  const publicPath = getPublicPath()
  const hasExistingTemplate = (template) => exams.some((exam) => isTemplatePreparation(exam, template))
  const isAdmin = isSimulationAdminUser(session?.user?.id)
  const guardedSetView = useCallback((nextView) => {
    if (simulationNavigationLocked && nextView !== 'weekly-sim') {
      showToast('Termina o finaliza el simulacro antes de salir.', 'info')
      return
    }

    setView(nextView)
  }, [showToast, simulationNavigationLocked])

  if (publicPath) {
    return <PublicRoute path={publicPath} isLoggedIn={Boolean(session)} />
  }

  const runAction = async (label, task) => {
    setActionLoading(label)
    try {
      await task()
    } catch (error) {
      showToast(normalizeError(error), 'error')
    } finally {
      setActionLoading('')
    }
  }

  const handleAuth = (event) => {
    event.preventDefault()
    if (!supabase) return

    const email = authForm.email.trim()
    const password = authForm.password
    const displayNameValue = authForm.displayName.trim()

    if (!email || !password || (authMode === 'register' && !displayNameValue)) {
      showToast('Completa los campos requeridos.', 'error')
      return
    }

    runAction('auth', async () => {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: { display_name: displayNameValue },
          },
        })

        if (error) throw error
        if (data.session) {
          showToast('Cuenta creada. Ya puedes organizar tu plan.')
        } else {
          showToast('Cuenta creada. Revisa tu correo si Supabase pide confirmar el acceso.', 'info')
        }
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      showToast('Sesion iniciada.')
    })
  }

  const handleLogout = () => {
    if (!supabase) return
    runAction('logout', async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      showToast('Sesion cerrada.', 'info')
    })
  }

  const handleCreateExam = (event) => {
    event.preventDefault()
    if (!session?.user?.id || !supabase) return
    if (!examForm.name.trim() || !examForm.targetDate) {
      showToast('Escribe el nombre y la fecha del examen.', 'error')
      return
    }

    runAction('exam', async () => {
      const { data, error } = await supabase
        .from('exams')
        .insert({
          user_id: session.user.id,
          name: examForm.name.trim(),
          target_date: examForm.targetDate,
        })
        .select('id')
        .single()

      if (error) throw error
      setExamForm({ name: '', targetDate: '' })
      setView('home')
      await fetchWorkspace({ nextActiveId: data.id })
      showToast('Examen creado.')
    })
  }

  const handleCreateTemplateExam = (event) => {
    event.preventDefault()
    const selectedTemplate = getExamTemplateByCode(creationMode)
    if (!session?.user?.id || !supabase || !selectedTemplate) return

    const selectedTemplateForm = templateForms[selectedTemplate.code] ?? getTemplateFormDefaults(selectedTemplate)

    const name = selectedTemplateForm.name.trim() || selectedTemplate.defaultName
    if (!name || !selectedTemplateForm.targetDate) {
      showToast('Escribe el nombre y la fecha del examen.', 'error')
      return
    }

    if (exams.some((exam) => exam.name.trim().toLowerCase() === name.toLowerCase())) {
      showToast('Ya existe una preparacion con ese nombre. Cambia el nombre para crear otra.', 'error')
      return
    }

    runAction(`template-${selectedTemplate.code}`, async () => {
      const result = await createPreparationFromTemplate({
        supabase,
        userId: session.user.id,
        template: selectedTemplate,
        name,
        targetDate: selectedTemplateForm.targetDate,
        metadata: selectedTemplateForm,
      })

      setTemplateForms((current) => ({
        ...current,
        [selectedTemplate.code]: getTemplateFormDefaults(selectedTemplate),
      }))
      setCreationMode('custom')
      setView('home')
      await fetchWorkspace({ nextActiveId: result.examId })
      showToast(`Preparacion creada con ${result.courseCount} cursos y ${result.topicCount} temas.`, 'success')
    })
  }

  const handleAddCourse = (event) => {
    event.preventDefault()
    if (!activeExam || !session?.user?.id || !supabase) return

    const name = courseName.trim()
    if (!name) {
      showToast('Escribe el nombre del curso.', 'error')
      return
    }

    runAction('course', async () => {
      const { error } = await supabase.from('courses').insert({
        user_id: session.user.id,
        exam_id: activeExam.id,
        name,
        position: activeExam.courses.length,
      })

      if (error) throw error
      setCourseName('')
      await fetchWorkspace()
      showToast('Curso agregado.')
    })
  }

  const handleAddTopic = (courseId) => {
    if (!activeExam || !session?.user?.id || !supabase) return

    const course = activeExam.courses.find((item) => item.id === courseId)
    const text = (topicInputs[courseId] ?? '').trim()
    if (!course || !text) return

    runAction(`topic-${courseId}`, async () => {
      const payload = {
        user_id: session.user.id,
        course_id: courseId,
        name: text,
        status: 'pendiente',
        done: false,
        position: course.topics.length,
      }
      let { error } = await supabase.from('topics').insert(payload)

      if (error && isMissingColumnError(error)) {
        const fallback = await supabase.from('topics').insert({
          user_id: session.user.id,
          course_id: courseId,
          name: text,
          done: false,
          position: course.topics.length,
        })
        error = fallback.error
      }

      if (error) throw error
      setTopicInputs((current) => ({ ...current, [courseId]: '' }))
      await fetchWorkspace()
    })
  }

  const updateTopicStatus = (courseId, topicId, nextStatus) => {
    if (!activeExam || !supabase) return

    const course = activeExam.courses.find((item) => item.id === courseId)
    const topic = course?.topics.find((item) => item.id === topicId)
    if (!topic) return

    runAction(`toggle-${topicId}`, async () => {
      const nextDone = nextStatus === 'completado'
      const wasCompleted = isCompletedTopic(topic)
      const isNewStreakDay = nextDone && !wasCompleted && !userStats.activityDays.includes(todayISO())
      const payload = {
        status: nextStatus,
        done: nextDone,
        completed_at: nextDone ? (topic.completedAt ?? new Date().toISOString()) : null,
      }
      let { error } = await supabase
        .from('topics')
        .update(payload)
        .eq('id', topicId)

      if (error && isMissingColumnError(error)) {
        const fallback = await supabase
          .from('topics')
          .update({ done: nextDone, completed_at: nextDone ? (topic.completedAt ?? new Date().toISOString()) : null })
          .eq('id', topicId)
        error = fallback.error
      }

      if (error) throw error
      const refreshedExams = await fetchWorkspace()
      await fetchLeaderboard()

      if (isNewStreakDay) {
        const nextStats = collectUserStats(refreshedExams ?? exams)
        const nextStreak = nextStats.streak.current
        if (nextStreak > 0 && nextStreak % 10 === 0) {
          showToast(getMotivationMessage(nextStreak), 'info')
        }
      }
    })
  }

  const removeTopic = (courseId, topicId) => {
    if (!activeExam || !session?.user?.id || !supabase) return

    const course = activeExam.courses.find((item) => item.id === courseId)
    const topic = course?.topics.find((item) => item.id === topicId)
    if (!topic) return

    const hasProgress = isCompletedTopic(topic) || getTopicStatus(topic) !== 'pendiente' || Boolean(topic.completedAt)
    const message = hasProgress
      ? 'Este tema tiene progreso registrado. Si lo eliminas, se perdera este avance.'
      : 'Deseas eliminar este tema?'

    if (!window.confirm(message)) return

    runAction(`delete-topic-${topicId}`, async () => {
      const { error } = await supabase
        .from('topics')
        .delete()
        .eq('id', topicId)
        .eq('user_id', session.user.id)

      if (error) throw error

      setExams((currentExams) => currentExams.map((exam) => (
        exam.id !== activeExam.id
          ? exam
          : {
            ...exam,
            courses: exam.courses.map((item) => (
              item.id !== courseId
                ? item
                : { ...item, topics: item.topics.filter((currentTopic) => currentTopic.id !== topicId) }
            )),
          }
      )))
      if (hasProgress) await fetchLeaderboard()
      showToast('Tema eliminado.', 'info')
    })
  }

  const insertImportedTopics = async (rows) => {
    if (!rows.length) return

    let response = await supabase.from('topics').insert(rows)

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabase.from('topics').insert(rows.map((row) => ({
        user_id: row.user_id,
        course_id: row.course_id,
        name: row.name,
        status: row.status,
        done: row.done,
        completed_at: row.completed_at,
        position: row.position,
      })))
    }

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabase.from('topics').insert(rows.map((row) => ({
        user_id: row.user_id,
        course_id: row.course_id,
        name: row.name,
        done: row.done,
        completed_at: row.completed_at,
        position: row.position,
      })))
    }

    if (response.error) throw response.error
  }

  const handleImportTopics = async ({ rows, createMissingCourses, skipDuplicates }) => {
    if (!activeExam || !session?.user?.id || !supabase) return undefined

    let result
    await runAction('import-topics', async () => {
      const validRows = rows.filter((row) => !row.errors.length && !(skipDuplicates && row.duplicate))
      if (!validRows.length) {
        throw new Error('No hay filas validas para importar.')
      }

      const coursesByName = new Map(activeExam.courses.map((course) => [normalizeLookupKey(course.name), course]))
      const missingCourseNames = [...new Set(
        validRows
          .filter((row) => !coursesByName.has(normalizeLookupKey(row.courseName)))
          .map((row) => row.courseName),
      )]

      if (missingCourseNames.length && !createMissingCourses) {
        throw new Error('Hay cursos que no existen. Activa la creacion automatica o corrige el CSV.')
      }

      if (missingCourseNames.length) {
        const courseRows = missingCourseNames.map((name, index) => ({
          user_id: session.user.id,
          exam_id: activeExam.id,
          name,
          position: activeExam.courses.length + index,
        }))
        const { data, error } = await supabase
          .from('courses')
          .insert(courseRows)
          .select('id, name, position')

        if (error) throw error
        ;(data ?? []).forEach((course) => coursesByName.set(normalizeLookupKey(course.name), { ...course, topics: [] }))
      }

      const topicPositions = new Map(activeExam.courses.map((course) => [course.id, course.topics.length]))
      const topicRows = validRows.map((row) => {
        const course = coursesByName.get(normalizeLookupKey(row.courseName))
        const currentPosition = topicPositions.get(course.id) ?? 0
        topicPositions.set(course.id, currentPosition + 1)
        const status = normalizeStatus(row.status)
        const done = status === 'completado'

        return {
          user_id: session.user.id,
          course_id: course.id,
          name: row.topicName,
          status,
          importance: row.importance,
          notes: row.notes || null,
          done,
          completed_at: done ? new Date().toISOString() : null,
          position: currentPosition,
        }
      })

      await insertImportedTopics(topicRows)
      await fetchWorkspace()

      const skipped = rows.filter((row) => row.errors.length || (skipDuplicates && row.duplicate)).length
      result = { imported: topicRows.length, skipped }
      showToast(`Se importaron ${result.imported} temas correctamente. ${result.skipped} filas fueron omitidas.`, 'success')
    })

    return result
  }

  const removeCourse = (courseId) => {
    if (!supabase) return

    runAction(`remove-${courseId}`, async () => {
      const { error } = await supabase.from('courses').delete().eq('id', courseId)
      if (error) throw error
      await fetchWorkspace()
      showToast('Curso eliminado.', 'info')
    })
  }

  const openSettings = () => {
    if (!activeExam) return
    setEditExamForm({ name: activeExam.name, targetDate: activeExam.targetDate })
    setSettingsOpen(true)
  }

  const saveExamSettings = (keepCourses) => {
    if (!activeExam || !supabase) return
    if (!editExamForm.name.trim() || !editExamForm.targetDate) {
      showToast('Completa el nombre y la fecha.', 'error')
      return
    }

    runAction('settings', async () => {
      const { error } = await supabase
        .from('exams')
        .update({ name: editExamForm.name.trim(), target_date: editExamForm.targetDate })
        .eq('id', activeExam.id)

      if (error) throw error

      if (!keepCourses) {
        const { error: deleteError } = await supabase.from('courses').delete().eq('exam_id', activeExam.id)
        if (deleteError) throw deleteError
      }

      setSettingsOpen(false)
      await fetchWorkspace()
      showToast('Configuracion guardada.')
    })
  }

  const deleteActiveExam = () => {
    if (!activeExam || !supabase) return

    const confirmed = window.confirm(`Eliminar "${activeExam.name}" borrara tambien sus cursos, temas y progreso. Esta accion no se puede deshacer.`)
    if (!confirmed) return

    runAction('delete-exam', async () => {
      const { error } = await supabase.from('exams').delete().eq('id', activeExam.id)
      if (error) throw error

      setSettingsOpen(false)
      setView('home')
      await fetchWorkspace()
      showToast('Examen eliminado.', 'info')
    })
  }

  const startNewSimulation = () => {
    setSimulationDraft(createEmptySimulationDraft())
  }

  const editSimulation = (simulation) => {
    setSimulationDraft(simulationToDraft(simulation))
    setActiveSimulationId(simulation.id)
  }

  const saveSimulation = (event) => {
    event.preventDefault()
    if (!isAdmin || !session?.user?.id || !supabase) return

    const title = simulationDraft.title.trim()
    const description = simulationDraft.description.trim()
    const durationMinutes = Number(simulationDraft.durationMinutes)
    const validQuestions = simulationDraft.questions.map((question, index) => ({
      ...question,
      prompt: question.prompt.trim(),
      imageUrl: question.imageUrl.trim(),
      subjectId: question.subjectId ?? '',
      options: Object.fromEntries(ANSWER_OPTIONS.map((option) => [option, question.options[option].trim()])),
      position: index,
    }))
    const hasQuestionsWithoutSubject = validQuestions.some((question) => !question.subjectId)
    const subjectIdsInDraft = new Set(validQuestions.map((question) => question.subjectId).filter(Boolean))
    const sanitizedGradingWeights = Object.fromEntries(
      Object.entries(normalizeGradingWeights(simulationDraft.gradingWeights))
        .filter(([subjectId]) => subjectIdsInDraft.has(subjectId)),
    )

    if (!title) {
      showToast('Escribe el nombre del simulacro.', 'error')
      return
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      showToast('Define una duración válida para el simulacro.', 'error')
      return
    }

    if (!validQuestions.length || validQuestions.some((question) => !question.prompt || ANSWER_OPTIONS.some((option) => !question.options[option]))) {
      showToast('Completa el texto y las alternativas A, B, C, D y E de cada pregunta.', 'error')
      return
    }

    if (simulationSubjectSchemaReady && !simulationDraft.id && hasQuestionsWithoutSubject) {
      showToast('Selecciona un curso para cada pregunta del nuevo simulacro.', 'error')
      return
    }

    if (
      simulationSubjectSchemaReady
      && simulationDraft.id
      && hasQuestionsWithoutSubject
      && !window.confirm('Hay preguntas sin curso asignado. Esto afectará las estadísticas por curso. ¿Deseas guardar de todos modos?')
    ) {
      return
    }

    runAction('save-simulation', async () => {
      const simulationPayload = {
        title,
        description,
        image_url: simulationDraft.imageUrl.trim() || null,
        score_max: Number(simulationDraft.scoreMax) || 20,
        is_published: simulationDraft.isPublished,
      }
      const simulationPayloadWithDuration = simulationDurationSchemaReady
        ? { ...simulationPayload, duration_minutes: Math.round(durationMinutes) }
        : simulationPayload
      const simulationPayloadWithGrading = simulationGradingSchemaReady
        ? { ...simulationPayloadWithDuration, grading_weights: sanitizedGradingWeights }
        : simulationPayloadWithDuration

      let simulationId = simulationDraft.id

      if (simulationId) {
        const { error } = await supabase
          .from('simulations')
          .update(simulationPayloadWithGrading)
          .eq('id', simulationId)
        if (error) throw error

        const { error: deleteQuestionsError } = await supabase
          .from('simulation_questions')
          .delete()
          .eq('simulation_id', simulationId)
        if (deleteQuestionsError) throw deleteQuestionsError
      } else {
        const { data, error } = await supabase
          .from('simulations')
          .insert({ ...simulationPayloadWithGrading, created_by: session.user.id })
          .select('id')
          .single()
        if (error) throw error
        simulationId = data.id
      }

      const questionRows = validQuestions.map((question) => ({
        simulation_id: simulationId,
        prompt: question.prompt,
        image_url: question.imageUrl || null,
        option_a: question.options.A,
        option_b: question.options.B,
        option_c: question.options.C,
        option_d: question.options.D,
        option_e: question.options.E,
        correct_option: question.correctOption,
        position: question.position,
      }))
      const questionRowsWithSubjects = simulationSubjectSchemaReady
        ? questionRows.map((question, index) => ({
          ...question,
          course_id: validQuestions[index].subjectId || null,
        }))
        : questionRows

      const { error: questionsError } = await supabase.from('simulation_questions').insert(questionRowsWithSubjects)
      if (questionsError) throw questionsError

      await fetchSimulations()
      await fetchSimulationRankings()
      setActiveSimulationId(simulationId)
      setSimulationDraft(createEmptySimulationDraft())
      showToast('Simulacro guardado.')
    })
  }

  const deleteSimulation = (simulationId) => {
    if (!isAdmin || !supabase) return
    if (!window.confirm('Eliminar este simulacro también quitará sus preguntas e intentos registrados.')) return

    runAction(`delete-simulation-${simulationId}`, async () => {
      const { error } = await supabase.from('simulations').delete().eq('id', simulationId)
      if (error) throw error
      await fetchSimulations()
      await fetchSimulationRankings()
      setSimulationDraft(createEmptySimulationDraft())
      showToast('Simulacro eliminado.', 'info')
    })
  }

  const setSimulationAnswer = (simulationId, questionId, answer) => {
    setSimulationAnswers((current) => ({
      ...current,
      [simulationId]: {
        ...(current[simulationId] ?? {}),
        [questionId]: answer,
      },
    }))
  }

  const resetSimulationAttempt = (simulationId) => {
    setSimulationAnswers((current) => {
      const next = { ...current }
      delete next[simulationId]
      return next
    })
    setSimulationResults((current) => {
      const next = { ...current }
      delete next[simulationId]
      return next
    })
  }

  const submitSimulationAttempt = (simulation, options = {}) => {
    if (!session?.user?.id || !supabase) return null
    const answers = simulationAnswers[simulation.id] ?? {}
    const allowIncomplete = Boolean(options.allowIncomplete)
    const isTimedOut = options.reason === 'timeout'
    const durationSeconds = options.durationSeconds == null ? null : Math.max(0, Math.round(Number(options.durationSeconds) || 0))

    if (!allowIncomplete && simulation.questions.some((question) => !answers[question.id])) {
      showToast('Responde todas las preguntas antes de terminar.', 'error')
      return null
    }

    const result = {
      ...calculateSimulationResult(simulation, answers),
      durationSeconds,
    }
    setSimulationResults((current) => ({ ...current, [simulation.id]: result }))

    runAction(`submit-simulation-${simulation.id}`, async () => {
      const attemptPayload = {
        simulation_id: simulation.id,
        user_id: session.user.id,
        answers,
        correct_count: result.correctCount,
        question_count: result.questionCount,
        score: result.score,
      }

      if (durationSeconds != null) {
        attemptPayload.duration_seconds = durationSeconds
      }

      let { error } = await supabase.from('simulation_attempts').insert(attemptPayload)

      if (
        error
        && (
          error?.code === '42703'
          || /duration_seconds/i.test(error?.message ?? '')
        )
      ) {
        const fallbackPayload = { ...attemptPayload }
        delete fallbackPayload.duration_seconds
        const fallbackResponse = await supabase.from('simulation_attempts').insert(fallbackPayload)
        error = fallbackResponse.error
      }

      if (error) throw error
      await fetchSimulationAttempts()
      await fetchSimulationRankings()
      await fetchSimulationSubjectAnalytics(simulation.id, { force: true })
      showToast(
        isTimedOut
          ? `Tiempo terminado. Nota calculada: ${result.score}/${simulation.scoreMax}.`
          : `Nota calculada: ${result.score}/${simulation.scoreMax}.`,
        isTimedOut ? 'info' : 'success',
      )
    })

    return result
  }

  if (!isSupabaseConfigured) {
    return (
      <PublicScreen className="auth-screen">
        <section className="auth-panel compact-panel">
          <BrandLockup />
          <h1>Falta conectar Supabase.</h1>
          <p className="muted">Agrega las variables de entorno y vuelve a iniciar Vite para habilitar login, registro y datos remotos.</p>
        </section>
      </PublicScreen>
    )
  }

  if (bootLoading) {
    return <BootScreen />
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          form={authForm}
          setForm={setAuthForm}
          onSubmit={handleAuth}
          loading={actionLoading === 'auth'}
        />
        <Toast toast={toast} />
      </>
    )
  }

  if (dataLoading && !activeExam) {
    return (
      <AppFrame
        displayName={displayName}
        exams={exams}
        activeExam={activeExam}
        view={view}
        setView={guardedSetView}
        setActiveExamId={setActiveExamId}
        onOpenSettings={openSettings}
        onLogout={handleLogout}
        logoutLoading={actionLoading === 'logout'}
        daysLeft={daysLeft}
        userStats={userStats}
        navigationLocked={simulationNavigationLocked}
      >
        <DashboardSkeleton />
        <Toast toast={toast} />
      </AppFrame>
    )
  }

  if (!activeExam) {
    return (
      <PublicScreen className="setup-screen">
        <section className="setup-panel">
          <LogoShowcase compact />
          <div className="setup-copy">
            <p className="eyebrow">Hola, {displayName}</p>
            <h1>Primero crea la preparacion que quieres seguir.</h1>
            <p className="muted">Puedes empezar desde cero o cargar una plantilla de admision real con cursos y temas iniciales.</p>
          </div>
          <TemplateSelector
            mode={creationMode}
            setMode={setCreationMode}
            customForm={examForm}
            setCustomForm={setExamForm}
            onCustomSubmit={handleCreateExam}
            customLoading={actionLoading === 'exam'}
            templates={EXAM_TEMPLATES}
            templateForms={templateForms}
            setTemplateForms={setTemplateForms}
            onTemplateSubmit={handleCreateTemplateExam}
            getTemplateLoading={(template) => actionLoading === `template-${template.code}`}
            hasExistingTemplate={hasExistingTemplate}
            customSubmitText="Crear preparacion"
          />
        </section>
        <Toast toast={toast} />
      </PublicScreen>
    )
  }

  return (
    <AppFrame
      displayName={displayName}
      exams={exams}
      activeExam={activeExam}
      view={view}
      setView={guardedSetView}
      setActiveExamId={setActiveExamId}
      onOpenSettings={openSettings}
      onLogout={handleLogout}
      logoutLoading={actionLoading === 'logout'}
      daysLeft={daysLeft}
      userStats={userStats}
      dataLoading={dataLoading}
      navigationLocked={simulationNavigationLocked}
    >
      {view === 'new-exam' ? (
        <section className="page-narrow reveal">
          <p className="eyebrow">Crear preparación</p>
          <h1>Añade otro plan</h1>
          <TemplateSelector
            mode={creationMode}
            setMode={setCreationMode}
            customForm={examForm}
            setCustomForm={setExamForm}
            onCustomSubmit={handleCreateExam}
            customLoading={actionLoading === 'exam'}
            templates={EXAM_TEMPLATES}
            templateForms={templateForms}
            setTemplateForms={setTemplateForms}
            onTemplateSubmit={handleCreateTemplateExam}
            getTemplateLoading={(template) => actionLoading === `template-${template.code}`}
            hasExistingTemplate={hasExistingTemplate}
            customSubmitText="Guardar preparacion"
          />
        </section>
      ) : view === 'courses' ? (
        <CoursesPage
          exam={activeExam}
          courseName={courseName}
          setCourseName={setCourseName}
          topicInputs={topicInputs}
          setTopicInputs={setTopicInputs}
          onAddCourse={handleAddCourse}
          onAddTopic={handleAddTopic}
          onSetTopicStatus={updateTopicStatus}
          onRemoveTopic={removeTopic}
          onRemoveCourse={removeCourse}
          onImportTopics={handleImportTopics}
          actionLoading={actionLoading}
        />
      ) : view === 'weekly-sim' ? (
        <WeeklySimulationPage
          simulations={simulations}
          loading={simulationsLoading}
          error={simulationsError}
          isAdmin={isAdmin}
          activeSimulationId={activeSimulationId}
          setActiveSimulationId={setActiveSimulationId}
          setNavigationLocked={setSimulationNavigationLocked}
          draft={simulationDraft}
          setDraft={setSimulationDraft}
          subjects={examSubjects}
          subjectsReady={examSubjectsReady}
          subjectsLoading={examSubjectsLoading}
          subjectSchemaReady={simulationSubjectSchemaReady}
          durationSchemaReady={simulationDurationSchemaReady}
          gradingSchemaReady={simulationGradingSchemaReady}
          answers={simulationAnswers}
          results={simulationResults}
          attempts={simulationAttempts}
          rankings={simulationRankings}
          currentUserId={session.user.id}
          subjectAnalytics={simulationSubjectAnalytics}
          subjectAnalyticsLoading={simulationSubjectAnalyticsLoading}
          subjectAnalyticsErrors={simulationSubjectAnalyticsErrors}
          onNewSimulation={startNewSimulation}
          onEditSimulation={editSimulation}
          onSaveSimulation={saveSimulation}
          onDeleteSimulation={deleteSimulation}
          onResetAttempt={resetSimulationAttempt}
          onSetAnswer={setSimulationAnswer}
          onSubmitAttempt={submitSimulationAttempt}
          actionLoading={actionLoading}
        />
      ) : view === 'weekly-ranking' ? (
        <WeeklySimulationRankingPage
          simulations={simulations}
          rankings={simulationRankings}
          loading={simulationRankingLoading || simulationsLoading}
          error={simulationRankingError || simulationsError}
          activeSimulationId={activeRankingSimulationId}
          setActiveSimulationId={setActiveRankingSimulationId}
          currentUserId={session.user.id}
          subjectAnalytics={simulationSubjectAnalytics}
          subjectAnalyticsLoading={simulationSubjectAnalyticsLoading}
          subjectAnalyticsErrors={simulationSubjectAnalyticsErrors}
        />
      ) : view === 'flashcards' ? (
        <FlashcardsPage
          currentUserId={session.user.id}
          exam={activeExam}
          showToast={showToast}
        />
      ) : view === 'global' ? (
        <GlobalPage
          entries={leaderboardEntries}
          currentUserId={session.user.id}
          loading={leaderboardLoading}
        />
      ) : (
        <HomePage
          exam={activeExam}
          stats={stats}
          userStats={userStats}
          daysLeft={daysLeft}
          weeksLeft={weeksLeft}
          onOpenCourses={() => setView('courses')}
        />
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="icon-btn close-btn" aria-label="Cerrar" onClick={() => setSettingsOpen(false)}>
              <X size={18} />
            </button>
            <p className="eyebrow">Configuracion de la preparacion</p>
            <h2 id="settings-title">Ajusta nombre, fecha o datos</h2>
            <div className="stack-form">
              <label>
                Nombre de la preparacion
                <input value={editExamForm.name} onChange={(event) => setEditExamForm({ ...editExamForm, name: event.target.value })} />
              </label>
              <label>
                Fecha objetivo
                <input
                  type="date"
                  min={todayISO()}
                  value={editExamForm.targetDate}
                  onChange={(event) => setEditExamForm({ ...editExamForm, targetDate: event.target.value })}
                />
              </label>
              <div className="modal-actions">
                <Button className="secondary-btn" loading={actionLoading === 'settings'} disabled={actionLoading === 'delete-exam'} onClick={() => saveExamSettings(true)}>
                  <Check size={18} />
                  Guardar cambios
                </Button>
                <Button className="danger-btn" loading={actionLoading === 'settings'} disabled={actionLoading === 'delete-exam'} onClick={() => saveExamSettings(false)}>
                  <Trash2 size={18} />
                  Vaciar cursos
                </Button>
              </div>
              <div className="settings-danger-zone">
                <div>
                  <strong>Eliminar preparacion completa</strong>
                  <p>Quita esta preparacion con todos sus cursos, temas y progreso.</p>
                </div>
                <Button className="danger-btn" loading={actionLoading === 'delete-exam'} disabled={actionLoading === 'settings'} onClick={deleteActiveExam}>
                  <Trash2 size={18} />
                  Eliminar preparacion
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
      <Toast toast={toast} />
    </AppFrame>
  )
}

function PublicRoute({ path, isLoggedIn }) {
  return (
    <PublicLayout isLoggedIn={isLoggedIn}>
      {path === '/acerca-de' ? (
        <AboutPage />
      ) : path === '/contacto' ? (
        <ContactPage />
      ) : path === '/privacidad' ? (
        <PrivacyPage />
      ) : path === '/terminos' ? (
        <TermsPage />
      ) : (
        <ResourcesPage />
      )}
    </PublicLayout>
  )
}

function PublicLayout({ children, isLoggedIn }) {
  return (
    <div className="public-page">
      <PublicNavbar isLoggedIn={isLoggedIn} />
      {children}
      <AppFooter />
    </div>
  )
}

function PublicNavbar({ isLoggedIn = false }) {
  return (
    <header className="public-navbar">
      <a href="/" className="public-brand-link" aria-label="Trackedux inicio">
        <BrandLockup small />
      </a>
      <nav className="public-nav-links" aria-label="Navegacion publica">
        {PUBLIC_NAV_LINKS.map((link) => (
          <a className={getCurrentPath() === link.href ? 'active' : ''} href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <a className="public-login-link" href="/dashboard">
        <LayoutDashboard size={17} />
        {isLoggedIn ? 'Dashboard' : 'Iniciar sesion'}
      </a>
    </header>
  )
}

function InfoPageHeader({ eyebrow, title, children, icon }) {
  return (
    <section className="info-page-header reveal">
      <div className="info-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <div className="info-header-art" aria-hidden="true">
        <span>{icon}</span>
        <img src={logoArt} alt="" />
      </div>
    </section>
  )
}

function InfoCard({ icon, title, children }) {
  return (
    <article className="info-card">
      <span className="info-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  )
}

function AboutPage() {
  return (
    <main className="public-main">
      <InfoPageHeader eyebrow="Acerca de" title="Acerca de Trackedux" icon={<GraduationCap size={38} />}>
        Trackedux es una plataforma creada para estudiantes que desean organizar mejor su preparacion academica,
        registrar sus cursos, guardar examenes, visualizar su avance y mantener un seguimiento constante de su progreso.
      </InfoPageHeader>

      <section className="info-prose">
        <p>
          El objetivo de Trackedux es ayudar a jovenes estudiantes a estudiar con mas claridad, disciplina y direccion,
          especialmente durante etapas exigentes como la preparacion para examenes de admision, ciclos preuniversitarios,
          estudios escolares, universitarios o aprendizaje autodidacta.
        </p>
        <p>
          Trackedux nace como un proyecto tecnologico desarrollado por Sebastian Shulla, con el proposito de crear
          herramientas digitales utiles para estudiantes y jovenes que buscan mejorar su rendimiento academico.
        </p>
      </section>

      <section className="info-grid">
        <InfoCard icon={<BookOpen size={22} />} title="Que es Trackedux">
          Una app web para registrar cursos, organizar examenes y ver el progreso academico con herramientas visuales.
        </InfoCard>
        <InfoCard icon={<Target size={22} />} title="Mision">
          Ayudar a estudiantes a organizar su preparacion academica mediante herramientas simples, visuales y accesibles.
        </InfoCard>
        <InfoCard icon={<Sparkles size={22} />} title="Vision">
          Convertir Trackedux en una plataforma educativa que acompane a jovenes durante su proceso de aprendizaje,
          preparacion y crecimiento personal.
        </InfoCard>
        <InfoCard icon={<Users size={22} />} title="Para quien es">
          Estudiantes preuniversitarios, escolares, universitarios y autodidactas que quieren estudiar con mas constancia.
        </InfoCard>
        <InfoCard icon={<Code size={22} />} title="Creador">
          Sebastian Shulla, desarrollador del proyecto y creador de herramientas digitales para estudiantes y jovenes.
        </InfoCard>
      </section>
    </main>
  )
}

function ContactPage() {
  return (
    <main className="public-main">
      <InfoPageHeader eyebrow="Contacto" title="Contacto" icon={<Mail size={38} />}>
        Tienes una sugerencia, encontraste un error o quieres colaborar con Trackedux? Puedes contactarme a traves de mis
        redes o revisar mis proyectos en GitHub.
      </InfoPageHeader>

      <section className="contact-intro">
        <div>
          <p className="eyebrow">Desarrollo web</p>
          <h2>Tambien desarrollo productos digitales a medida.</h2>
          <p>
            Desarrollo paginas web, dashboards, landing pages y sistemas personalizados para estudiantes, negocios y
            emprendimientos.
          </p>
        </div>
        <span className="portfolio-mark"><BriefcaseBusiness size={36} /></span>
      </section>

      <section className="contact-grid">
        <ContactCard icon={<Lightbulb size={22} />} title="Sugerencias y colaboracion" detail="Ideas para mejorar Trackedux" href={`mailto:${CONTACT_LINKS.primaryEmail}`} label={CONTACT_LINKS.primaryEmail} />
        <ContactCard icon={<Bug size={22} />} title="Soporte y reportes" detail="Errores, dudas o solicitudes" href={`mailto:${CONTACT_LINKS.secondaryEmail}`} label={CONTACT_LINKS.secondaryEmail} />
        <ContactCard icon={<Code size={22} />} title="GitHub" detail="Repositorios y proyectos" href={CONTACT_LINKS.github} label="github.com/sebashulla" external />
        <ContactCard icon={<ExternalLink size={22} />} title="Instagram" detail="Red social principal" href={CONTACT_LINKS.instagram} label="@sebasshulla" external />
      </section>
    </main>
  )
}

function ContactCard({ icon, title, detail, href, label, external = false }) {
  return (
    <a className="contact-card" href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
      <span className="info-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        <strong>{label}</strong>
      </div>
      <ArrowRight size={18} />
    </a>
  )
}

function PrivacyPage() {
  return (
    <main className="public-main legal-main">
      <InfoPageHeader eyebrow="Legal" title="Politica de privacidad" icon={<ShieldCheck size={38} />}>
        Esta politica explica de forma simple que datos puede usar Trackedux y para que se utilizan dentro de la plataforma.
      </InfoPageHeader>

      <LegalSection title="Datos que Trackedux puede recopilar">
        <li>Nombre visible o datos de perfil que el usuario registre.</li>
        <li>Correo electronico.</li>
        <li>Datos relacionados con cursos.</li>
        <li>Datos relacionados con examenes.</li>
        <li>Datos de progreso academico.</li>
        <li>Informacion tecnica basica necesaria para el funcionamiento de la plataforma.</li>
      </LegalSection>

      <LegalSection title="Como se usan estos datos">
        <li>Permitir el funcionamiento de la plataforma.</li>
        <li>Guardar el progreso del usuario.</li>
        <li>Mostrar cursos, examenes y estadisticas.</li>
        <li>Mejorar la experiencia dentro de Trackedux.</li>
        <li>Mantener la seguridad de la cuenta.</li>
      </LegalSection>

      <section className="legal-card highlight">
        <p>Trackedux no vende ni comparte informacion personal de los usuarios con terceros para fines comerciales.</p>
      </section>

      <section className="legal-card">
        <h2>Autenticacion, almacenamiento y solicitudes</h2>
        <p>
          La autenticacion y almacenamiento pueden gestionarse mediante Supabase. El usuario puede solicitar informacion o
          eliminacion de datos escribiendo a <a href={`mailto:${CONTACT_LINKS.primaryEmail}`}>{CONTACT_LINKS.primaryEmail}</a>.
        </p>
        <p>Esta politica puede actualizarse con el tiempo para reflejar mejoras del proyecto o cambios necesarios.</p>
      </section>
    </main>
  )
}

function TermsPage() {
  return (
    <main className="public-main legal-main">
      <InfoPageHeader eyebrow="Legal" title="Terminos y condiciones" icon={<FileText size={38} />}>
        Estos terminos describen las condiciones basicas para usar Trackedux como herramienta de organizacion academica.
      </InfoPageHeader>

      <LegalSection title="Uso de la plataforma">
        <li>Trackedux es una herramienta de organizacion academica.</li>
        <li>El usuario es responsable de la informacion que registra.</li>
        <li>No se permite usar la plataforma para actividades ilegales, abusivas o que afecten a otros usuarios.</li>
        <li>Trackedux puede actualizar sus funciones, diseno o condiciones de uso con el tiempo.</li>
        <li>Trackedux busca apoyar el proceso de estudio, pero no garantiza la aprobacion de examenes ni resultados academicos especificos.</li>
        <li>El uso de la plataforma implica la aceptacion de estos terminos.</li>
      </LegalSection>

      <section className="legal-card">
        <h2>Dudas o solicitudes</h2>
        <p>
          Para dudas o solicitudes, puedes contactar a <a href={`mailto:${CONTACT_LINKS.primaryEmail}`}>{CONTACT_LINKS.primaryEmail}</a>.
        </p>
      </section>
    </main>
  )
}

function LegalSection({ title, children }) {
  return (
    <section className="legal-card">
      <h2>{title}</h2>
      <ul>{children}</ul>
    </section>
  )
}

function ResourcesPage() {
  const resources = [
    'Como organizar tu horario de estudio',
    'Como medir tu progreso semanal',
    'Como prepararte para un examen de admision',
    'Errores comunes al estudiar muchas horas',
    'Como usar Trackedux para mejorar tu constancia',
  ]

  return (
    <main className="public-main">
      <InfoPageHeader eyebrow="Recursos" title="Recursos de estudio" icon={<BookOpen size={38} />}>
        En esta seccion encontraras guias, consejos y recursos para mejorar tu organizacion academica, medir tu progreso
        y estudiar con mas constancia.
      </InfoPageHeader>

      <section className="resources-grid">
        {resources.map((resource, index) => (
          <ResourceCard title={resource} index={index + 1} key={resource} />
        ))}
      </section>
    </main>
  )
}

function ResourceCard({ title, index }) {
  return (
    <article className="resource-card">
      <span className="resource-number">{String(index).padStart(2, '0')}</span>
      <div>
        <h2>{title}</h2>
        <p>Proximamente</p>
      </div>
      <span className="resource-status">Guia futura</span>
    </article>
  )
}

function AuthScreen({ authMode, setAuthMode, form, setForm, onSubmit, loading }) {
  const isRegister = authMode === 'register'

  return (
    <PublicScreen className="auth-screen" showNav>
      <section className="auth-shell">
        <div className="auth-copy">
          <BrandLockup />
          <h1>Un tablero de estudio que recuerda tu avance por ti.</h1>
          <p className="muted">
            Inicia sesion, guarda tus examenes en Supabase y vuelve a tu plan desde cualquier navegador.
          </p>
          <LogoShowcase />
        </div>

        <form onSubmit={onSubmit} className="auth-panel">
          <div className="mode-switch" aria-label="Modo de acceso">
            <button type="button" className={!isRegister ? 'active' : ''} onClick={() => setAuthMode('login')}>
              <LogIn size={17} />
              Login
            </button>
            <button type="button" className={isRegister ? 'active' : ''} onClick={() => setAuthMode('register')}>
              <UserPlus size={17} />
              Registro
            </button>
          </div>

          <div>
            <p className="eyebrow">{isRegister ? 'Nueva cuenta' : 'Bienvenido de vuelta'}</p>
            <h2>{isRegister ? 'Crea tu acceso' : 'Entra a tu plan'}</h2>
          </div>

          {isRegister && (
            <label>
              Nombre visible
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="Ej. Sebastian"
                autoFocus
              />
            </label>
          )}

          <label>
            Correo
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="tu@email.com"
              autoFocus={!isRegister}
              autoComplete="email"
            />
          </label>

          <label>
            Contrasena
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Minimo 6 caracteres"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </label>

          <Button className="primary-btn" type="submit" loading={loading}>
            {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
            {isRegister ? 'Crear cuenta' : 'Iniciar sesion'}
          </Button>
        </form>
      </section>
    </PublicScreen>
  )
}

function AppFrame({
  children,
  displayName,
  exams,
  activeExam,
  view,
  setView,
  setActiveExamId,
  onOpenSettings,
  onLogout,
  logoutLoading,
  daysLeft,
  userStats,
  dataLoading,
  navigationLocked = false,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const userFirstName = displayName.split(/\s+/)[0] || displayName
  const goToView = (nextView) => {
    setView(nextView)
    setMobileDrawerOpen(false)
  }

  return (
    <div className={[
      'app-shell',
      sidebarCollapsed ? 'sidebar-collapsed' : '',
      mobileDrawerOpen ? 'mobile-drawer-open' : '',
      navigationLocked ? 'exam-locked' : '',
    ].filter(Boolean).join(' ')}>
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="Cerrar menu"
        onClick={() => setMobileDrawerOpen(false)}
      />

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-copy">
            <BrandLockup small />
            <p className="user">Sesion de {displayName}</p>
          </div>
          <button
            className="icon-btn sidebar-toggle"
            type="button"
            aria-label={mobileDrawerOpen ? 'Cerrar menu' : sidebarCollapsed ? 'Mostrar preparaciones' : 'Ocultar preparaciones'}
            onClick={() => {
              if (mobileDrawerOpen) {
                setMobileDrawerOpen(false)
                return
              }

              setSidebarCollapsed((current) => !current)
            }}
          >
            {mobileDrawerOpen ? <X size={18} /> : sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {(!sidebarCollapsed || mobileDrawerOpen) && (
          <div className="exam-list" aria-label="Preparaciones">
            {exams.map((exam) => (
              <button
                key={exam.id}
                className={exam.id === activeExam?.id ? 'exam-chip active' : 'exam-chip'}
                disabled={navigationLocked}
                onClick={() => {
                  setActiveExamId(exam.id)
                  goToView('home')
                }}
              >
                <span>{exam.name}</span>
                <small><CalendarDays size={14} /> {formatDate(exam.targetDate)}</small>
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-actions">
          <Button className="secondary-btn full" onClick={() => goToView('new-exam')} disabled={navigationLocked}>
            <Plus size={18} />
            <span>Nueva preparacion</span>
          </Button>
          <Button
            className="ghost-btn full"
            onClick={() => {
              setMobileDrawerOpen(false)
              onOpenSettings()
            }}
            disabled={!activeExam || navigationLocked}
          >
            <Settings size={18} />
            <span>Configuracion</span>
          </Button>
          <Button
            className="ghost-btn full"
            onClick={() => {
              setMobileDrawerOpen(false)
              onLogout()
            }}
            loading={logoutLoading}
            disabled={navigationLocked}
          >
            <LogOut size={18} />
            <span>Salir</span>
          </Button>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <button
            className="icon-btn mobile-menu-btn"
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileDrawerOpen(true)}
            disabled={navigationLocked}
          >
            <Menu size={19} />
          </button>
          <BrandLockup small />
          <div className="mobile-user-chip">
            <span>{userFirstName}</span>
            <small>{userStats?.streak.current ?? 0}d racha</small>
          </div>
        </header>

        <header className="topbar">
          <nav className="tabs" aria-label="Navegacion principal">
            <button className={view === 'home' ? 'tab active' : 'tab'} onClick={() => goToView('home')} disabled={navigationLocked}>
              <LayoutDashboard size={17} />
              Inicio
            </button>
            <button className={view === 'courses' ? 'tab active' : 'tab'} onClick={() => goToView('courses')} disabled={navigationLocked}>
              <BookOpen size={17} />
              Cursos
            </button>
            <button className={view === 'weekly-sim' ? 'tab active' : 'tab'} onClick={() => goToView('weekly-sim')} disabled={navigationLocked}>
              <FileText size={17} />
              Simulacro
            </button>
            <button className={view === 'weekly-ranking' ? 'tab active' : 'tab'} onClick={() => goToView('weekly-ranking')} disabled={navigationLocked}>
              <BarChart3 size={17} />
              Ranking
            </button>
            <button className={view === 'flashcards' ? 'tab active' : 'tab'} onClick={() => goToView('flashcards')} disabled={navigationLocked}>
              <BookOpenCheck size={17} />
              Repaso
            </button>
            <button className={view === 'global' ? 'tab active' : 'tab'} onClick={() => goToView('global')} disabled={navigationLocked}>
              <Users size={17} />
              Global
            </button>
          </nav>
          <div className="topbar-status">
            {dataLoading && <span className="sync-pill"><LoaderCircle size={15} /> Sincronizando</span>}
            <div className="date-pill streak-pill"><Flame size={16} /> {userStats?.streak.current ?? 0} dias de racha</div>
            <div className="date-pill"><Clock size={16} /> {daysLeft} dias restantes</div>
          </div>
        </header>

        {children}
        <AppFooter />
        <MobileBottomNav view={view} setView={goToView} navigationLocked={navigationLocked} />
      </div>
    </div>
  )
}

function MobileBottomNav({ view, setView, navigationLocked }) {
  const items = [
    { key: 'home', label: 'Inicio', icon: LayoutDashboard },
    { key: 'courses', label: 'Cursos', icon: BookOpen },
    { key: 'weekly-sim', label: 'Simulacro', icon: FileText },
    { key: 'weekly-ranking', label: 'Ranking', icon: BarChart3 },
    { key: 'flashcards', label: 'Repaso', icon: BookOpenCheck },
    { key: 'global', label: 'Global', icon: Users },
  ]

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegacion movil">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <button
            className={view === item.key ? 'active' : ''}
            type="button"
            onClick={() => setView(item.key)}
            disabled={navigationLocked}
            key={item.key}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function PublicScreen({ children, className, showNav = false }) {
  return (
    <main className={className}>
      {showNav && <PublicNavbar />}
      <div className="public-content">
        {children}
      </div>
      <AppFooter />
    </main>
  )
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <section className="footer-brand">
        <BrandLockup small />
        <p>Organiza tu estudio, mide tu avance y manten tu progreso.</p>
        <p className="footer-credit">Con mencion honorifica a Abel Marcial Palomino Espinoza por sus ideas, pruebas y feedback en la mejora de Trackedux.</p>
        <a href={`mailto:${CONTACT_LINKS.primaryEmail}`}>{CONTACT_LINKS.primaryEmail}</a>
      </section>
      <FooterColumn
        title="Producto"
        links={[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/dashboard', label: 'Cursos' },
          { href: '/dashboard', label: 'Examenes' },
          { href: '/recursos', label: 'Recursos' },
        ]}
      />
      <FooterColumn
        title="Informacion"
        links={[
          { href: '/acerca-de', label: 'Acerca de' },
          { href: '/privacidad', label: 'Privacidad' },
          { href: '/terminos', label: 'Terminos' },
          { href: '/contacto', label: 'Contacto' },
        ]}
      />
      <FooterColumn
        title="Desarrollador"
        links={[
          { href: CONTACT_LINKS.github, label: 'GitHub', external: true },
          { href: CONTACT_LINKS.instagram, label: 'Instagram', external: true },
        ]}
      />
    </footer>
  )
}

function FooterColumn({ title, links }) {
  return (
    <section className="footer-column">
      <h2>{title}</h2>
      {links.map((link) => (
        <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} key={`${title}-${link.label}`}>
          {link.label}
        </a>
      ))}
    </section>
  )
}

function HomePage({ exam, stats, userStats, daysLeft, weeksLeft, onOpenCourses }) {
  const examTemplate = getTemplateForExam(exam)
  const templateNotice = getTemplateNotice(exam, examTemplate)

  return (
    <main className="dashboard reveal">
      <section className="hero-section">
        <div className="hero-main">
          <div>
            <p className="eyebrow">Estas preparando</p>
            <h1>{exam.name}</h1>
            <p className="muted">Cada tema completado actualiza tu plan y deja visible lo urgente.</p>
          </div>
          <div className="dashboard-brand-art">
            <img src={logoArt} alt="" />
            <img src={heroArt} alt="" />
          </div>
        </div>
        <div className="hero-metrics">
          <Metric icon={<Clock size={20} />} value={daysLeft} label="dias" />
          <Metric icon={<CalendarDays size={20} />} value={weeksLeft} label="semanas" />
          <Metric icon={<Target size={20} />} value={`${stats.learned}/${stats.total}`} label="temas" />
        </div>
      </section>

      <section className="progress-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Progreso general</p>
            <h2>{stats.percent}% avanzado</h2>
          </div>
          <Button className="secondary-btn" onClick={onOpenCourses}>
            <BookOpen size={18} />
            Gestionar cursos
          </Button>
        </div>
        <ProgressRail percent={stats.percent} />
      </section>

      {templateNotice && (
        <section className="template-summary">
          <div>
            <p className="eyebrow">Plantilla {examTemplate.shortName ?? examTemplate.name}</p>
            <h2>{stats.percent}% de progreso general</h2>
          </div>
          <div className="template-summary-stats">
            <span>{exam.courses.length} cursos cargados</span>
            <span>{stats.total} temas</span>
          </div>
          <p>{templateNotice}</p>
        </section>
      )}

      <section className="insight-grid">
        <StreakCard streak={userStats.streak} progress={stats.percent} activeDays={userStats.activeDays} />
        <StudyStats userStats={userStats} />
      </section>

      <section className="course-overview">
        {exam.courses.length ? (
          exam.courses.map((course) => {
            const courseStats = getCourseStats(course)
            const urgency = getUrgency(course, exam.targetDate)

            return (
              <article className="course-card compact" key={course.id}>
                <div className="course-title-row">
                  <div>
                    <h3>{course.name}</h3>
                    <p>{courseStats.learned} de {courseStats.total} temas aprendidos</p>
                  </div>
                  <div className="course-card-badges">
                    <StatusBadge status={getCourseStatus(course)} />
                    <UrgencyBadge urgency={urgency} />
                  </div>
                </div>
                <MiniProgress percent={courseStats.percent} />
              </article>
            )
          })
        ) : (
          <div className="empty-state">
            <h2>Tu plan todavia esta limpio.</h2>
            <p>Agrega cursos y temas para que el tablero calcule progreso y urgencia.</p>
            <Button className="primary-btn" onClick={onOpenCourses}>
              <Plus size={18} />
              Anadir cursos
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}

function StreakCard({ streak, progress, activeDays }) {
  const palette = getFlamePalette(progress)
  const visibleFlames = Math.min(streak.current, 30)
  const hiddenFlames = Math.max(streak.current - visibleFlames, 0)
  const milestoneProgress = streak.nextMilestone ? clamp((streak.current / streak.nextMilestone) * 100) : 0

  return (
    <article
      className="streak-card"
      style={{
        '--flame-start': palette.start,
        '--flame-mid': palette.mid,
        '--flame-end': palette.end,
      }}
    >
      <div className="streak-head">
        <span className="streak-orb">
          <Flame size={30} fill="currentColor" />
        </span>
        <div>
          <p className="eyebrow">Racha diaria</p>
          <h2>{streak.current} dias seguidos</h2>
        </div>
      </div>

      <div className="flame-trail" aria-label={`${streak.current} dias de racha`}>
        {visibleFlames ? (
          Array.from({ length: visibleFlames }).map((_, index) => (
            <span className="flame-dot" key={index} style={{ animationDelay: `${index * 35}ms` }}>
              <Flame size={18} fill="currentColor" />
            </span>
          ))
        ) : (
          <span className="muted">Aun no hay racha activa</span>
        )}
        {hiddenFlames > 0 && <span className="flame-more">+{hiddenFlames}</span>}
      </div>

      <div className="streak-progress">
        <div>
          <span>{activeDays} dias activos</span>
          <strong>{streak.longest} mejor racha</strong>
        </div>
        <MiniProgress percent={milestoneProgress} />
      </div>

      {streak.current > 0 && streak.current % 10 === 0 ? (
        <div className="motivation-strip">
          <Sparkles size={17} />
          <span>{getMotivationMessage(streak.current)}</span>
        </div>
      ) : (
        <div className="motivation-strip quiet">
          <Target size={17} />
          <span>Siguiente mensaje en {streak.nextMilestone - streak.current} dia(s).</span>
        </div>
      )}
    </article>
  )
}

function StudyStats({ userStats }) {
  const topCourses = userStats.courseProgress
    .filter((course) => course.total > 0)
    .sort((a, b) => b.percent - a.percent || b.learned - a.learned)
    .slice(0, 4)

  return (
    <article className="stats-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Desde que empezaste</p>
          <h2>{userStats.globalPercent}% global</h2>
        </div>
        <span className="metric-icon"><BarChart3 size={20} /></span>
      </div>

      <div className="stats-strip">
        <StatTile value={userStats.learnedTopics} label="temas hechos" />
        <StatTile value={userStats.topicsThisWeek} label="esta semana" />
        <StatTile value={userStats.finishedCourses} label="cursos cerrados" />
      </div>

      <div className="best-course">
        <span>Curso mas fuerte</span>
        <strong>{userStats.bestCourse ? userStats.bestCourse.name : 'Sin datos aun'}</strong>
      </div>

      <div className="course-bars">
        {topCourses.length ? (
          topCourses.map((course) => (
            <div className="course-bar-row" key={course.id}>
              <div>
                <strong>{course.name}</strong>
                <span>{course.learned}/{course.total} temas</span>
              </div>
              <MiniProgress percent={course.percent} />
            </div>
          ))
        ) : (
          <p className="muted">Agrega temas para ver el avance por curso.</p>
        )}
      </div>
    </article>
  )
}

function StatTile({ value, label }) {
  return (
    <div className="stat-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function CoursesPage({
  exam,
  courseName,
  setCourseName,
  topicInputs,
  setTopicInputs,
  onAddCourse,
  onAddTopic,
  onSetTopicStatus,
  onRemoveTopic,
  onRemoveCourse,
  onImportTopics,
  actionLoading,
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(exam.courses[0]?.id ?? null)
  const [courseQuery, setCourseQuery] = useState('')
  const [topicQuery, setTopicQuery] = useState('')
  const [collapsedTopicGroups, setCollapsedTopicGroups] = useState({})
  const [importOpen, setImportOpen] = useState(false)

  const activeCourse = exam.courses.find((course) => course.id === selectedCourseId) ?? exam.courses[0] ?? null
  const filteredCourses = useMemo(() => {
    const query = courseQuery.trim().toLowerCase()
    if (!query) return exam.courses
    return exam.courses.filter((course) => course.name.toLowerCase().includes(query))
  }, [courseQuery, exam.courses])
  const filteredTopics = useMemo(() => {
    const query = topicQuery.trim().toLowerCase()
    if (!activeCourse) return []
    if (!query) return activeCourse.topics
    return activeCourse.topics.filter((topic) => topic.name.toLowerCase().includes(query))
  }, [activeCourse, topicQuery])
  const topicGroups = useMemo(() => {
    const groups = TOPIC_GROUPS.map((group) => ({ ...group, topics: [] }))
    const groupMap = new Map(groups.map((group) => [group.key, group]))

    filteredTopics.forEach((topic) => {
      const status = getTopicStatus(topic)
      const group = groupMap.get(status) ?? groupMap.get('pendiente')
      group.topics.push(topic)
    })

    return groups.filter((group) => group.topics.length)
  }, [filteredTopics])
  const activeStats = activeCourse ? getCourseStats(activeCourse) : null
  const activeUrgency = activeCourse ? getUrgency(activeCourse, exam.targetDate) : null
  const toggleTopicGroup = (groupKey, isCollapsed) => {
    if (!activeCourse) return
    const collapseKey = getTopicGroupCollapseKey(activeCourse.id, groupKey)
    setCollapsedTopicGroups((current) => ({
      ...current,
      [collapseKey]: !isCollapsed,
    }))
  }

  return (
    <main className="courses-page reveal">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Cursos de {exam.name}</p>
          <h1>Gestiona tu temario</h1>
        </div>
        <button className="secondary-btn import-topics-trigger" type="button" onClick={() => setImportOpen(true)}>
          <Upload size={18} />
          Importar temas
        </button>
        <form className="inline-form course-create-form" onSubmit={onAddCourse}>
          <input
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            placeholder="Nombre del curso"
          />
          <Button className="primary-btn" type="submit" loading={actionLoading === 'course'}>
            <Plus size={18} />
            Añadir
          </Button>
        </form>
      </section>

      {exam.courses.length ? (
        <section className="course-workspace">
          <aside className="course-browser" aria-label="Lista de cursos">
            <div className="course-search">
              <Search size={17} />
              <input
                value={courseQuery}
                onChange={(event) => setCourseQuery(event.target.value)}
                placeholder="Buscar curso"
              />
            </div>

            <div className="course-browser-list">
              {filteredCourses.map((course) => {
                const stats = getCourseStats(course)

                return (
                  <button
                    type="button"
                    className={course.id === activeCourse?.id ? 'course-list-item active' : 'course-list-item'}
                    onClick={() => {
                      setSelectedCourseId(course.id)
                      setTopicQuery('')
                    }}
                    key={course.id}
                  >
                    <span>{course.name}</span>
                    <small>{stats.learned}/{stats.total} temas</small>
                    <StatusBadge status={getCourseStatus(course)} className="course-list-status" />
                    <MiniProgress percent={stats.percent} />
                  </button>
                )
              })}
            </div>

            {!filteredCourses.length && (
              <div className="empty-state small">
                <h2>Sin coincidencias</h2>
                <p>Prueba con otro nombre de curso.</p>
              </div>
            )}
          </aside>

          {activeCourse && (
            <article className="course-detail">
              <div className="course-detail-head">
                <div>
                  <p className="eyebrow">Curso seleccionado</p>
                  <h2>{activeCourse.name}</h2>
                  <p>{activeStats.learned} de {activeStats.total} temas completados</p>
                </div>
                <button className="icon-btn" aria-label={`Eliminar ${activeCourse.name}`} onClick={() => onRemoveCourse(activeCourse.id)}>
                  {actionLoading === `remove-${activeCourse.id}` ? <LoaderCircle size={18} /> : <Trash2 size={18} />}
                </button>
              </div>

              <MiniProgress percent={activeStats.percent} />

              <div className="course-detail-meta">
                <UrgencyBadge urgency={activeUrgency} />
                <div className="course-count-card">
                  <strong>{activeStats.percent}%</strong>
                  <span>avance del curso</span>
                </div>
                <StatusBadge status={getCourseStatus(activeCourse)} />
              </div>

              <div className="topic-toolbar">
                <div className="course-search">
                  <Search size={17} />
                  <input
                    value={topicQuery}
                    onChange={(event) => setTopicQuery(event.target.value)}
                    placeholder="Buscar tema"
                  />
                </div>
                <div className="topic-form">
                  <input
                    value={topicInputs[activeCourse.id] ?? ''}
                    onChange={(event) => setTopicInputs((current) => ({ ...current, [activeCourse.id]: event.target.value }))}
                    placeholder="Añadir tema"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onAddTopic(activeCourse.id)
                      }
                    }}
                  />
                  <button className="icon-btn add-topic-btn" type="button" onClick={() => onAddTopic(activeCourse.id)}>
                    {actionLoading === `topic-${activeCourse.id}` ? <LoaderCircle size={18} /> : <Plus size={18} />}
                  </button>
                </div>
              </div>

              <div className="topic-groups">
                {topicGroups.map((group) => (
                  <section className={`topic-group ${group.key}`} key={group.key}>
                    {(() => {
                      const collapseKey = getTopicGroupCollapseKey(activeCourse.id, group.key)
                      const hasOtherActiveGroups = topicGroups.some((topicGroup) => topicGroup.key !== 'pendiente')
                      const shouldStartCollapsed = group.key === 'pendiente' && group.topics.length > 12 && hasOtherActiveGroups
                      const isCollapsed = collapsedTopicGroups[collapseKey] ?? shouldStartCollapsed
                      const panelId = `${collapseKey}-topics`

                      return (
                        <>
                          <button
                            type="button"
                            className="topic-group-head"
                            aria-expanded={!isCollapsed}
                            aria-controls={panelId}
                            onClick={() => toggleTopicGroup(group.key, isCollapsed)}
                          >
                            <span className="topic-group-title">
                              {isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                              <span className="topic-group-label">{group.title}</span>
                            </span>
                            <span className="topic-group-count">{group.topics.length}</span>
                          </button>

                          {!isCollapsed && (
                            <div className="topic-list comfortable" id={panelId}>
                              {group.topics.map((topic) => (
                                <div className={isCompletedTopic(topic) ? 'topic done' : 'topic'} key={topic.id}>
                                  <div className="topic-head">
                                    <span className="topic-state-dot" data-status={getTopicStatus(topic)} />
                                    <span className="topic-name">{topic.name}</span>
                                    <StatusBadge status={getTopicStatus(topic)} className="topic-current-status" />
                                    <div className="topic-actions">
                                      {actionLoading === `toggle-${topic.id}` && <LoaderCircle className="inline-spinner" size={16} />}
                                      <button
                                        className="icon-btn topic-delete-btn"
                                        type="button"
                                        aria-label={`Eliminar tema ${topic.name}`}
                                        onClick={() => onRemoveTopic(activeCourse.id, topic.id)}
                                        disabled={actionLoading === `delete-topic-${topic.id}`}
                                      >
                                        {actionLoading === `delete-topic-${topic.id}` ? <LoaderCircle size={16} /> : <Trash2 size={16} />}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="topic-status-controls" aria-label={`Estado de ${topic.name}`}>
                                    {TOPIC_STATUS_OPTIONS.map((status) => (
                                      <button
                                        type="button"
                                        className={getTopicStatus(topic) === status.value ? 'active' : ''}
                                        data-status={status.value}
                                        onClick={() => onSetTopicStatus(activeCourse.id, topic.id, status.value)}
                                        disabled={actionLoading === `toggle-${topic.id}`}
                                        key={status.value}
                                      >
                                        {status.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </section>
                ))}
              </div>

              {!topicGroups.length && (
                <div className="empty-state small">
                  <h2>No encontre temas</h2>
                  <p>Busca otro termino o agrega un tema nuevo a este curso.</p>
                </div>
              )}
            </article>
          )}
        </section>
      ) : (
        <div className="empty-state">
          <h2>Aun no hay cursos</h2>
          <p>Empieza con el primer curso de tu examen y luego agrega sus temas.</p>
        </div>
      )}

      {importOpen && (
        <ImportTopicsModal
          exam={exam}
          onClose={() => setImportOpen(false)}
          onImportTopics={onImportTopics}
          loading={actionLoading === 'import-topics'}
        />
      )}
    </main>
  )
}

function ImportTopicsModal({ exam, onClose, onImportTopics, loading }) {
  const [csvRows, setCsvRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [createMissingCourses, setCreateMissingCourses] = useState(true)
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  const previewRows = useMemo(() => (
    validateImportedTopicRows(csvRows, exam.courses, { createMissingCourses, skipDuplicates })
  ), [createMissingCourses, csvRows, exam.courses, skipDuplicates])

  const errorCount = previewRows.filter((row) => row.errors.length).length
  const skippedCount = previewRows.filter((row) => row.skipped || row.errors.length).length
  const importableCount = previewRows.filter((row) => !row.errors.length && !row.skipped).length

  const downloadTemplate = () => {
    const blob = new Blob([TOPICS_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'trackedux_plantilla_temas.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    setFileError('')
    setCsvRows([])
    setFileName(file?.name ?? '')

    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Por ahora la importacion acepta archivos CSV. Puedes convertir tu Excel a CSV y volver a intentarlo.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsedRows = parseCsvTopics(reader.result)
        if (!parsedRows.length) {
          setFileError('El CSV no tiene filas para importar.')
          return
        }
        setCsvRows(parsedRows)
      } catch {
        setFileError('No se pudo leer el CSV. Revisa el formato de columnas.')
      }
    }
    reader.onerror = () => setFileError('No se pudo leer el archivo seleccionado.')
    reader.readAsText(file)
  }

  const handleConfirm = async () => {
    const result = await onImportTopics({ rows: previewRows, createMissingCourses, skipDuplicates })
    if (result) onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-topics-title">
        <button className="icon-btn close-btn" aria-label="Cerrar" onClick={onClose} disabled={loading}>
          <X size={18} />
        </button>
        <p className="eyebrow">Carga masiva</p>
        <h2 id="import-topics-title">Importar temas desde CSV</h2>
        <p className="muted">
          Usa las columnas curso, tema, subtema, importancia, estado y notas. Revisa la vista previa antes de guardar.
        </p>

        <div className="import-actions">
          <button className="secondary-btn" type="button" onClick={downloadTemplate}>
            <FileDown size={18} />
            Descargar plantilla CSV
          </button>
          <label className="file-picker">
            <Upload size={18} />
            <span>{fileName || 'Subir archivo CSV'}</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={loading} />
          </label>
        </div>

        <div className="import-options">
          <label>
            <input
              type="checkbox"
              checked={createMissingCourses}
              onChange={(event) => setCreateMissingCourses(event.target.checked)}
            />
            Crear cursos faltantes automaticamente
          </label>
          <label>
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(event) => setSkipDuplicates(event.target.checked)}
            />
            Saltar duplicados recomendados
          </label>
        </div>

        {fileError && <div className="template-warning">{fileError}</div>}

        {previewRows.length > 0 && (
          <>
            <div className="import-summary">
              <span>{importableCount} temas listos</span>
              <span>{skippedCount} filas omitidas</span>
              <span>{errorCount} con errores</span>
            </div>
            <div className="import-preview" role="region" aria-label="Vista previa de temas importados">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Curso</th>
                    <th>Tema</th>
                    <th>Estado</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 12).map((row) => (
                    <tr className={row.errors.length ? 'has-error' : row.skipped ? 'is-skipped' : ''} key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.courseName || '-'}</td>
                      <td>{row.topicName || '-'}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{row.errors[0] ?? row.warnings[0] ?? 'Lista para importar'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length > 12 && <p className="muted">Mostrando 12 de {previewRows.length} filas.</p>}
            </div>
          </>
        )}

        <div className="modal-actions import-modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <Button className="primary-btn" type="button" onClick={handleConfirm} loading={loading} disabled={!importableCount}>
            <Upload size={18} />
            Confirmar importacion
          </Button>
        </div>
      </section>
    </div>
  )
}

function WeeklySimulationPage({
  simulations,
  loading,
  error,
  isAdmin,
  activeSimulationId,
  setActiveSimulationId,
  setNavigationLocked,
  draft,
  setDraft,
  subjects,
  subjectsReady,
  subjectsLoading,
  subjectSchemaReady,
  durationSchemaReady,
  gradingSchemaReady,
  answers,
  results,
  attempts,
  rankings,
  currentUserId,
  subjectAnalytics,
  subjectAnalyticsLoading,
  subjectAnalyticsErrors,
  onNewSimulation,
  onEditSimulation,
  onSaveSimulation,
  onDeleteSimulation,
  onResetAttempt,
  onSetAnswer,
  onSubmitAttempt,
  actionLoading,
}) {
  const [mode, setMode] = useState('student')
  const [simulationTimers, setSimulationTimers] = useState({})
  const [timedOutSimulations, setTimedOutSimulations] = useState({})
  const [startedSimulationId, setStartedSimulationId] = useState(null)
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const [activeEditorQuestionIndex, setActiveEditorQuestionIndex] = useState(0)
  const [editorQuestionQuery, setEditorQuestionQuery] = useState('')
  const [selectedWeightSubjectId, setSelectedWeightSubjectId] = useState('')
  const [studentView, setStudentView] = useState('library')
  const [selectedAttemptId, setSelectedAttemptId] = useState('latest')
  const [studentSimulationQuery, setStudentSimulationQuery] = useState('')
  const [statsQuery, setStatsQuery] = useState('')
  const [statsFilter, setStatsFilter] = useState('all')
  const [completionFeedback, setCompletionFeedback] = useState(null)
  const visibleSimulations = simulations.filter((simulation) => simulation.isPublished)
  const filteredVisibleSimulations = visibleSimulations.filter((simulation) => {
    const query = studentSimulationQuery.trim().toLowerCase()
    if (!query) return true

    return (
      simulation.title.toLowerCase().includes(query)
      || simulation.description.toLowerCase().includes(query)
      || simulation.questions.some((question) => (question.subjectName || '').toLowerCase().includes(query))
    )
  })
  const managedSimulations = simulations
  const activeSimulation = visibleSimulations.find((simulation) => simulation.id === activeSimulationId) ?? visibleSimulations[0] ?? null
  const activeAnswers = activeSimulation ? (answers[activeSimulation.id] ?? {}) : {}
  const activeAttempts = activeSimulation ? attempts.filter((attempt) => attempt.simulationId === activeSimulation.id) : []
  const currentAttemptResult = activeSimulation ? results[activeSimulation.id] : null
  const activeResult = useMemo(() => {
    if (!activeSimulation) return null
    if (currentAttemptResult) return currentAttemptResult

    const latestAttempt = activeAttempts[0]
    if (!latestAttempt?.answers) return null

    return {
      score: latestAttempt.score,
      correctCount: latestAttempt.correctCount,
      questionCount: latestAttempt.questionCount,
      durationSeconds: latestAttempt.durationSeconds,
      subjectStats: calculateSubjectStats(latestAttempt.answers, activeSimulation.questions),
    }
  }, [activeAttempts, activeSimulation, currentAttemptResult])
  const activeDurationSeconds = activeSimulation ? Math.max(60, Math.round(activeSimulation.durationMinutes || 60) * 60) : 0
  const remainingSeconds = activeSimulation
    ? simulationTimers[activeSimulation.id] ?? activeDurationSeconds
    : 0
  const isCurrentAttemptClosed = Boolean(currentAttemptResult)
  const isExamRunning = Boolean(activeSimulation && startedSimulationId === activeSimulation.id && !isCurrentAttemptClosed)
  const timerTone = remainingSeconds <= 60 ? 'critical' : remainingSeconds <= 300 ? 'warning' : ''
  const activeQuestion = activeSimulation?.questions[activeQuestionIndex] ?? activeSimulation?.questions[0] ?? null
  const activeDraftQuestion = draft.questions[activeEditorQuestionIndex] ?? draft.questions[0] ?? null
  const activeRankingRows = activeSimulation
    ? (rankings ?? [])
      .filter((row) => row.simulationId === activeSimulation.id)
      .sort((a, b) => b.firstAttemptScore - a.firstAttemptScore || b.firstAttemptCorrectCount - a.firstAttemptCorrectCount || a.displayName.localeCompare(b.displayName))
      .map((row, index) => ({ ...row, rank: index + 1 }))
    : []
  const activeUserRank = activeRankingRows.find((row) => row.userId === currentUserId)?.rank ?? null
  const activeSubjectAnalytics = activeSimulation ? (subjectAnalytics?.[activeSimulation.id] ?? []) : []
  const activeAttemptDetails = useMemo(() => {
    if (!activeSimulation) return []

    const savedAttempts = activeAttempts.map((attempt, index) => ({
      ...attempt,
      attemptLabel: `Intento ${activeAttempts.length - index}`,
      subjectStats: calculateSubjectStats(attempt.answers, activeSimulation.questions),
      isCurrent: false,
    }))

    if (!currentAttemptResult) return savedAttempts

    return [
      {
        id: 'current-result',
        simulationId: activeSimulation.id,
        attemptLabel: 'Resultado reciente',
        answers: activeAnswers,
        score: currentAttemptResult.score,
        correctCount: currentAttemptResult.correctCount,
        questionCount: currentAttemptResult.questionCount,
        durationSeconds: currentAttemptResult.durationSeconds,
        completedAt: new Date().toISOString(),
        subjectStats: currentAttemptResult.subjectStats,
        isCurrent: true,
      },
      ...savedAttempts,
    ]
  }, [activeAnswers, activeAttempts, activeSimulation, currentAttemptResult])
  const selectedAttempt = useMemo(() => {
    if (!activeAttemptDetails.length) return null
    if (selectedAttemptId === 'latest') return activeAttemptDetails[0]
    return activeAttemptDetails.find((attempt) => attempt.id === selectedAttemptId) ?? activeAttemptDetails[0]
  }, [activeAttemptDetails, selectedAttemptId])
  const previousAttempt = useMemo(() => {
    if (!selectedAttempt) return null
    const selectedIndex = activeAttemptDetails.findIndex((attempt) => attempt.id === selectedAttempt.id)
    return selectedIndex >= 0 ? activeAttemptDetails[selectedIndex + 1] ?? null : null
  }, [activeAttemptDetails, selectedAttempt])
  const selectedSubjectComparisons = useMemo(() => {
    const previousBySubject = new Map((previousAttempt?.subjectStats ?? []).map((stat) => [stat.subjectKey, stat]))

    return buildSubjectComparisons(selectedAttempt?.subjectStats ?? [], activeSubjectAnalytics).map((stat) => {
      const previous = previousBySubject.get(stat.subjectKey)
      const internalDifference = previous ? Number((stat.percentage - previous.percentage).toFixed(1)) : null

      return {
        ...stat,
        previousPercentage: previous?.percentage ?? null,
        internalDifference,
      }
    })
  }, [activeSubjectAnalytics, previousAttempt, selectedAttempt])
  const selectedDiagnosis = useMemo(
    () => buildCourseDiagnosis(selectedAttempt?.subjectStats ?? [], selectedSubjectComparisons),
    [selectedAttempt, selectedSubjectComparisons],
  )
  const filteredSelectedSubjects = useMemo(() => {
    const query = statsQuery.trim().toLowerCase()

    return selectedSubjectComparisons.filter((stat) => {
      const matchesQuery = !query || stat.subjectName.toLowerCase().includes(query)
      const matchesFilter = statsFilter === 'all'
        || (statsFilter === 'critical' && (stat.status.key === 'critical' || stat.priority.key === 'max'))
        || (statsFilter === 'reinforce' && (stat.status.key === 'regular' || stat.priority.key === 'soon'))
        || (statsFilter === 'strong' && stat.status.key === 'excellent')

      return matchesQuery && matchesFilter
    })
  }, [selectedSubjectComparisons, statsFilter, statsQuery])
  const selectedScorePercentage = selectedAttempt && activeSimulation?.scoreMax
    ? Math.round((selectedAttempt.score / activeSimulation.scoreMax) * 100)
    : 0
  const bestAttemptScore = activeAttempts.length
    ? Math.max(...activeAttempts.map((attempt) => attempt.score))
    : selectedAttempt?.score ?? 0
  const averageAttemptScore = activeAttempts.length
    ? Number((activeAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / activeAttempts.length).toFixed(2))
    : selectedAttempt?.score ?? 0
  const strongestSubjects = selectedSubjectComparisons.filter((stat) => stat.status.key === 'excellent')
  const criticalSubjects = selectedSubjectComparisons.filter((stat) => stat.status.key === 'critical' || stat.priority.key === 'max')
  const hasDraftQuestionsWithoutSubject = draft.questions.some((question) => !question.subjectId)
  const subjectSelectDisabled = !subjectSchemaReady || !subjectsReady || subjectsLoading
  const subjectById = useMemo(
    () => new Map((subjects ?? []).map((subject) => [subject.id, subject])),
    [subjects],
  )
  const getDraftQuestionSubject = (question) => {
    const subject = subjectById.get(question?.subjectId)
    return subject?.name || question?.subjectName || UNASSIGNED_SUBJECT.name
  }
  const filteredDraftQuestionIndexes = draft.questions
    .map((question, index) => ({ question, index, subjectName: getDraftQuestionSubject(question) }))
    .filter(({ question, index, subjectName }) => {
      const query = editorQuestionQuery.trim().toLowerCase()
      if (!query) return true
      return (
        String(index + 1).includes(query)
        || question.prompt.toLowerCase().includes(query)
        || subjectName.toLowerCase().includes(query)
      )
    })
  const draftQuestionGroups = filteredDraftQuestionIndexes.reduce((groups, item) => {
    const key = item.subjectName || UNASSIGNED_SUBJECT.name
    groups[key] = groups[key] ?? []
    groups[key].push(item)
    return groups
  }, {})
  const draftSubjectOptions = Array.from(draft.questions.reduce((groups, question) => {
    if (!question.subjectId) return groups
    const current = groups.get(question.subjectId) ?? {
      subjectId: question.subjectId,
      subjectName: getDraftQuestionSubject(question),
      questionCount: 0,
    }

    current.questionCount += 1
    groups.set(question.subjectId, current)
    return groups
  }, new Map()).values())
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'es'))
  const activeWeightSubjectId = draftSubjectOptions.some((subject) => subject.subjectId === selectedWeightSubjectId)
    ? selectedWeightSubjectId
    : draftSubjectOptions[0]?.subjectId || ''
  const activeWeightBonus = Number(draft.gradingWeights?.[activeWeightSubjectId] ?? 0)
  const draftPointPreview = useMemo(() => {
    const previewQuestions = draft.questions.map((question) => ({
      ...question,
      subjectName: getDraftQuestionSubject(question),
    }))

    return calculateQuestionPointValues({
      ...draft,
      questions: previewQuestions,
      scoreMax: Number(draft.scoreMax) || 20,
      gradingWeights: draft.gradingWeights,
    })
  }, [draft, subjectById])
  const selectedWeightPreview = draftPointPreview.subjectPointSummary
    .find((subject) => subject.subjectId === activeWeightSubjectId)
  const unassignedDraftQuestionCount = draft.questions.filter((question) => !question.subjectId).length
  const updateGradingWeight = (subjectId, value) => {
    const amount = Math.max(0, Number(value) || 0)

    setDraft((current) => {
      const nextWeights = { ...normalizeGradingWeights(current.gradingWeights) }
      if (!subjectId || amount <= 0) {
        delete nextWeights[subjectId]
      } else {
        nextWeights[subjectId] = Number(amount.toFixed(2))
      }

      return { ...current, gradingWeights: nextWeights }
    })
  }

  useEffect(() => {
    setNavigationLocked?.(isExamRunning)
    return () => setNavigationLocked?.(false)
  }, [isExamRunning, setNavigationLocked])

  useEffect(() => {
    setSelectedAttemptId('latest')
    setStatsQuery('')
    setStatsFilter('all')
    setCompletionFeedback(null)
  }, [activeSimulation?.id])

  useEffect(() => {
    if (!completionFeedback) return undefined

    const timeout = window.setTimeout(() => {
      setStudentView('stats')
      setSelectedAttemptId('latest')
      setCompletionFeedback(null)
    }, 2300)

    return () => window.clearTimeout(timeout)
  }, [completionFeedback])

  useEffect(() => {
    if (activeEditorQuestionIndex > draft.questions.length - 1) {
      setActiveEditorQuestionIndex(Math.max(0, draft.questions.length - 1))
    }
  }, [activeEditorQuestionIndex, draft.questions.length])

  useEffect(() => {
    if (!activeSimulation || !isExamRunning) return

    setSimulationTimers((current) => (
      current[activeSimulation.id] == null
        ? { ...current, [activeSimulation.id]: activeDurationSeconds }
        : current
    ))
  }, [activeDurationSeconds, activeSimulation, isExamRunning])

  useEffect(() => {
    if (!activeSimulation || !isExamRunning) return undefined

    const interval = window.setInterval(() => {
      setSimulationTimers((current) => {
        const currentRemaining = current[activeSimulation.id] ?? activeDurationSeconds
        return {
          ...current,
          [activeSimulation.id]: Math.max(0, currentRemaining - 1),
        }
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [activeDurationSeconds, activeSimulation, isExamRunning])

  useEffect(() => {
    if (!activeSimulation || !isExamRunning || remainingSeconds > 0 || timedOutSimulations[activeSimulation.id]) return
    if (actionLoading === `submit-simulation-${activeSimulation.id}`) return

    setTimedOutSimulations((current) => ({ ...current, [activeSimulation.id]: true }))
    const result = onSubmitAttempt(activeSimulation, {
      allowIncomplete: true,
      reason: 'timeout',
      durationSeconds: activeDurationSeconds,
    })
    if (result) {
      setStartedSimulationId(null)
      setCompletionFeedback({
        ...getSimulationScoreFeedback(result.score, activeSimulation.scoreMax),
        eyebrow: 'Tiempo finalizado',
        score: result.score,
        scoreMax: activeSimulation.scoreMax,
        correctCount: result.correctCount,
        questionCount: result.questionCount,
      })
    }
  }, [actionLoading, activeDurationSeconds, activeSimulation, isExamRunning, onSubmitAttempt, remainingSeconds, timedOutSimulations])

  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const updateQuestion = (index, patch) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => (
        questionIndex === index ? { ...question, ...patch } : question
      )),
    }))
  }
  const updateQuestionOption = (index, option, value) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => (
        questionIndex === index
          ? { ...question, options: { ...question.options, [option]: value } }
          : question
      )),
    }))
  }
  const addQuestion = () => {
    const nextQuestionIndex = draft.questions.length
    setDraft((current) => ({
      ...current,
      questions: [...current.questions, createEmptyQuestion(current.questions.length)],
    }))
    setActiveEditorQuestionIndex(nextQuestionIndex)
  }
  const removeQuestion = (index) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.length > 1
        ? current.questions.filter((_, questionIndex) => questionIndex !== index)
        : current.questions,
    }))
    setActiveEditorQuestionIndex((current) => (
      index < current ? current - 1 : Math.min(current, Math.max(0, draft.questions.length - 2))
    ))
  }
  const startActiveSimulation = () => {
    if (!activeSimulation) return

    onResetAttempt?.(activeSimulation.id)
    setStartedSimulationId(activeSimulation.id)
    setActiveQuestionIndex(0)
    setStudentView('detail')
    setCompletionFeedback(null)
    setTimedOutSimulations((current) => ({ ...current, [activeSimulation.id]: false }))
    setSimulationTimers((current) => ({ ...current, [activeSimulation.id]: activeDurationSeconds }))
  }
  const goToQuestion = (index) => {
    if (!activeSimulation) return
    setActiveQuestionIndex(Math.min(Math.max(index, 0), activeSimulation.questions.length - 1))
  }
  const goToPreviousQuestion = () => goToQuestion(activeQuestionIndex - 1)
  const goToNextQuestion = () => goToQuestion(activeQuestionIndex + 1)
  const finishActiveSimulation = () => {
    if (!activeSimulation) return
    const elapsedSeconds = Math.min(
      activeDurationSeconds,
      Math.max(1, activeDurationSeconds - remainingSeconds),
    )
    const result = onSubmitAttempt(activeSimulation, { durationSeconds: elapsedSeconds })
    if (!result) return

    setStartedSimulationId(null)
    setCompletionFeedback({
      ...getSimulationScoreFeedback(result.score, activeSimulation.scoreMax),
      score: result.score,
      scoreMax: activeSimulation.scoreMax,
      correctCount: result.correctCount,
      questionCount: result.questionCount,
    })
  }

  if (isExamRunning && activeSimulation && activeQuestion) {
    const answeredCount = Object.keys(activeAnswers).length

    return (
      <main className="simulation-exam-screen">
        <header className="simulation-exam-topbar">
          <div>
            <p className="eyebrow">Simulacro en curso</p>
            <h1>{activeSimulation.title}</h1>
          </div>
          <span className={`simulation-exam-timer ${timerTone}`.trim()}>
            <Clock size={18} />
            {formatDuration(remainingSeconds)}
          </span>
        </header>

        <section className="simulation-exam-layout">
          <article className="simulation-exam-question">
            <div className="simulation-question-head">
              <span>{activeQuestionIndex + 1}</span>
              <div className="simulation-question-copy">
                <p>{activeQuestion.prompt}</p>
                <small>{activeQuestion.subjectName || UNASSIGNED_SUBJECT.name}</small>
              </div>
            </div>

            {activeQuestion.imageUrl && <img src={activeQuestion.imageUrl} alt="" />}

            <div className="simulation-options">
              {ANSWER_OPTIONS.map((option) => (
                <button
                  className={activeAnswers[activeQuestion.id] === option ? 'active' : ''}
                  type="button"
                  onClick={() => onSetAnswer(activeSimulation.id, activeQuestion.id, option)}
                  key={option}
                >
                  <strong>{option}</strong>
                  <span>{activeQuestion.options[option]}</span>
                </button>
              ))}
            </div>

            <div className="simulation-exam-actions">
              <button className="secondary-btn" type="button" onClick={goToPreviousQuestion} disabled={activeQuestionIndex === 0}>
                Atras
              </button>
              <button className="secondary-btn" type="button" onClick={goToNextQuestion} disabled={activeQuestionIndex >= activeSimulation.questions.length - 1}>
                Siguiente
              </button>
            </div>
          </article>

          <aside className="simulation-question-map">
            <div>
              <p className="eyebrow">Navegación</p>
              <h2>{answeredCount}/{activeSimulation.questions.length}</h2>
              <span>preguntas respondidas</span>
            </div>
            <div className="question-map-grid">
              {activeSimulation.questions.map((question, index) => (
                <button
                  className={[
                    index === activeQuestionIndex ? 'active' : '',
                    activeAnswers[question.id] ? 'answered' : '',
                  ].filter(Boolean).join(' ')}
                  type="button"
                  onClick={() => goToQuestion(index)}
                  key={question.id}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <Button
              className="primary-btn full"
              type="button"
              onClick={finishActiveSimulation}
              loading={actionLoading === `submit-simulation-${activeSimulation.id}`}
            >
              <Check size={18} />
              Finalizar prueba
            </Button>
          </aside>
        </section>
      </main>
    )
  }

  if (completionFeedback) {
    return (
      <main className={`simulation-completion-screen ${completionFeedback.tone}`}>
        <section className="simulation-completion-card">
          <div className="completion-orbit">
            <LoaderCircle size={34} />
          </div>
          <p className="eyebrow">{completionFeedback.eyebrow}</p>
          <h1>{completionFeedback.title}</h1>
          <strong>{completionFeedback.score}/{completionFeedback.scoreMax}</strong>
          <p>{completionFeedback.correctCount} de {completionFeedback.questionCount} correctas. {completionFeedback.message}</p>
          <div className="completion-progress" aria-hidden="true">
            <span />
          </div>
          <small>Preparando tu diagnóstico por curso, comparación global e historial de intentos...</small>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard simulation-page reveal">
      <section className="simulation-hero">
        <div>
          <p className="eyebrow">Simulacros generales</p>
          <h1>Simulacros</h1>
          <p>Prácticas publicadas para todos los usuarios, con nota inmediata y ranking global por simulacro.</p>
        </div>
        {isAdmin && <span className="admin-badge">Admin de simulacros</span>}
      </section>

      {error && <div className="template-warning">{error}</div>}

      {isAdmin && (
        <div className="simulation-mode-switch" role="tablist" aria-label="Modo de simulacros">
          <button className={mode === 'student' ? 'active' : ''} type="button" onClick={() => setMode('student')}>
            <BookOpen size={17} />
            Vista estudiantes
          </button>
          <button className={mode === 'admin' ? 'active' : ''} type="button" onClick={() => setMode('admin')}>
            <Settings size={17} />
            Panel admin
          </button>
        </div>
      )}

      {isAdmin && mode === 'admin' ? (
        <section className="simulation-admin-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Crear y editar</p>
              <h2>{draft.id ? 'Editar simulacro' : 'Nuevo simulacro'}</h2>
            </div>
            <button className="secondary-btn" type="button" onClick={onNewSimulation}>
              <Plus size={18} />
              Nuevo
            </button>
          </div>

          <form className="simulation-editor" onSubmit={onSaveSimulation}>
            <div className="simulation-editor-grid">
              <label>
                Nombre del simulacro
                <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Ej. Simulacro UNI 01" />
              </label>
              <label>
                Puntaje máximo
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="0.25"
                  value={draft.scoreMax}
                  onChange={(event) => updateDraft('scoreMax', event.target.value)}
                />
              </label>
              <label>
                Duración del examen (min)
                <input
                  type="number"
                  min="1"
                  max="300"
                  step="1"
                  required
                  value={draft.durationMinutes}
                  onChange={(event) => updateDraft('durationMinutes', event.target.value)}
                />
              </label>
              <label className="simulation-publish-toggle">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(event) => updateDraft('isPublished', event.target.checked)}
                />
                Publicado para estudiantes
              </label>
            </div>

            <label>
              Descripción
              <textarea
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                placeholder="Describe el alcance, las reglas o la duración sugerida."
              />
            </label>

            <ImageInput label="Imagen del simulacro" value={draft.imageUrl} onChange={(value) => updateDraft('imageUrl', value)} />
            {draft.imageUrl && <img className="simulation-draft-cover-preview" src={draft.imageUrl} alt="" />}

            {!subjectSchemaReady && (
              <div className="template-warning">
                Ejecuta supabase/simulado_subject_analytics.sql para activar cursos por pregunta y comparativas.
              </div>
            )}

            {!durationSchemaReady && (
              <div className="template-warning">
                Ejecuta supabase/simulado_subject_analytics.sql para guardar la duración de cada simulacro.
              </div>
            )}

            {subjectSchemaReady && hasDraftQuestionsWithoutSubject && (
              <div className="template-warning">
                Hay preguntas sin curso asignado. Esto afectará las estadísticas por curso.
              </div>
            )}

            {!gradingSchemaReady && (
              <div className="template-warning">
                Ejecuta supabase/simulation_grading_weights.sql para activar la ponderación de nota por curso.
              </div>
            )}

            <section className="grading-weight-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Validación de nota</p>
                  <h3>Ponderación por curso</h3>
                  <p>Sube el valor de cursos clave y el resto se ajusta para que la nota máxima siga sumando {Number(draft.scoreMax) || 20} puntos.</p>
                </div>
              </div>

              <div className="grading-weight-controls">
                <label>
                  Curso a ponderar
                  <select
                    value={activeWeightSubjectId}
                    onChange={(event) => setSelectedWeightSubjectId(event.target.value)}
                    disabled={!draftSubjectOptions.length || !gradingSchemaReady}
                  >
                    {!draftSubjectOptions.length && <option value="">Asigna cursos a tus preguntas</option>}
                    {draftSubjectOptions.map((subject) => (
                      <option value={subject.subjectId} key={subject.subjectId}>
                        {subject.subjectName} ({subject.questionCount} preg.)
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Aumento por pregunta
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.25"
                    value={activeWeightBonus}
                    onChange={(event) => updateGradingWeight(activeWeightSubjectId, event.target.value)}
                    disabled={!activeWeightSubjectId || !gradingSchemaReady}
                  />
                </label>

                <div className="grading-weight-preview">
                  <span>Valor actual</span>
                  <strong>{selectedWeightPreview ? `${selectedWeightPreview.pointPerQuestion.toFixed(2)} pts` : 'Sin curso'}</strong>
                  <small>por pregunta seleccionada</small>
                </div>
              </div>

              <div className="grading-weight-list">
                {draftPointPreview.subjectPointSummary.map((subject) => (
                  <article className={subject.bonus > 0 ? 'weighted' : ''} key={subject.subjectId || subject.subjectName}>
                    <div>
                      <strong>{subject.subjectName}</strong>
                      <span>{subject.questionCount} pregunta(s)</span>
                    </div>
                    <div>
                      <strong>{subject.pointPerQuestion.toFixed(2)} pts</strong>
                      <span>{subject.totalPoints.toFixed(2)} pts total</span>
                    </div>
                    {subject.bonus > 0 && <em>+{subject.bonus.toFixed(2)} por pregunta</em>}
                  </article>
                ))}
              </div>
            </section>

            <section className="question-editor-workbench">
              <aside className="question-editor-map" aria-label="Navegación de preguntas">
                <div className="question-map-head">
                  <div>
                    <p className="eyebrow">Mapa de preguntas</p>
                    <h3>{draft.questions.length} pregunta(s)</h3>
                  </div>
                  {unassignedDraftQuestionCount > 0 && (
                    <span>{unassignedDraftQuestionCount} sin curso</span>
                  )}
                </div>

                <label className="question-map-search">
                  Buscar por número, curso o texto
                  <div className="course-search">
                    <Search size={17} />
                    <input
                      value={editorQuestionQuery}
                      onChange={(event) => setEditorQuestionQuery(event.target.value)}
                      placeholder="Ej. Álgebra, 32..."
                    />
                  </div>
                </label>

                <div className="admin-question-groups">
                  {Object.entries(draftQuestionGroups).map(([subjectName, items]) => (
                    <section className="admin-question-group" key={subjectName}>
                      <div>
                        <strong>{subjectName}</strong>
                        <span>{items.length}</span>
                      </div>
                      <div className="admin-question-grid">
                        {items.map(({ question, index }) => (
                          <button
                            className={[
                              index === activeEditorQuestionIndex ? 'active' : '',
                              question.subjectId ? 'assigned' : 'missing-subject',
                            ].filter(Boolean).join(' ')}
                            type="button"
                            onClick={() => setActiveEditorQuestionIndex(index)}
                            key={question.id}
                          >
                            {index + 1}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}

                  {!filteredDraftQuestionIndexes.length && (
                    <div className="empty-state small">
                      <h2>Sin coincidencias</h2>
                      <p>Prueba con otro número, curso o fragmento de texto.</p>
                    </div>
                  )}
                </div>
              </aside>

              {activeDraftQuestion && (
                <article className="question-editor active-question-editor" key={activeDraftQuestion.id}>
                  <div className="question-editor-head">
                    <div>
                      <span>Pregunta {activeEditorQuestionIndex + 1}</span>
                      <small>{getDraftQuestionSubject(activeDraftQuestion)}</small>
                    </div>
                    <div className="question-editor-head-actions">
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label="Pregunta anterior"
                        onClick={() => setActiveEditorQuestionIndex((current) => Math.max(0, current - 1))}
                        disabled={activeEditorQuestionIndex === 0}
                      >
                        <ChevronRight className="flip-icon" size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label="Pregunta siguiente"
                        onClick={() => setActiveEditorQuestionIndex((current) => Math.min(draft.questions.length - 1, current + 1))}
                        disabled={activeEditorQuestionIndex >= draft.questions.length - 1}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <button className="icon-btn" type="button" aria-label="Eliminar pregunta" onClick={() => removeQuestion(activeEditorQuestionIndex)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <label>
                    Texto de la pregunta
                    <textarea
                      value={activeDraftQuestion.prompt}
                      onChange={(event) => updateQuestion(activeEditorQuestionIndex, { prompt: event.target.value })}
                      placeholder="Escribe el enunciado de la pregunta."
                    />
                  </label>

                  <ImageInput label="Imagen de la pregunta" value={activeDraftQuestion.imageUrl} onChange={(value) => updateQuestion(activeEditorQuestionIndex, { imageUrl: value })} />

                  <SubjectSelect
                    value={activeDraftQuestion.subjectId}
                    subjects={subjects}
                    disabled={subjectSelectDisabled}
                    required={subjectSchemaReady && !draft.id}
                    showUnassignedWarning={subjectSchemaReady && !activeDraftQuestion.subjectId}
                    onChange={(value) => updateQuestion(activeEditorQuestionIndex, { subjectId: value })}
                  />

                  <div className="answer-grid">
                    {ANSWER_OPTIONS.map((option) => (
                      <label key={option}>
                        Alternativa {option}
                        <input
                          value={activeDraftQuestion.options[option]}
                          onChange={(event) => updateQuestionOption(activeEditorQuestionIndex, option, event.target.value)}
                          placeholder={`Respuesta ${option}`}
                        />
                      </label>
                    ))}
                    <label>
                      Clave correcta
                      <select value={activeDraftQuestion.correctOption} onChange={(event) => updateQuestion(activeEditorQuestionIndex, { correctOption: event.target.value })}>
                        {ANSWER_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>
                </article>
              )}
            </section>

            <div className="simulation-form-actions">
              <button className="secondary-btn" type="button" onClick={addQuestion}>
                <Plus size={18} />
                Añadir pregunta
              </button>
              <Button className="primary-btn" type="submit" loading={actionLoading === 'save-simulation'}>
                <Check size={18} />
                Guardar simulacro
              </Button>
            </div>
          </form>

          <section className="admin-simulation-manager">
            <div>
              <p className="eyebrow">Publicados y borradores</p>
              <h2>Simulacros creados</h2>
            </div>
            <div className="admin-simulation-list">
              {managedSimulations.map((simulation) => (
                <article className="admin-simulation-item" key={simulation.id}>
                  {simulation.imageUrl && <img src={simulation.imageUrl} alt="" />}
                  <div>
                    <strong>{simulation.title}</strong>
                    <span>{simulation.questions.length} preguntas / {simulation.scoreMax} puntos / {simulation.durationMinutes} min</span>
                    {simulation.questions.some((question) => !question.subjectId) && (
                      <small className="subject-warning-text">Tiene preguntas sin curso asignado</small>
                    )}
                    {!simulation.isPublished && <StatusBadge status="reforzar" />}
                  </div>
                  <button className="secondary-btn" type="button" onClick={() => onEditSimulation(simulation)}>
                    <Settings size={17} />
                    Editar
                  </button>
                  <button className="danger-btn" type="button" onClick={() => onDeleteSimulation(simulation.id)}>
                    <Trash2 size={17} />
                    Eliminar
                  </button>
                </article>
              ))}
              {!managedSimulations.length && (
                <div className="empty-state small">
                  <h2>Aún no hay simulacros</h2>
                  <p>Crea el primer simulacro global para que aparezca en la vista de estudiantes.</p>
                </div>
              )}
            </div>
          </section>
        </section>
      ) : studentView === 'stats' && activeSimulation ? (
        <section className="simulation-stats-page">
          <div className="simulation-stats-head">
            <button className="secondary-btn" type="button" onClick={() => setStudentView('detail')}>
              <ChevronRight className="flip-icon" size={17} />
              Volver al simulacro
            </button>
            <div>
              <p className="eyebrow">Estadisticas del simulacro</p>
              <h2>{activeSimulation.title}</h2>
              <span>{activeAttempts.length} intento(s) guardados</span>
            </div>
            <Button
              className="primary-btn"
              type="button"
              onClick={startActiveSimulation}
              disabled={!activeSimulation.questions.length}
            >
              <Clock size={18} />
              Nuevo intento
            </Button>
          </div>

          {!selectedAttempt ? (
            <div className="empty-state small">
              <h2>Aun no hay estadisticas</h2>
              <p>Resuelve este simulacro para activar el diagnostico por curso, comparativas e historial de intentos.</p>
            </div>
          ) : (
            <>
              <section className="simulation-stats-hero">
                <div>
                  <p className="eyebrow">{selectedAttempt.attemptLabel}</p>
                  <h3>{selectedAttempt.score}/{activeSimulation.scoreMax}</h3>
                  <p>{selectedAttempt.correctCount} de {selectedAttempt.questionCount} correctas. Tiempo: {formatElapsedDuration(selectedAttempt.durationSeconds)}.</p>
                  {activeUserRank && <span>Puesto en ranking por primer intento: #{activeUserRank}</span>}
                </div>

                <div className="stats-score-ring" style={{ '--score': selectedScorePercentage }}>
                  <strong>{selectedScorePercentage}%</strong>
                  <span>acierto</span>
                </div>

                <div className="stats-kpi-grid">
                  <article>
                    <span>Mejor nota</span>
                    <strong>{bestAttemptScore}/{activeSimulation.scoreMax}</strong>
                  </article>
                  <article>
                    <span>Promedio de intentos</span>
                    <strong>{averageAttemptScore}/{activeSimulation.scoreMax}</strong>
                  </article>
                  <article>
                    <span>Tiempo usado</span>
                    <strong>{formatElapsedDuration(selectedAttempt.durationSeconds)}</strong>
                  </article>
                  <article>
                    <span>Cursos criticos</span>
                    <strong>{criticalSubjects.length}</strong>
                  </article>
                  <article>
                    <span>Cursos fuertes</span>
                    <strong>{strongestSubjects.length}</strong>
                  </article>
                </div>
              </section>

              <section className="simulation-stats-toolbar">
                <label>
                  Muestra de intento
                  <select value={selectedAttemptId} onChange={(event) => setSelectedAttemptId(event.target.value)}>
                    <option value="latest">Ultimo resultado</option>
                    {activeAttemptDetails.map((attempt) => (
                      <option value={attempt.id} key={attempt.id}>
                        {attempt.attemptLabel} - {attempt.score}/{activeSimulation.scoreMax}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Busqueda rapida
                  <div className="course-search">
                    <Search size={17} />
                    <input
                      value={statsQuery}
                      onChange={(event) => setStatsQuery(event.target.value)}
                      placeholder="Buscar curso..."
                    />
                  </div>
                </label>

                <div className="stats-filter-tabs" role="tablist" aria-label="Filtro de cursos">
                  {[
                    ['all', 'Todos'],
                    ['critical', 'Criticos'],
                    ['reinforce', 'Reforzar'],
                    ['strong', 'Fuertes'],
                  ].map(([key, label]) => (
                    <button
                      className={statsFilter === key ? 'active' : ''}
                      type="button"
                      onClick={() => setStatsFilter(key)}
                      key={key}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="stats-insight-grid">
                <article className="stats-insight-card critical">
                  <p className="eyebrow">Cursos criticos</p>
                  <h3>{criticalSubjects.length ? criticalSubjects.map((stat) => stat.subjectName).slice(0, 3).join(', ') : 'Sin cursos criticos'}</h3>
                  <span>{selectedDiagnosis.topReason}</span>
                </article>
                <article className="stats-insight-card internal">
                  <p className="eyebrow">Comparacion interna</p>
                  <h3>{previousAttempt ? `Contra ${previousAttempt.attemptLabel}` : 'Primer intento registrado'}</h3>
                  <span>
                    {previousAttempt
                      ? 'Cada curso muestra cuanto subiste o bajaste frente al intento anterior seleccionado.'
                      : 'Cuando tengas otro intento, aqui veras tu avance estadistico curso por curso.'}
                  </span>
                </article>
                <article className="stats-insight-card strong">
                  <p className="eyebrow">Buen dominio</p>
                  <h3>{strongestSubjects.length ? strongestSubjects.map((stat) => stat.subjectName).slice(0, 3).join(', ') : 'Aun sin cursos fuertes'}</h3>
                  <span>Manten practica ligera en estos cursos para no perder estabilidad.</span>
                </article>
              </section>

              <CourseDiagnosis diagnosis={selectedDiagnosis} />

              <section className="subject-panel subject-detail-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Detalle por curso</p>
                    <h3>Rendimiento filtrado</h3>
                  </div>
                  <span className="stats-count-pill">{filteredSelectedSubjects.length} curso(s)</span>
                </div>

                <div className="subject-stats-grid">
                  {filteredSelectedSubjects.map((stat) => (
                    <article className={`subject-stats-card stats-subject-card subject-tone-${stat.status.key}`} key={stat.subjectKey}>
                      <div className="subject-card-head">
                        <div>
                          <span>{stat.subjectName}</span>
                          <strong>{formatPercentage(stat.percentage)}</strong>
                        </div>
                        <span className="subject-status-badge">{stat.status.label}</span>
                      </div>
                      <div className="subject-progress-bar" aria-label={`Avance ${stat.subjectName}`}>
                        <span style={{ width: `${Math.min(Math.max(stat.percentage, 0), 100)}%` }} />
                      </div>
                      <div className="subject-card-metrics">
                        <span>{stat.total} preguntas</span>
                        <span>{stat.correct} correctas</span>
                        <span>{stat.incorrect} incorrectas</span>
                      </div>
                      <div className="stats-subject-footer">
                        <span className="subject-priority-pill">{stat.priority.label}</span>
                        <span className={[
                          'internal-delta',
                          stat.internalDifference > 0 ? 'up' : '',
                          stat.internalDifference < 0 ? 'down' : '',
                        ].filter(Boolean).join(' ')}
                        >
                          {typeof stat.internalDifference === 'number'
                            ? `${stat.internalDifference > 0 ? '+' : ''}${formatPercentage(stat.internalDifference)} vs intento previo`
                            : 'Sin intento previo'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                {!filteredSelectedSubjects.length && (
                  <div className="comparison-empty">No hay cursos que coincidan con la busqueda o el filtro seleccionado.</div>
                )}
              </section>

              <GlobalComparisonCard
                comparisons={filteredSelectedSubjects}
                loading={Boolean(subjectAnalyticsLoading?.[activeSimulation.id])}
                error={subjectAnalyticsErrors?.[activeSimulation.id] ?? ''}
              />

              <section className="simulation-attempt-history expanded">
                <div>
                  <p className="eyebrow">Historial acumulado</p>
                  <h3>{activeAttempts.length ? `${activeAttempts.length} intento(s)` : 'Sin intentos guardados'}</h3>
                </div>
                {activeAttempts.map((attempt, index) => (
                  <button
                    className={selectedAttempt?.id === attempt.id ? 'attempt-row active' : 'attempt-row'}
                    type="button"
                    onClick={() => setSelectedAttemptId(attempt.id)}
                    key={attempt.id}
                  >
                    <strong>{attempt.score}/{activeSimulation.scoreMax}</strong>
                    <span>{attempt.correctCount}/{attempt.questionCount} correctas</span>
                    <span>Tiempo {formatElapsedDuration(attempt.durationSeconds)}</span>
                    <small>{formatDate(attempt.completedAt?.slice(0, 10))}</small>
                    <em>Intento {activeAttempts.length - index}</em>
                  </button>
                ))}
              </section>
            </>
          )}
        </section>
      ) : (
        <section className="simulation-workspace simulation-browser-workspace">
        <aside className={studentView === 'detail' ? 'simulation-list library-hidden' : 'simulation-list'} aria-label="Lista de simulacros">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h2>{loading ? 'Cargando...' : `${filteredVisibleSimulations.length} de ${visibleSimulations.length} simulacro(s)`}</h2>
            </div>
          </div>

          <label className="simulation-search-field">
            Buscar simulacro
            <div className="course-search">
              <Search size={17} />
              <input
                value={studentSimulationQuery}
                onChange={(event) => setStudentSimulationQuery(event.target.value)}
                placeholder="Nombre, descripcion o curso..."
              />
            </div>
          </label>

          {filteredVisibleSimulations.map((simulation) => (
            <button
              className={simulation.id === activeSimulation?.id ? 'simulation-list-item active' : 'simulation-list-item'}
              type="button"
              onClick={() => {
                setActiveSimulationId(simulation.id)
                setStudentView('detail')
              }}
              key={simulation.id}
            >
              {simulation.imageUrl && <img src={simulation.imageUrl} alt="" />}
              <span>{simulation.title}</span>
              <small>{simulation.questions.length} preguntas / {simulation.scoreMax} puntos / {simulation.durationMinutes} min</small>
              {!simulation.isPublished && <StatusBadge status="reforzar" className="simulation-private-badge" />}
            </button>
          ))}

          {!loading && !filteredVisibleSimulations.length && (
            <div className="empty-state small">
              <h2>{visibleSimulations.length ? 'Sin coincidencias' : 'No hay simulacros disponibles'}</h2>
              <p>{visibleSimulations.length ? 'Prueba con otro nombre, descripcion o curso.' : isAdmin ? 'Crea el primero desde el panel admin.' : 'Vuelve pronto para practicar con nuevas pruebas.'}</p>
            </div>
          )}
        </aside>

        <section className={studentView === 'detail' ? 'simulation-player' : 'simulation-player library-hidden'}>
          {studentView === 'detail' && activeSimulation ? (
            <>
              <div className="simulation-detail-toolbar">
                <button className="secondary-btn" type="button" onClick={() => setStudentView('library')}>
                  <ChevronRight className="flip-icon" size={17} />
                  Volver a biblioteca
                </button>
                <div>
                  <p className="eyebrow">Simulacro seleccionado</p>
                  <h2>{activeSimulation.title}</h2>
                </div>
              </div>

              <article className="simulation-start-card">
                <div className="simulation-player-head">
                  <div>
                    <p className="eyebrow">Descripción del simulacro</p>
                    <h2>{activeSimulation.title}</h2>
                    <p>{activeSimulation.description || 'Sin descripción.'}</p>
                  </div>
                </div>

                {activeSimulation.imageUrl && <img className="simulation-cover large" src={activeSimulation.imageUrl} alt="" />}

                <div className="simulation-start-metrics">
                  <span>{activeSimulation.questions.length} preguntas</span>
                  <span>Nota sobre {activeSimulation.scoreMax}</span>
                  <span>{activeSimulation.durationMinutes} min</span>
                </div>

                <div className="simulation-ranking-notice">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Ranking justo</strong>
                    <span>Solo la nota de tu primer intento se mostrara en el ranking. Los nuevos intentos se guardan para tus estadisticas.</span>
                  </div>
                </div>

                <div className="simulation-start-actions">
                  <Button
                    className="primary-btn simulation-start-btn"
                    type="button"
                    onClick={startActiveSimulation}
                    disabled={!activeSimulation.questions.length}
                  >
                    <Clock size={18} />
                    Empezar simulacro
                  </Button>
                  <button
                    className="secondary-btn simulation-start-btn"
                    type="button"
                    onClick={() => setStudentView('stats')}
                    disabled={!activeAttemptDetails.length}
                  >
                    <BarChart3 size={18} />
                    Ver estadisticas
                  </button>
                </div>
              </article>

              {activeResult && (
                <div className="simulation-result compact-result">
                  <div>
                    <span>Ultima nota</span>
                    <strong>{activeResult.score}/{activeSimulation.scoreMax}</strong>
                    <p>{activeResult.correctCount} de {activeResult.questionCount} correctas. Tiempo: {formatElapsedDuration(activeResult.durationSeconds)}.</p>
                    {activeUserRank && <p>Puesto en ranking por primer intento: #{activeUserRank}</p>}
                  </div>
                  <button className="secondary-btn" type="button" onClick={() => setStudentView('stats')}>
                    <BarChart3 size={18} />
                    Ver analisis completo
                  </button>
                </div>
              )}

              <section className="simulation-attempt-history">
                <div>
                  <p className="eyebrow">Tus intentos</p>
                  <h3>{activeAttempts.length ? `${activeAttempts.length} intento(s)` : 'Sin intentos aun'}</h3>
                </div>
                {activeAttempts.slice(0, 5).map((attempt) => (
                  <article className="attempt-row" key={attempt.id}>
                    <strong>{attempt.score}/{activeSimulation.scoreMax}</strong>
                    <span>{attempt.correctCount}/{attempt.questionCount} correctas / {formatElapsedDuration(attempt.durationSeconds)}</span>
                    <small>{formatDate(attempt.completedAt?.slice(0, 10))}</small>
                  </article>
                ))}
              </section>

            </>
          ) : (
            <div className="empty-state small">
              <h2>Selecciona un simulacro</h2>
              <p>Cuando exista una práctica, aquí podrás resolverla y ver tu nota en tiempo real.</p>
            </div>
          )}
        </section>
        </section>
      )}
    </main>
  )
}

function ImageInput({ label, value, onChange }) {
  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  return (
    <div className="image-input">
      <label>
        {label}
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Pega una URL o carga una imagen" />
      </label>
      <label className="file-picker image-picker">
        <Upload size={18} />
        Subir imagen
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </label>
      {value && <img src={value} alt="" />}
    </div>
  )
}

/*
        <span className="beta-badge">Próximamente</span>
          <h2>{template?.shortName ? `Simulacros ${template.shortName}` : 'Simulacros por preparación'}</h2>
          <p>La idea es separar los simulacros por universidad, carrera objetivo y bloque de temas para que cada examen tenga su propio historial.</p>

          <p>Se guardarán intentos semanales, puntaje, tiempo, aciertos, errores y evolución para que veas si estás mejorando con cada práctica.</p>
        </article>

          <h2>Diagnóstico por tema</h2>
          <p>Cuando esté activo, podrás detectar en qué cursos y temas fallas más, y convertir esos errores en temas para reforzar.</p>
        </article>
      </section>
    </main>
  )
}

*/
// eslint-disable-next-line no-unused-vars
function LegacyWeeklySimulationRankingPage({ exam }) {
  const template = getTemplateForExam(exam)

  return (
    <main className="dashboard beta-page reveal">
      <section className="beta-hero">
        <div>
          <p className="eyebrow">Beta / proximamente</p>
          <h1>Ranking de simulacro semanal</h1>
          <p>
            Ranking global por simulacro, con comparativas de rendimiento entre intentos, cursos y temas.
          </p>
        </div>
        <span className="beta-badge">Próximamente</span>
      </section>

      <section className="leaderboard-panel beta-ranking-preview">
        <article className="leaderboard-row you">
          <span className="rank-number">1</span>
          <span className="leader-avatar">{template?.shortName?.slice(0, 1) ?? 'T'}</span>
          <div className="leader-name">
            <strong>Ranking {template?.shortName ?? exam.name}</strong>
            <span>Se activará cuando existan simulacros semanales.</span>
          </div>
          <div className="leader-streak">
            <BarChart3 size={21} />
            <strong>--</strong>
            <span>precisión</span>
          </div>
          <div className="leader-best">
            <span>Primer intento</span>
            <strong>--</strong>
          </div>
        </article>
      </section>

      <section className="beta-grid">
        <article className="beta-card">
          <h2>Comparación global</h2>
          <p>Ranking por examen, universidad y semana, separado del ranking general de progreso.</p>
        </article>
        <article className="beta-card">
          <h2>Precisión por curso</h2>
          <p>Futuras métricas de aciertos, errores y temas críticos por curso.</p>
        </article>
        <article className="beta-card">
          <h2>Historial de intentos</h2>
          <p>Seguimiento de mejora entre simulacros para ver si tu rendimiento sube o se estanca.</p>
        </article>
      </section>
    </main>
  )
}

function WeeklySimulationRankingPage({
  simulations,
  rankings,
  loading,
  error,
  activeSimulationId,
  setActiveSimulationId,
  currentUserId,
  subjectAnalytics,
  subjectAnalyticsLoading,
  subjectAnalyticsErrors,
}) {
  const [query, setQuery] = useState('')
  const publishedSimulations = simulations.filter((simulation) => simulation.isPublished)
  const activeSimulation = publishedSimulations.find((simulation) => simulation.id === activeSimulationId) ?? publishedSimulations[0] ?? null
  const activeRows = activeSimulation
    ? rankings
      .filter((row) => row.simulationId === activeSimulation.id)
      .sort((a, b) => b.firstAttemptScore - a.firstAttemptScore || b.firstAttemptCorrectCount - a.firstAttemptCorrectCount || a.displayName.localeCompare(b.displayName))
    : []
  const rankedRows = activeRows.map((row, index) => ({ ...row, rank: index + 1 }))
  const filteredRows = rankedRows.filter((row) => row.displayName.toLowerCase().includes(query.trim().toLowerCase()))
  const activeSubjectAnalytics = activeSimulation ? (subjectAnalytics?.[activeSimulation.id] ?? []) : []
  const subjectRowsWithAverage = activeSubjectAnalytics.filter((row) => row.globalAverage !== null && row.globalUserCount > 0)
  const averageFirstAttemptScore = activeRows.length
    ? Number((activeRows.reduce((sum, row) => sum + row.firstAttemptScore, 0) / activeRows.length).toFixed(2))
    : null
  const highestSubject = subjectRowsWithAverage.reduce((best, row) => (
    !best || row.globalAverage > best.globalAverage ? row : best
  ), null)
  const lowestSubject = subjectRowsWithAverage.reduce((worst, row) => (
    !worst || row.globalAverage < worst.globalAverage ? row : worst
  ), null)

  return (
    <main className="dashboard simulation-page ranking-page reveal">
      <section className="simulation-hero">
        <div>
          <p className="eyebrow">Rankings por simulacro</p>
          <h1>Ranking</h1>
          <p>Elige un simulacro global y compara solo el primer intento de cada usuario.</p>
        </div>
        <span className="global-summary">
          <Trophy size={18} />
          {publishedSimulations.length} simulacro(s)
        </span>
      </section>

      {error && <div className="template-warning">{error}</div>}

      <section className="simulation-workspace ranking-workspace">
        <aside className="simulation-list" aria-label="Simulacros con ranking">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Simulacros</p>
              <h2>{loading ? 'Cargando...' : 'Disponibles'}</h2>
            </div>
          </div>

          {publishedSimulations.map((simulation) => {
            const rowCount = rankings.filter((row) => row.simulationId === simulation.id).length

            return (
              <button
                className={simulation.id === activeSimulation?.id ? 'simulation-list-item active' : 'simulation-list-item'}
                type="button"
                onClick={() => setActiveSimulationId(simulation.id)}
                key={simulation.id}
              >
                {simulation.imageUrl && <img src={simulation.imageUrl} alt="" />}
                <span>{simulation.title}</span>
                <small>{rowCount} estudiante(s) rankeados</small>
              </button>
            )
          })}

          {!loading && !publishedSimulations.length && (
            <div className="empty-state small">
              <h2>No hay simulacros publicados</h2>
              <p>Cuando el admin publique uno, aparecera aqui con su ranking.</p>
            </div>
          )}
        </aside>

        <section className="simulation-player ranking-panel">
          {activeSimulation ? (
            <>
              <div className="simulation-player-head">
                <div>
                  <p className="eyebrow">Ranking activo</p>
                  <h2>{activeSimulation.title}</h2>
                  <p>{activeRows.length} usuario(s) con intentos registrados.</p>
                </div>
                <div className="course-search ranking-search">
                  <Search size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario" />
                </div>
              </div>

              <section className="ranking-analytics-panel">
                <div className="ranking-analytics-grid">
                  <article>
                    <span>Promedio primer intento</span>
                    <strong>{averageFirstAttemptScore == null ? 'Sin datos' : `${averageFirstAttemptScore}/${activeSimulation.scoreMax}`}</strong>
                  </article>
                  <article>
                    <span>Mayor promedio por curso</span>
                    <strong>
                      {highestSubject
                        ? `${highestSubject.subjectName} · ${formatPercentage(highestSubject.globalAverage)}`
                        : 'Sin datos'}
                    </strong>
                  </article>
                  <article>
                    <span>Menor promedio por curso</span>
                    <strong>
                      {lowestSubject
                        ? `${lowestSubject.subjectName} · ${formatPercentage(lowestSubject.globalAverage)}`
                        : 'Sin datos'}
                    </strong>
                  </article>
                </div>

                {subjectAnalyticsLoading?.[activeSimulation.id] ? (
                  <div className="comparison-empty">Calculando estadisticas por curso...</div>
                ) : subjectAnalyticsErrors?.[activeSimulation.id] ? (
                  <div className="comparison-empty warning">{subjectAnalyticsErrors[activeSimulation.id]}</div>
                ) : subjectRowsWithAverage.length ? (
                  <div className="ranking-subject-overview">
                    {subjectRowsWithAverage.map((row) => (
                      <div className="ranking-subject-row" key={row.subjectId || row.subjectSlug}>
                        <span>{row.subjectName}</span>
                        <div className="subject-progress-bar">
                          <span style={{ width: `${Math.min(Math.max(row.globalAverage, 0), 100)}%` }} />
                        </div>
                        <strong>{formatPercentage(row.globalAverage)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="comparison-empty">Aun no hay estadisticas globales por curso.</div>
                )}
              </section>

              <div className="simulation-ranking-list">
                {filteredRows.map((row) => (
                  <article className={row.userId === currentUserId ? 'simulation-ranking-row you' : 'simulation-ranking-row'} key={row.userId}>
                    <span className="rank-number">{row.rank}</span>
                    <span className="leader-avatar">{row.displayName.slice(0, 1).toUpperCase()}</span>
                    <div className="leader-name">
                      <strong>{row.displayName}</strong>
                      <span>{row.attemptCount} intento(s) / ranking por primer intento</span>
                    </div>
                    <div className="leader-streak">
                      <Trophy size={21} />
                      <strong>{row.firstAttemptScore}</strong>
                      <span>primer intento</span>
                    </div>
                    <div className="leader-best">
                      <span>Aciertos</span>
                      <strong>{row.firstAttemptCorrectCount}/{row.questionCount}</strong>
                    </div>
                  </article>
                ))}

                {!loading && !filteredRows.length && (
                  <div className="empty-state small">
                    <h2>{query ? 'Sin coincidencias' : 'Aun no hay ranking'}</h2>
                    <p>{query ? 'Prueba buscando otro nombre.' : 'El ranking aparecera cuando alguien termine este simulacro.'}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state small">
              <h2>Selecciona un simulacro</h2>
              <p>Los rankings usan solo el primer intento de cada usuario.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

function GlobalPage({ entries, currentUserId, loading }) {
  return (
    <main className="dashboard reveal">
      <section className="section-heading global-heading">
        <div>
          <p className="eyebrow">Todos los usuarios</p>
          <h1>Ranking global</h1>
        </div>
        <div className="global-summary">
          <Trophy size={19} />
          <span>{entries.length} estudiante(s)</span>
        </div>
      </section>

      <section className="leaderboard-panel">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <div className="skeleton leaderboard-skeleton" key={index} />)
        ) : (
          entries.map((entry, index) => (
            <article className={entry.id === currentUserId ? 'leaderboard-row you' : 'leaderboard-row'} key={entry.id ?? entry.displayName}>
              <span className="rank-number">{index + 1}</span>
              <span className="leader-avatar">{entry.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="leader-name">
                <strong>{entry.displayName}</strong>
                <span>{entry.activeDays} dias activos / {entry.completedTopics} temas</span>
              </div>
              <div className="leader-streak">
                <Flame size={21} fill="currentColor" />
                <strong>{entry.currentStreak}</strong>
                <span>dias</span>
              </div>
              <div className="leader-best">
                <span>Mejor racha</span>
                <strong>{entry.longestStreak}</strong>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

function Metric({ icon, value, label }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function ProgressRail({ percent }) {
  const safePercent = clamp(percent)

  return (
    <div className="progress-wrap">
      <div className="progress-arrow" style={{ left: `${safePercent}%` }}>
        <span>{safePercent}%</span>
      </div>
      <div className="progress-rail" aria-label={`Progreso ${safePercent}%`}>
        <div className="progress-fill" style={{ width: `${safePercent}%` }} />
      </div>
    </div>
  )
}

function MiniProgress({ percent }) {
  return (
    <div className="mini-progress" aria-label={`Progreso ${percent}%`}>
      <span style={{ width: `${clamp(percent)}%` }} />
    </div>
  )
}

function UrgencyBadge({ urgency }) {
  return (
    <div className={`urgency ${urgency.tone}`}>
      <strong>{urgency.label}</strong>
      <span>{urgency.detail}</span>
    </div>
  )
}

function Button({ children, className, loading, disabled, ...props }) {
  return (
    <button className={className} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle className="spinner" size={18} /> : children}
    </button>
  )
}

function BootScreen() {
  return (
    <PublicScreen className="boot-screen">
      <div className="boot-loader">
        <img src={logoArt} alt="" />
        <span />
      </div>
      <p>Cargando Trackedux</p>
    </PublicScreen>
  )
}

function DashboardSkeleton() {
  return (
    <main className="dashboard">
      <section className="hero-section">
        <div className="skeleton hero-skeleton" />
        <div className="hero-metrics">
          <div className="skeleton metric" />
          <div className="skeleton metric" />
          <div className="skeleton metric" />
        </div>
      </section>
      <section className="skeleton progress-skeleton" />
    </main>
  )
}

function Toast({ toast }) {
  if (!toast) return null

  return (
    <div className={`toast ${toast.type}`} role="status">
      {toast.type === 'error' ? <X size={17} /> : <RefreshCw size={17} />}
      <span>{toast.message}</span>
    </div>
  )
}

function BrandLockup({ small = false }) {
  return (
    <div className={small ? 'brand-lockup small' : 'brand-lockup'}>
      <span className="brand-mark">
        <img src={logoArt} alt="" />
      </span>
      <span className="brand-word">Trackedux</span>
    </div>
  )
}

function LogoShowcase({ compact = false }) {
  return (
    <div className={compact ? 'logo-showcase compact' : 'logo-showcase'}>
      <div className="logo-glow" />
      <img src={logoArt} alt="Trackedux" />
    </div>
  )
}

export default App
