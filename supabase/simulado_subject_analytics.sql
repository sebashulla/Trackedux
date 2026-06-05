-- Ejecuta este archivo en el SQL Editor de Supabase despues de supabase/simulations.sql.
-- Agrega duracion, cursos por pregunta y agregados seguros por curso para simulacros.

create extension if not exists pgcrypto;

create table if not exists public.exam_subjects (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (char_length(trim(name)) > 0),
  slug text unique not null check (char_length(trim(slug)) > 0),
  area text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.exam_subjects (name, slug, area, sort_order)
values
  ('Biología', 'biologia', 'Ciencias', 10),
  ('Química', 'quimica', 'Ciencias', 20),
  ('Física', 'fisica', 'Ciencias', 30),
  ('Aritmética', 'aritmetica', 'Matemática', 40),
  ('Álgebra', 'algebra', 'Matemática', 50),
  ('Geometría', 'geometria', 'Matemática', 60),
  ('Trigonometría', 'trigonometria', 'Matemática', 70),
  ('Razonamiento Matemático', 'razonamiento-matematico', 'Aptitud', 80),
  ('Razonamiento Verbal', 'razonamiento-verbal', 'Aptitud', 90),
  ('Economía', 'economia', 'Sociales', 100),
  ('Cívica', 'civica', 'Sociales', 110),
  ('Literatura', 'literatura', 'Letras', 120),
  ('Lenguaje', 'lenguaje', 'Letras', 130),
  ('Geografía', 'geografia', 'Sociales', 140),
  ('Historia del Perú', 'historia-del-peru', 'Sociales', 150),
  ('Historia Universal', 'historia-universal', 'Sociales', 160),
  ('Psicología', 'psicologia', 'Humanidades', 170),
  ('Filosofía', 'filosofia', 'Humanidades', 180),
  ('Inglés', 'ingles', 'Idiomas', 190),
  ('Cálculo Introducción', 'calculo-introduccion', 'Matemática', 200)
on conflict (slug) do update
set
  name = excluded.name,
  area = excluded.area,
  sort_order = excluded.sort_order,
  is_active = true;

create or replace function public.is_simulation_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() in (
    '66ec7f4b-ee05-42b4-81a6-482f044f6ea1'::uuid,
    '244726d8-4d30-49de-8aa9-5996244e460b'::uuid
  );
$$;

grant execute on function public.is_simulation_admin() to authenticated;

alter table public.exam_subjects enable row level security;

drop policy if exists "exam_subjects_select_active_or_admin" on public.exam_subjects;
create policy "exam_subjects_select_active_or_admin"
on public.exam_subjects for select
to authenticated
using (
  is_active = true
  or public.is_simulation_admin()
);

drop policy if exists "exam_subjects_admin_insert" on public.exam_subjects;
create policy "exam_subjects_admin_insert"
on public.exam_subjects for insert
to authenticated
with check (public.is_simulation_admin());

drop policy if exists "exam_subjects_admin_update" on public.exam_subjects;
create policy "exam_subjects_admin_update"
on public.exam_subjects for update
to authenticated
using (public.is_simulation_admin())
with check (public.is_simulation_admin());

drop policy if exists "exam_subjects_admin_delete" on public.exam_subjects;
create policy "exam_subjects_admin_delete"
on public.exam_subjects for delete
to authenticated
using (public.is_simulation_admin());

grant select on public.exam_subjects to authenticated;

do $$
begin
  if to_regclass('public.simulations') is not null then
    alter table public.simulations
      add column if not exists duration_minutes integer not null default 60;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'simulations_duration_minutes_check'
    ) then
      alter table public.simulations
        add constraint simulations_duration_minutes_check
        check (duration_minutes >= 1 and duration_minutes <= 300);
    end if;
  end if;

  if to_regclass('public.simulation_questions') is not null then
    alter table public.simulation_questions
      add column if not exists course_id uuid;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'simulation_questions_course_id_fkey'
    ) then
      alter table public.simulation_questions
        add constraint simulation_questions_course_id_fkey
        foreign key (course_id)
        references public.exam_subjects(id)
        on delete set null;
    end if;

    create index if not exists simulation_questions_course_id_idx
      on public.simulation_questions(course_id);
  end if;

  if to_regclass('public.simulation_attempts') is not null then
    alter table public.simulation_attempts
      add column if not exists duration_seconds integer;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'simulation_attempts_duration_seconds_check'
    ) then
      alter table public.simulation_attempts
        add constraint simulation_attempts_duration_seconds_check
        check (duration_seconds is null or duration_seconds >= 0);
    end if;

    create index if not exists simulation_attempts_first_attempt_idx
      on public.simulation_attempts(simulation_id, user_id, completed_at);
  end if;
end $$;

create or replace function public.get_simulation_rankings()
returns table (
  simulation_id uuid,
  user_id uuid,
  display_name text,
  best_score numeric,
  best_correct_count integer,
  question_count integer,
  attempt_count integer,
  last_completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with ranked_attempts as (
    select
      attempts.simulation_id,
      attempts.user_id,
      attempts.score,
      attempts.correct_count,
      attempts.question_count,
      attempts.completed_at,
      row_number() over (
        partition by attempts.simulation_id, attempts.user_id
        order by attempts.completed_at asc, attempts.id asc
      ) as attempt_rank,
      count(*) over (
        partition by attempts.simulation_id, attempts.user_id
      )::integer as attempt_count,
      max(attempts.completed_at) over (
        partition by attempts.simulation_id, attempts.user_id
      ) as last_completed_at
    from public.simulation_attempts attempts
    join public.simulations simulations
      on simulations.id = attempts.simulation_id
    where simulations.is_published = true
  )
  select
    ranked_attempts.simulation_id,
    ranked_attempts.user_id,
    coalesce(profiles.display_name, 'Estudiante') as display_name,
    ranked_attempts.score as best_score,
    ranked_attempts.correct_count as best_correct_count,
    ranked_attempts.question_count,
    ranked_attempts.attempt_count,
    ranked_attempts.last_completed_at
  from ranked_attempts
  left join public.profiles profiles
    on profiles.id = ranked_attempts.user_id
  where ranked_attempts.attempt_rank = 1
  order by ranked_attempts.score desc, ranked_attempts.correct_count desc, ranked_attempts.completed_at asc, display_name asc;
$$;

grant execute on function public.get_simulation_rankings() to authenticated;

create or replace function public.get_simulation_subject_averages(target_simulation_id uuid)
returns table (
  simulation_id uuid,
  subject_id uuid,
  subject_name text,
  subject_slug text,
  question_count integer,
  global_average_percentage numeric,
  global_user_count integer,
  peer_average_percentage numeric,
  peer_user_count integer,
  current_user_rank integer,
  participant_count integer
)
language sql
security definer
set search_path = public
as $$
  with authorized_simulation as (
    select simulations.id
    from public.simulations
    where simulations.id = target_simulation_id
    and (
      simulations.is_published = true
      or public.is_simulation_admin()
    )
  ),
  subject_questions as (
    select
      coalesce(questions.course_id::text, 'unassigned') as subject_key,
      questions.id::text as question_key,
      questions.course_id as subject_id,
      coalesce(subjects.name, 'Sin curso asignado') as subject_name,
      coalesce(subjects.slug, 'sin-curso-asignado') as subject_slug,
      coalesce(subjects.sort_order, 9999) as sort_order,
      questions.correct_option
    from public.simulation_questions questions
    join authorized_simulation
      on authorized_simulation.id = questions.simulation_id
    left join public.exam_subjects subjects
      on subjects.id = questions.course_id
  ),
  question_counts as (
    select
      subject_key,
      subject_id,
      subject_name,
      subject_slug,
      min(sort_order) as sort_order,
      count(*)::integer as question_count
    from subject_questions
    group by subject_key, subject_id, subject_name, subject_slug
  ),
  attempt_subject_scores as (
    select
      attempts.id as attempt_id,
      attempts.user_id,
      attempts.completed_at,
      subject_questions.subject_key,
      subject_questions.subject_id,
      subject_questions.subject_name,
      subject_questions.subject_slug,
      count(*)::integer as question_count,
      count(*) filter (
        where attempts.answers ->> subject_questions.question_key = subject_questions.correct_option
      )::integer as correct_count,
      round(
        (
          count(*) filter (
            where attempts.answers ->> subject_questions.question_key = subject_questions.correct_option
          )::numeric
          / nullif(count(*), 0)
        ) * 100,
        2
      ) as percentage
    from public.simulation_attempts attempts
    join authorized_simulation
      on authorized_simulation.id = attempts.simulation_id
    join subject_questions
      on true
    group by
      attempts.id,
      attempts.user_id,
      attempts.completed_at,
      subject_questions.subject_key,
      subject_questions.subject_id,
      subject_questions.subject_name,
      subject_questions.subject_slug
  ),
  ranked_user_subjects as (
    select
      attempt_subject_scores.*,
      row_number() over (
        partition by attempt_subject_scores.user_id, attempt_subject_scores.subject_key
        order by attempt_subject_scores.completed_at asc, attempt_subject_scores.attempt_id asc
      ) as attempt_rank
    from attempt_subject_scores
  ),
  first_user_subjects as (
    select *
    from ranked_user_subjects
    where attempt_rank = 1
  ),
  global_summary as (
    select
      subject_key,
      round(avg(percentage), 2) as average_percentage,
      count(*)::integer as user_count
    from first_user_subjects
    group by subject_key
  ),
  peer_summary as (
    select
      subject_key,
      round(avg(percentage), 2) as average_percentage,
      count(*)::integer as user_count
    from first_user_subjects
    where user_id <> auth.uid()
    group by subject_key
  ),
  ranked_subject_users as (
    select
      subject_key,
      user_id,
      rank() over (
        partition by subject_key
        order by percentage desc, correct_count desc, completed_at asc, attempt_id asc
      )::integer as subject_rank,
      count(*) over (partition by subject_key)::integer as participant_count
    from first_user_subjects
  )
  select
    target_simulation_id as simulation_id,
    question_counts.subject_id,
    question_counts.subject_name,
    question_counts.subject_slug,
    question_counts.question_count,
    global_summary.average_percentage as global_average_percentage,
    coalesce(global_summary.user_count, 0) as global_user_count,
    peer_summary.average_percentage as peer_average_percentage,
    coalesce(peer_summary.user_count, 0) as peer_user_count,
    ranked_subject_users.subject_rank as current_user_rank,
    coalesce(ranked_subject_users.participant_count, 0) as participant_count
  from question_counts
  left join global_summary
    on global_summary.subject_key = question_counts.subject_key
  left join peer_summary
    on peer_summary.subject_key = question_counts.subject_key
  left join ranked_subject_users
    on ranked_subject_users.subject_key = question_counts.subject_key
    and ranked_subject_users.user_id = auth.uid()
  order by question_counts.sort_order asc, question_counts.subject_name asc;
$$;

grant execute on function public.get_simulation_subject_averages(uuid) to authenticated;
