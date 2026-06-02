import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Flame,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
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
  const learned = topics.filter((topic) => topic.done).length
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
  const learned = course.topics.filter((topic) => topic.done).length

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
      .filter((topic) => topic.done && topic.completedAt)
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
  const learnedTopics = topics.filter((topic) => topic.done)
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
        const [
          { data: profileRow, error: profileError },
          { data: examRows, error: examError },
        ] = await Promise.all([
          supabase.from('profiles').select('id, display_name').eq('id', userId).maybeSingle(),
          supabase.from('exams').select('id, name, target_date, created_at').order('created_at', { ascending: true }),
        ])

        if (profileError) throw profileError
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
          const { data, error } = await supabase
            .from('topics')
            .select('id, course_id, name, done, position, created_at, completed_at')
            .in('course_id', courseIds)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })

          if (error) throw error
          topicRows = data ?? []
        }

        const topicsByCourse = topicRows.reduce((acc, topic) => {
          acc[topic.course_id] = acc[topic.course_id] ?? []
          acc[topic.course_id].push({
            id: topic.id,
            name: topic.name,
            done: topic.done,
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
      const { error } = await supabase.from('topics').insert({
        user_id: session.user.id,
        course_id: courseId,
        name: text,
        position: course.topics.length,
      })

      if (error) throw error
      setTopicInputs((current) => ({ ...current, [courseId]: '' }))
      await fetchWorkspace()
    })
  }

  const toggleTopic = (courseId, topicId) => {
    if (!activeExam || !supabase) return

    const course = activeExam.courses.find((item) => item.id === courseId)
    const topic = course?.topics.find((item) => item.id === topicId)
    if (!topic) return

    runAction(`toggle-${topicId}`, async () => {
      const nextDone = !topic.done
      const isNewStreakDay = nextDone && !userStats.activityDays.includes(todayISO())
      const { error } = await supabase
        .from('topics')
        .update({ done: nextDone, completed_at: nextDone ? new Date().toISOString() : null })
        .eq('id', topicId)

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
            <h1>Primero crea el examen que quieres preparar.</h1>
            <p className="muted">Despues podras agregar cursos, temas y ver la urgencia calculada por fecha.</p>
          </div>
          <ExamForm
            form={examForm}
            setForm={setExamForm}
            onSubmit={handleCreateExam}
            submitText="Crear examen"
            loading={actionLoading === 'exam'}
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
          <p className="eyebrow">Nuevo plan independiente</p>
          <h1>Anade otro examen</h1>
          <ExamForm
            form={examForm}
            setForm={setExamForm}
            onSubmit={handleCreateExam}
            submitText="Guardar examen"
            loading={actionLoading === 'exam'}
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
          onToggleTopic={toggleTopic}
          onRemoveCourse={removeCourse}
          actionLoading={actionLoading}
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
            <p className="eyebrow">Configuracion del examen</p>
            <h2 id="settings-title">Ajusta nombre o fecha</h2>
            <div className="stack-form">
              <label>
                Nombre del examen
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
                <Button className="secondary-btn" loading={actionLoading === 'settings'} onClick={() => saveExamSettings(true)}>
                  <Check size={18} />
                  Guardar cursos
                </Button>
                <Button className="danger-btn" loading={actionLoading === 'settings'} onClick={() => saveExamSettings(false)}>
                  <Trash2 size={18} />
                  Eliminar cursos
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

function AuthScreen({ authMode, setAuthMode, form, setForm, onSubmit, loading }) {
  const isRegister = authMode === 'register'

  return (
    <PublicScreen className="auth-screen">
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <BrandLockup small />
          <p className="user">Sesion de {displayName}</p>
        </div>

        <div className="exam-list" aria-label="Examenes">
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

        <div className="sidebar-actions">
          <Button className="secondary-btn full" onClick={() => setView('new-exam')}>
            <Plus size={18} />
            Nuevo examen
          </Button>
          <Button className="ghost-btn full" onClick={onOpenSettings} disabled={!activeExam}>
            <Settings size={18} />
            Configuracion
          </Button>
          <Button className="ghost-btn full" onClick={onLogout} loading={logoutLoading}>
            <LogOut size={18} />
            Salir
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

function PublicScreen({ children, className }) {
  return (
    <main className={className}>
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
      <p>&copy; 2026 Trackedux. Todos los derechos reservados.</p>
      <div>
        <span>Dise&ntilde;ado y desarrollado por Sebastian Paolo Shulla Garcia</span>
        <span>Idea principal por Abel Marcial Palomino Espinoza</span>
      </div>
    </footer>
  )
}

function ExamForm({ form, setForm, onSubmit, submitText, loading }) {
  return (
    <form onSubmit={onSubmit} className="stack-form">
      <label>
        Nombre del examen
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Ej. Admision UNI"
          autoFocus
        />
      </label>
      <label>
        Fecha para la que te preparas
        <input
          type="date"
          min={todayISO()}
          value={form.targetDate}
          onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
        />
      </label>
      <Button className="primary-btn" type="submit" loading={loading}>
        <Plus size={18} />
        {submitText}
      </Button>
    </form>
  )
}

function HomePage({ exam, stats, userStats, daysLeft, weeksLeft, onOpenCourses }) {
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
  onToggleTopic,
  onRemoveCourse,
  actionLoading,
}) {
  return (
    <main className="courses-page reveal">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Cursos de {exam.name}</p>
          <h1>Construye tu temario</h1>
        </div>
        <form className="inline-form" onSubmit={onAddCourse}>
          <input
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            placeholder="Nombre del curso"
          />
          <Button className="primary-btn" type="submit" loading={actionLoading === 'course'}>
            <Plus size={18} />
            Anadir
          </Button>
        </form>
      </section>

      <section className="courses-grid">
        {exam.courses.map((course) => {
          const stats = getCourseStats(course)
          const urgency = getUrgency(course, exam.targetDate)

          return (
            <article className="course-card" key={course.id}>
              <div className="course-title-row">
                <div>
                  <h2>{course.name}</h2>
                  <p>{stats.percent}% completado</p>
                </div>
                <button className="icon-btn" aria-label={`Eliminar ${course.name}`} onClick={() => onRemoveCourse(course.id)}>
                  {actionLoading === `remove-${course.id}` ? <LoaderCircle size={18} /> : <Trash2 size={18} />}
                </button>
              </div>
              <MiniProgress percent={stats.percent} />
              <UrgencyBadge urgency={urgency} />

              <div className="topic-list">
                {course.topics.map((topic) => (
                  <label className={topic.done ? 'topic done' : 'topic'} key={topic.id}>
                    <input
                      type="checkbox"
                      checked={topic.done}
                      onChange={() => onToggleTopic(course.id, topic.id)}
                      disabled={actionLoading === `toggle-${topic.id}`}
                    />
                    <span>{topic.name}</span>
                    {actionLoading === `toggle-${topic.id}` && <LoaderCircle className="inline-spinner" size={16} />}
                  </label>
                ))}
              </div>

              <div className="topic-form">
                <input
                  value={topicInputs[course.id] ?? ''}
                  onChange={(event) => setTopicInputs((current) => ({ ...current, [course.id]: event.target.value }))}
                  placeholder="Anadir tema"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onAddTopic(course.id)
                    }
                  }}
                />
                <button className="icon-btn add-topic-btn" type="button" onClick={() => onAddTopic(course.id)}>
                  {actionLoading === `topic-${course.id}` ? <LoaderCircle size={18} /> : <Plus size={18} />}
                </button>
              </div>
            </article>
          )
        })}
      </section>

      {!exam.courses.length && (
        <div className="empty-state">
          <h2>Aun no hay cursos</h2>
          <p>Empieza con el primer curso de tu examen y luego agrega sus temas.</p>
        </div>
      )}
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
