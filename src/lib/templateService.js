import { flattenTemplateTopicRows } from '../data/examTemplates'

const isMissingColumnError = (error) => (
  error?.code === '42703'
  || error?.code === 'PGRST204'
  || /column|schema cache/i.test(error?.message ?? '')
)

const insertExam = async ({ supabase, userId, template, name, targetDate, metadata }) => {
  const basePayload = {
    user_id: userId,
    name,
    target_date: targetDate,
  }
  const templatePayload = {
    ...basePayload,
    template_code: template.code,
    template_version: template.version,
    academic_area: metadata.academicArea,
    target_career: metadata.targetCareer,
    current_level: metadata.currentLevel,
    source_note: template.sourceNote,
  }

  let response = await supabase
    .from('exams')
    .insert(templatePayload)
    .select('id')
    .single()

  if (response.error && isMissingColumnError(response.error)) {
    response = await supabase
      .from('exams')
      .insert(basePayload)
      .select('id')
      .single()
  }

  if (response.error) throw response.error
  return response.data
}

const insertTopics = async ({ supabase, rows }) => {
  if (!rows.length) return

  const withStatus = rows.map((row) => ({ ...row, status: 'pendiente' }))
  let response = await supabase.from('topics').insert(withStatus)

  if (response.error && isMissingColumnError(response.error)) {
    response = await supabase.from('topics').insert(rows)
  }

  if (response.error && isMissingColumnError(response.error)) {
    response = await supabase.from('topics').insert(rows.map((row) => ({
      user_id: row.user_id,
      course_id: row.course_id,
      name: row.name,
      done: row.done,
      position: row.position,
    })))
  }

  if (response.error) throw response.error
}

const insertCourses = async ({ supabase, rows }) => {
  let response = await supabase
    .from('courses')
    .insert(rows)
    .select('id, name, position')

  if (response.error && isMissingColumnError(response.error)) {
    response = await supabase
      .from('courses')
      .insert(rows.map((row) => ({
        user_id: row.user_id,
        exam_id: row.exam_id,
        name: row.name,
        position: row.position,
      })))
      .select('id, name, position')
  }

  if (response.error) throw response.error
  return response.data ?? []
}

export const createPreparationFromTemplate = async ({
  supabase,
  userId,
  template,
  name,
  targetDate,
  metadata = {},
}) => {
  let createdExamId = null

  try {
    const exam = await insertExam({ supabase, userId, template, name, targetDate, metadata })
    createdExamId = exam.id

    const courseRows = template.courses.map((course, index) => ({
      user_id: userId,
      exam_id: exam.id,
      name: course.name,
      position: index,
      block_name: course.blockName,
      importance: course.importance ?? 'media',
      notes: course.notes,
    }))

    const createdCourses = await insertCourses({ supabase, rows: courseRows })

    const coursesByName = new Map((createdCourses ?? []).map((course) => [course.name, course]))
    const topicRows = template.courses.flatMap((templateCourse) => {
      const createdCourse = coursesByName.get(templateCourse.name)
      if (!createdCourse) return []

      return flattenTemplateTopicRows(templateCourse.topics).map((topic, index) => ({
        user_id: userId,
        course_id: createdCourse.id,
        name: topic.name,
        code: topic.code,
        importance: topic.importance ?? templateCourse.importance ?? 'media',
        notes: topic.notes,
        done: false,
        position: index,
      }))
    })

    await insertTopics({ supabase, rows: topicRows })

    return {
      examId: exam.id,
      courseCount: courseRows.length,
      topicCount: topicRows.length,
    }
  } catch (error) {
    // If the copy fails midway, remove the empty preparation so the user can retry cleanly.
    if (createdExamId) {
      await supabase.from('exams').delete().eq('id', createdExamId)
    }
    throw error
  }
}
