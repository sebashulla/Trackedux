-- Ejecuta este archivo en el SQL Editor de Supabase.
-- Crea una primera version de plantillas de examen y registra "Admisión UNMSM".
-- Es idempotente: puede ejecutarse mas de una vez sin duplicar la plantilla.

create extension if not exists pgcrypto;

-- Metadatos opcionales en tablas existentes. La app tiene fallback si aun no existen.
alter table public.exams add column if not exists template_code text;
alter table public.exams add column if not exists template_version text;
alter table public.exams add column if not exists academic_area text;
alter table public.exams add column if not exists source_note text;

alter table public.topics add column if not exists status text not null default 'pendiente';

do $$
begin
  alter table public.topics
    add constraint topics_status_check
    check (status in ('pendiente', 'en_progreso', 'completado', 'reforzar'))
    not valid;
exception
  when duplicate_object then null;
end;
$$;

update public.topics
set status = case when done then 'completado' else coalesce(status, 'pendiente') end;

create table if not exists public.exam_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  institution text,
  description text,
  version text,
  source_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_template_courses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.exam_templates(id) on delete cascade,
  name text not null,
  area text,
  importance text not null default 'media',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, name)
);

create table if not exists public.exam_template_topics (
  id uuid primary key default gen_random_uuid(),
  template_course_id uuid not null references public.exam_template_courses(id) on delete cascade,
  parent_topic_id uuid references public.exam_template_topics(id) on delete cascade,
  name text not null,
  code text,
  importance text not null default 'media',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists exam_template_topics_course_code_uidx
on public.exam_template_topics(template_course_id, code)
where code is not null;

alter table public.exam_templates enable row level security;
alter table public.exam_template_courses enable row level security;
alter table public.exam_template_topics enable row level security;

drop policy if exists "exam_templates_select_active" on public.exam_templates;
create policy "exam_templates_select_active"
on public.exam_templates for select
to authenticated
using (is_active = true);

drop policy if exists "exam_template_courses_select_active" on public.exam_template_courses;
create policy "exam_template_courses_select_active"
on public.exam_template_courses for select
to authenticated
using (
  exists (
    select 1 from public.exam_templates
    where exam_templates.id = exam_template_courses.template_id
    and exam_templates.is_active = true
  )
);

drop policy if exists "exam_template_topics_select_active" on public.exam_template_topics;
create policy "exam_template_topics_select_active"
on public.exam_template_topics for select
to authenticated
using (
  exists (
    select 1
    from public.exam_template_courses
    join public.exam_templates on exam_templates.id = exam_template_courses.template_id
    where exam_template_courses.id = exam_template_topics.template_course_id
    and exam_templates.is_active = true
  )
);

insert into public.exam_templates (code, name, institution, description, version, source_note, is_active)
values (
  'unmsm-2026-general',
  'AdmisiÃ³n UNMSM',
  'Universidad Nacional Mayor de San Marcos',
  'Plantilla basada en el temario general de admision UNMSM.',
  '2026-II inicial',
  'Plantilla referencial basada en el temario de admision UNMSM. Revisa siempre el prospecto oficial actualizado.',
  true
)
on conflict (code) do update
set name = excluded.name,
    institution = excluded.institution,
    description = excluded.description,
    version = excluded.version,
    source_note = excluded.source_note,
    is_active = excluded.is_active;

create temp table _unmsm_courses (
  name text primary key,
  sort_order integer not null
) on commit drop;

insert into _unmsm_courses (name, sort_order)
values
  ('Habilidad Verbal', 1),
  ('Habilidad LÃ³gico-MatemÃ¡tica', 2),
  ('MatemÃ¡tica', 3),
  ('Lenguaje', 4),
  ('Literatura', 5),
  ('PsicologÃ­a', 6),
  ('EducaciÃ³n CÃ­vica', 7),
  ('Historia del PerÃº', 8),
  ('Historia Universal', 9),
  ('GeografÃ­a', 10),
  ('EconomÃ­a', 11),
  ('FilosofÃ­a', 12),
  ('FÃ­sica', 13),
  ('QuÃ­mica', 14),
  ('BiologÃ­a', 15)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into public.exam_template_courses (template_id, name, importance, notes, sort_order)
select
  exam_templates.id,
  _unmsm_courses.name,
  'media',
  'Curso base de la prueba general UNMSM 2026-II.',
  _unmsm_courses.sort_order
from _unmsm_courses
cross join public.exam_templates
where exam_templates.code = 'unmsm-2026-general'
on conflict (template_id, name) do update
set importance = excluded.importance,
    notes = excluded.notes,
    sort_order = excluded.sort_order;

create temp table _unmsm_topics (
  course_name text not null,
  parent_code text,
  parent_name text,
  topic_code text not null,
  topic_name text not null,
  sort_order integer not null
) on commit drop;

insert into _unmsm_topics (course_name, parent_code, parent_name, topic_code, topic_name, sort_order)
values
  ('Habilidad Verbal', null, null, 'hv-01', 'Textos con grafico', 1),
  ('Habilidad Verbal', null, null, 'hv-02', 'Textos dialecticos', 2),
  ('Habilidad Verbal', null, null, 'hv-03', 'Textos en ingles basico', 3),
  ('Habilidad Verbal', 'hv-p04', 'Tema central e idea principal', 'hv-04-01', 'Cohesion', 4),
  ('Habilidad Verbal', 'hv-p04', 'Tema central e idea principal', 'hv-04-02', 'Coherencia', 5),
  ('Habilidad Verbal', 'hv-p05', 'Sintesis', 'hv-05-01', 'Seleccionar, generalizar y abstraer informacion', 6),
  ('Habilidad Verbal', 'hv-p06', 'Relaciones semantico-textuales', 'hv-06-01', 'Sinonimia contextual', 7),
  ('Habilidad Verbal', 'hv-p06', 'Relaciones semantico-textuales', 'hv-06-02', 'Antonimia contextual', 8),
  ('Habilidad Verbal', 'hv-p06', 'Relaciones semantico-textuales', 'hv-06-03', 'Denotacion y connotacion', 9),
  ('Habilidad Verbal', 'hv-p07', 'Compatibilidad e incompatibilidad', 'hv-07-01', 'Compatibilidad literal e inferencial', 10),
  ('Habilidad Verbal', 'hv-p08', 'Inferencia', 'hv-08-01', 'Inferencia holistica, de datos, lexica, causal, de intencion y prospectiva', 11),
  ('Habilidad Verbal', 'hv-p09', 'Extrapolacion', 'hv-09-01', 'Extrapolacion cognitiva y referencial', 12),

  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-01', 'Maximos y minimos', 1),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-02', 'Pesadas y balanzas', 2),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-03', 'Arreglos numericos', 3),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-04', 'Seccionamientos y cortes', 4),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-05', 'Dados, cerillos, domino y elementos recreativos', 5),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-06', 'Calendarios', 6),
  ('Habilidad Lógico-Matemática', 'hlm-p01', 'Problemas de cantidad', 'hlm-01-07', 'Traslados', 7),
  ('Habilidad Lógico-Matemática', 'hlm-p02', 'Problemas de regularidad, equivalencia y cambio', 'hlm-02-01', 'Frecuencia de sucesos e induccion', 8),
  ('Habilidad Lógico-Matemática', 'hlm-p02', 'Problemas de regularidad, equivalencia y cambio', 'hlm-02-02', 'Interpretacion de informacion', 9),
  ('Habilidad Lógico-Matemática', 'hlm-p03', 'Problemas de forma, movimiento y localizacion', 'hlm-03-01', 'Rotacion y traslacion de figuras', 10),
  ('Habilidad Lógico-Matemática', 'hlm-p03', 'Problemas de forma, movimiento y localizacion', 'hlm-03-02', 'Conteo de figuras', 11),
  ('Habilidad Lógico-Matemática', 'hlm-p03', 'Problemas de forma, movimiento y localizacion', 'hlm-03-03', 'Simetria y reflexiones', 12),
  ('Habilidad Lógico-Matemática', 'hlm-p04', 'Gestion de datos e incertidumbre', 'hlm-04-01', 'Tablas y graficos estadisticos', 13),
  ('Habilidad Lógico-Matemática', 'hlm-p04', 'Gestion de datos e incertidumbre', 'hlm-04-02', 'Suficiencia de datos', 14),
  ('Habilidad Lógico-Matemática', 'hlm-p04', 'Gestion de datos e incertidumbre', 'hlm-04-03', 'Certeza', 15),
  ('Habilidad Lógico-Matemática', 'hlm-p04', 'Gestion de datos e incertidumbre', 'hlm-04-04', 'Verdades y mentiras', 16),
  ('Habilidad Lógico-Matemática', 'hlm-p04', 'Gestion de datos e incertidumbre', 'hlm-04-05', 'Diagramas de flujo', 17),

  ('Matemática', 'mat-p01', 'Aritmetica', 'mat-01-01', 'Relaciones logicas y conjuntos', 1),
  ('Matemática', 'mat-p01', 'Aritmetica', 'mat-01-02', 'Numeros naturales, enteros y racionales', 2),
  ('Matemática', 'mat-p01', 'Aritmetica', 'mat-01-03', 'Divisibilidad, numeros primos, MCD y MCM', 3),
  ('Matemática', 'mat-p01', 'Aritmetica', 'mat-01-04', 'Razones, proporciones, porcentajes, sucesiones y progresiones', 4),
  ('Matemática', 'mat-p01', 'Aritmetica', 'mat-01-05', 'Estadistica y probabilidad', 5),
  ('Matemática', 'mat-p02', 'Geometria', 'mat-02-01', 'Segmento de recta, angulos, triangulos y rectas', 6),
  ('Matemática', 'mat-p02', 'Geometria', 'mat-02-02', 'Circunferencia, poligonos y semejanza de triangulos', 7),
  ('Matemática', 'mat-p02', 'Geometria', 'mat-02-03', 'Teorema de Tales, Pitagoras y areas', 8),
  ('Matemática', 'mat-p02', 'Geometria', 'mat-02-04', 'Poliedros, cilindro, cono y esfera', 9),
  ('Matemática', 'mat-p02', 'Geometria', 'mat-02-05', 'Geometria analitica: recta, circunferencia, parabola y elipse', 10),
  ('Matemática', 'mat-p03', 'Algebra', 'mat-03-01', 'Numeros reales y complejos', 11),
  ('Matemática', 'mat-p03', 'Algebra', 'mat-03-02', 'Ecuaciones, inecuaciones y sistemas de ecuaciones', 12),
  ('Matemática', 'mat-p03', 'Algebra', 'mat-03-03', 'Expresiones algebraicas, polinomios, teorema del resto y factor', 13),
  ('Matemática', 'mat-p03', 'Algebra', 'mat-03-04', 'Productos notables, factorizacion y funciones reales', 14),
  ('Matemática', 'mat-p04', 'Trigonometria', 'mat-04-01', 'Sistemas de medidas angulares y razones trigonometricas', 15),
  ('Matemática', 'mat-p04', 'Trigonometria', 'mat-04-02', 'Angulo en posicion normal y circulo trigonometrico', 16),
  ('Matemática', 'mat-p04', 'Trigonometria', 'mat-04-03', 'Identidades y ecuaciones trigonometricas', 17),
  ('Matemática', 'mat-p04', 'Trigonometria', 'mat-04-04', 'Triangulos oblicuangulos y funciones trigonometricas', 18),

  ('Lenguaje', 'len-p01', 'Comunicacion, lenguaje y lengua', 'len-01-01', 'Lengua y habla, variedades y realidad linguistica del Peru', 1),
  ('Lenguaje', 'len-p02', 'Fonologia', 'len-02-01', 'Fonema, silaba, diptongo, triptongo e hiato', 2),
  ('Lenguaje', 'len-p03', 'Acentuacion escrita', 'len-03-01', 'Acentuacion general y especial', 3),
  ('Lenguaje', 'len-p04', 'Morfosintaxis', 'len-04-01', 'Morfologia, frase nominal, sustantivo y adjetivo', 4),
  ('Lenguaje', 'len-p04', 'Morfosintaxis', 'len-04-02', 'Frase verbal, verbo y oracion', 5),
  ('Lenguaje', 'len-p05', 'Discurso escrito', 'len-05-01', 'Puntuacion y uso de mayusculas', 6),
  ('Lenguaje', 'len-p06', 'Semantica', 'len-06-01', 'Signo linguistico, significado, contexto y relaciones semanticas', 7),

  ('Literatura', null, null, 'lit-01', 'Generos literarios y figuras literarias', 1),
  ('Literatura', null, null, 'lit-02', 'Literatura antigua: Iliada, Odisea y Edipo rey', 2),
  ('Literatura', null, null, 'lit-03', 'Literatura moderna y contemporanea', 3),
  ('Literatura', null, null, 'lit-04', 'Literatura espanola', 4),
  ('Literatura', null, null, 'lit-05', 'Literatura hispanoamericana', 5),
  ('Literatura', null, null, 'lit-06', 'Literatura peruana y autores principales', 6),

  ('Psicología', null, null, 'psi-01', 'Introduccion a la psicologia y enfoques psicologicos', 1),
  ('Psicología', null, null, 'psi-02', 'Bases biologicas del comportamiento humano', 2),
  ('Psicología', null, null, 'psi-03', 'Socializacion, familia, actitudes y valores', 3),
  ('Psicología', null, null, 'psi-04', 'Procesos cognitivos y aprendizaje', 4),
  ('Psicología', null, null, 'psi-05', 'Desarrollo humano e identidad', 5),
  ('Psicología', null, null, 'psi-06', 'Afectividad humana y motivacion', 6),

  ('Educación Cívica', null, null, 'civ-01', 'Derechos humanos y Declaracion Universal de los Derechos Humanos', 1),
  ('Educación Cívica', null, null, 'civ-02', 'Constitucion Politica del Peru y garantias constitucionales', 2),
  ('Educación Cívica', null, null, 'civ-03', 'Participacion ciudadana y mecanismos de control ciudadano', 3),
  ('Educación Cívica', null, null, 'civ-04', 'Organizacion de la sociedad civil', 4),
  ('Educación Cívica', null, null, 'civ-05', 'Convivencia democratica, identidad e interculturalidad', 5),
  ('Educación Cívica', null, null, 'civ-06', 'Estructura y funciones del Estado', 6),

  ('Historia del Perú', null, null, 'hperu-01', 'Poblamiento de America y cultura en los Andes', 1),
  ('Historia del Perú', null, null, 'hperu-02', 'Periodo formativo, desarrollos regionales y estados panandinos', 2),
  ('Historia del Perú', null, null, 'hperu-03', 'Tawantinsuyo, conquista y orden virreinal', 3),
  ('Historia del Perú', null, null, 'hperu-04', 'Reformas borbonicas e independencia', 4),
  ('Historia del Perú', null, null, 'hperu-05', 'Siglo XIX, guerra con Chile y reconstruccion nacional', 5),
  ('Historia del Perú', null, null, 'hperu-06', 'Republica Aristocratica, Oncenio y siglo XX', 6),
  ('Historia del Perú', null, null, 'hperu-07', 'Peru reciente, fujimorato y CVR', 7),

  ('Historia Universal', null, null, 'huniv-01', 'Historia como ciencia y periodizacion', 1),
  ('Historia Universal', null, null, 'huniv-02', 'Hominizacion y primeras civilizaciones', 2),
  ('Historia Universal', null, null, 'huniv-03', 'Grecia, Roma y Edad Media', 3),
  ('Historia Universal', null, null, 'huniv-04', 'Modernidad y revoluciones burguesas', 4),
  ('Historia Universal', null, null, 'huniv-05', 'Siglo XIX y primera mitad del siglo XX', 5),
  ('Historia Universal', null, null, 'huniv-06', 'Guerra Fria, globalizacion y mundo contemporaneo', 6),

  ('Geografía', null, null, 'geo-01', 'Espacio geografico y cartografia', 1),
  ('Geografía', null, null, 'geo-02', 'Relieve, clima, hidrografia y cambio climatico', 2),
  ('Geografía', null, null, 'geo-03', 'Gestion de riesgo de desastres', 3),
  ('Geografía', null, null, 'geo-04', 'Biodiversidad, ecosistemas y recursos naturales', 4),
  ('Geografía', null, null, 'geo-05', 'Actividades economicas y poblacion peruana', 5),
  ('Geografía', null, null, 'geo-06', 'Organizacion politica del Peru y continentes', 6),

  ('Economía', null, null, 'eco-01', 'Principios economicos y flujo circular', 1),
  ('Economía', null, null, 'eco-02', 'Mercado de bienes y factores', 2),
  ('Economía', null, null, 'eco-03', 'Sector financiero y politica monetaria', 3),
  ('Economía', null, null, 'eco-04', 'Sector publico y politica fiscal', 4),
  ('Economía', null, null, 'eco-05', 'Consumo, ahorro, inversion y sector externo', 5),
  ('Economía', null, null, 'eco-06', 'Crecimiento, desarrollo, informalidad y emprendimiento', 6),

  ('Filosofía', null, null, 'fil-01', 'Nociones preliminares e historia de la filosofia', 1),
  ('Filosofía', null, null, 'fil-02', 'Filosofía latinoamericana y peruana', 2),
  ('Filosofía', null, null, 'fil-03', 'Etica, sociedad y democracia', 3),
  ('Filosofía', null, null, 'fil-04', 'Ciencia, conocimiento y metodo cientifico', 4),
  ('Filosofía', null, null, 'fil-05', 'Argumentacion y apreciacion estetica', 5),

  ('Física', null, null, 'fis-01', 'Cinematica y dinamica del movimiento', 1),
  ('Física', null, null, 'fis-02', 'Cantidad de movimiento, gravitacion y leyes de conservacion', 2),
  ('Física', null, null, 'fis-03', 'Fenomenos termicos y mecanica de fluidos', 3),
  ('Física', null, null, 'fis-04', 'Electrostatica, electrodinamica y electromagnetismo', 4),
  ('Física', null, null, 'fis-05', 'Oscilaciones, ondas, luz y fisica moderna', 5),

  ('Química', null, null, 'qui-01', 'Materia, SI, estructura atomica y tabla periodica', 1),
  ('Química', null, null, 'qui-02', 'Enlace quimico y nomenclatura inorganica', 2),
  ('Química', null, null, 'qui-03', 'Reacciones quimicas y estequiometria', 3),
  ('Química', null, null, 'qui-04', 'Estados de la materia, soluciones, acidos y bases', 4),
  ('Química', null, null, 'qui-05', 'Cinetica, equilibrio y electroquimica', 5),
  ('Química', null, null, 'qui-06', 'Química organica y recursos naturales', 6),

  ('Biología', null, null, 'bio-01', 'Biología, seres vivos, celula y tejidos', 1),
  ('Biología', null, null, 'bio-02', 'Nutricion, digestion, circulacion y excrecion', 2),
  ('Biología', null, null, 'bio-03', 'Sistema inmunologico, endocrino y nervioso', 3),
  ('Biología', null, null, 'bio-04', 'Reproduccion y genetica', 4),
  ('Biología', null, null, 'bio-05', 'Evolucion, reino animal y reino plantae', 5),
  ('Biología', null, null, 'bio-06', 'Salud, higiene, ecologia y recursos naturales', 6);

-- Primero se insertan temas padre para las secciones que tienen subtemas.
insert into public.exam_template_topics (template_course_id, parent_topic_id, name, code, importance, notes, sort_order)
select
  courses.id,
  null,
  topic_seed.parent_name,
  topic_seed.parent_code,
  'media',
  'Tema padre del temario UNMSM 2026-II.',
  min(topic_seed.sort_order)
from _unmsm_topics topic_seed
join public.exam_templates templates on templates.code = 'unmsm-2026-general'
join public.exam_template_courses courses
  on courses.template_id = templates.id
  and courses.name = topic_seed.course_name
where topic_seed.parent_code is not null
group by courses.id, topic_seed.parent_code, topic_seed.parent_name
on conflict (template_course_id, code) where code is not null do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    notes = excluded.notes;

-- Luego se insertan temas hoja. Si parent_code es null, el tema queda en primer nivel.
insert into public.exam_template_topics (template_course_id, parent_topic_id, name, code, importance, notes, sort_order)
select
  courses.id,
  parent_topics.id,
  topic_seed.topic_name,
  topic_seed.topic_code,
  'media',
  'Tema inicial editable al copiar la plantilla a una preparacion personal.',
  topic_seed.sort_order
from _unmsm_topics topic_seed
join public.exam_templates templates on templates.code = 'unmsm-2026-general'
join public.exam_template_courses courses
  on courses.template_id = templates.id
  and courses.name = topic_seed.course_name
left join public.exam_template_topics parent_topics
  on parent_topics.template_course_id = courses.id
  and parent_topics.code = topic_seed.parent_code
on conflict (template_course_id, code) where code is not null do update
set parent_topic_id = excluded.parent_topic_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    notes = excluded.notes;
