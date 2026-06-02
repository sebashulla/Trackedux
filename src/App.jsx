import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Bug,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  ExternalLink,
  FileText,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
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
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import TemplateSelector from './components/TemplateSelector'
import { EXAM_TEMPLATES, TOPIC_STATUS_OPTIONS, getExamTemplateByCode, getTemplateFormDefaults } from './data/examTemplates'
import { createPreparationFromTemplate } from './lib/templateService'
import { isSupabaseConfigured, supabase } from './lib/supabase'
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

const getTopicStatus = (topic) => topic.status ?? (topic.done ? 'completado' : 'pendiente')

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
  const [editExamForm, setEditExamForm] = useState({ name: '', targetDate: '' })

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
            status: topic.status ?? (topic.done ? 'completado' : 'pendiente'),
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
  }, [session?.user?.id])

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
        setView={setView}
        setActiveExamId={setActiveExamId}
        onOpenSettings={openSettings}
        onLogout={handleLogout}
        logoutLoading={actionLoading === 'logout'}
        daysLeft={daysLeft}
        userStats={userStats}
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
      setView={setView}
      setActiveExamId={setActiveExamId}
      onOpenSettings={openSettings}
      onLogout={handleLogout}
      logoutLoading={actionLoading === 'logout'}
      daysLeft={daysLeft}
      userStats={userStats}
      dataLoading={dataLoading}
    >
      {view === 'new-exam' ? (
        <section className="page-narrow reveal">
          <p className="eyebrow">Crear preparacion</p>
          <h1>Anade otro plan</h1>
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
          onRemoveCourse={removeCourse}
          actionLoading={actionLoading}
        />
      ) : view === 'weekly-sim' ? (
        <WeeklySimulationPage exam={activeExam} />
      ) : view === 'weekly-ranking' ? (
        <WeeklySimulationRankingPage exam={activeExam} />
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
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-copy">
            <BrandLockup small />
            <p className="user">Sesion de {displayName}</p>
          </div>
          <button
            className="icon-btn sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? 'Mostrar preparaciones' : 'Ocultar preparaciones'}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="exam-list" aria-label="Preparaciones">
            {exams.map((exam) => (
              <button
                key={exam.id}
                className={exam.id === activeExam?.id ? 'exam-chip active' : 'exam-chip'}
                onClick={() => {
                  setActiveExamId(exam.id)
                  setView('home')
                }}
              >
                <span>{exam.name}</span>
                <small><CalendarDays size={14} /> {formatDate(exam.targetDate)}</small>
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-actions">
          <Button className="secondary-btn full" onClick={() => setView('new-exam')}>
            <Plus size={18} />
            <span>Nueva preparacion</span>
          </Button>
          <Button className="ghost-btn full" onClick={onOpenSettings} disabled={!activeExam}>
            <Settings size={18} />
            <span>Configuracion</span>
          </Button>
          <Button className="ghost-btn full" onClick={onLogout} loading={logoutLoading}>
            <LogOut size={18} />
            <span>Salir</span>
          </Button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <nav className="tabs" aria-label="Navegacion principal">
            <button className={view === 'home' ? 'tab active' : 'tab'} onClick={() => setView('home')}>
              <LayoutDashboard size={17} />
              Inicio
            </button>
            <button className={view === 'courses' ? 'tab active' : 'tab'} onClick={() => setView('courses')}>
              <BookOpen size={17} />
              Cursos
            </button>
            <button className={view === 'weekly-sim' ? 'tab active' : 'tab'} onClick={() => setView('weekly-sim')}>
              <FileText size={17} />
              Simulacro
            </button>
            <button className={view === 'weekly-ranking' ? 'tab active' : 'tab'} onClick={() => setView('weekly-ranking')}>
              <BarChart3 size={17} />
              Ranking
            </button>
            <button className={view === 'global' ? 'tab active' : 'tab'} onClick={() => setView('global')}>
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
      </div>
    </div>
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
  const templateNotice = examTemplate ? (exam.sourceNote ?? examTemplate.sourceNote) : null

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
                  <UrgencyBadge urgency={urgency} />
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
  onRemoveCourse,
  actionLoading,
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(exam.courses[0]?.id ?? null)
  const [courseQuery, setCourseQuery] = useState('')
  const [topicQuery, setTopicQuery] = useState('')
  const [collapsedTopicGroups, setCollapsedTopicGroups] = useState({})

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
                                  <span className="topic-state-dot" data-status={getTopicStatus(topic)} />
                                  <div className="topic-main">
                                    <span>{topic.name}</span>
                                    <div className="topic-status-controls" aria-label={`Estado de ${topic.name}`}>
                                      {TOPIC_STATUS_OPTIONS.map((status) => (
                                        <button
                                          type="button"
                                          className={getTopicStatus(topic) === status.value ? 'active' : ''}
                                          onClick={() => onSetTopicStatus(activeCourse.id, topic.id, status.value)}
                                          disabled={actionLoading === `toggle-${topic.id}`}
                                          key={status.value}
                                        >
                                          {status.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {actionLoading === `toggle-${topic.id}` && <LoaderCircle className="inline-spinner" size={16} />}
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
    </main>
  )
}

function WeeklySimulationPage({ exam }) {
  const template = getTemplateForExam(exam)

  return (
    <main className="dashboard beta-page reveal">
      <section className="beta-hero">
        <div>
          <p className="eyebrow">Beta / proximamente</p>
          <h1>Simulacro semanal</h1>
          <p>
            Un espacio para programar simulacros por universidad, curso o tema, y comparar cada intento con tu avance real.
          </p>
        </div>
        <span className="beta-badge">Próximamente</span>
      </section>

      <section className="beta-grid">
        <article className="beta-card highlight">
          <span className="beta-icon"><FileText size={22} /></span>
          <h2>{template?.shortName ? `Simulacros ${template.shortName}` : 'Simulacros por preparación'}</h2>
          <p>La idea es separar los simulacros por universidad, carrera objetivo y bloque de temas para que cada examen tenga su propio historial.</p>
          <div className="beta-pill-row">
            <span>Por universidad</span>
            <span>Por curso</span>
            <span>Por tema</span>
          </div>
        </article>

        <article className="beta-card">
          <span className="beta-icon"><Clock size={22} /></span>
          <h2>Intentos y mejora</h2>
          <p>Se guardarán intentos semanales, puntaje, tiempo, aciertos, errores y evolución para que veas si estás mejorando con cada práctica.</p>
        </article>

        <article className="beta-card">
          <span className="beta-icon"><Target size={22} /></span>
          <h2>Diagnóstico por tema</h2>
          <p>Cuando esté activo, podrás detectar en qué cursos y temas fallas más, y convertir esos errores en temas para reforzar.</p>
        </article>
      </section>
    </main>
  )
}

function WeeklySimulationRankingPage({ exam }) {
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
            <span>Mejor intento</span>
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
