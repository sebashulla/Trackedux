-- Ejecuta este archivo en el SQL Editor de Supabase.
-- Registra la plantilla "Admision UNI" como complemento de exam_templates_unmsm.sql.
-- Es idempotente: puede ejecutarse mas de una vez sin duplicar la plantilla ni sus temas.

create extension if not exists pgcrypto;

-- Metadatos opcionales para las tablas actuales de Trackedux.
alter table public.exams add column if not exists template_code text;
alter table public.exams add column if not exists template_version text;
alter table public.exams add column if not exists academic_area text;
alter table public.exams add column if not exists target_career text;
alter table public.exams add column if not exists current_level text;
alter table public.exams add column if not exists source_note text;

alter table public.courses add column if not exists block_name text;
alter table public.courses add column if not exists importance text not null default 'media';
alter table public.courses add column if not exists notes text;

alter table public.topics add column if not exists code text;
alter table public.topics add column if not exists importance text not null default 'media';
alter table public.topics add column if not exists notes text;
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

-- Tablas globales de plantillas. La app copia estos datos a exams/courses/topics del usuario.
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
  block_name text,
  area text,
  importance text not null default 'media',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, name)
);

alter table public.exam_template_courses add column if not exists block_name text;

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
  'uni-2026-general',
  'Admision UNI',
  'Universidad Nacional de Ingenieria',
  'Plantilla basada en el temario de admision UNI.',
  '2026 inicial',
  'Plantilla referencial basada en el temario de admision UNI. Revisa siempre el prospecto oficial actualizado.',
  true
)
on conflict (code) do update
set name = excluded.name,
    institution = excluded.institution,
    description = excluded.description,
    version = excluded.version,
    source_note = excluded.source_note,
    is_active = excluded.is_active;

create temp table _uni_courses (
  name text primary key,
  block_name text,
  area text,
  importance text,
  notes text,
  sort_order integer not null
) on commit drop;

insert into _uni_courses (name, block_name, area, importance, notes, sort_order)
values
  ('Razonamiento Matematico', 'Aptitud Academica', null, 'alta', 'Prioriza practica cronometrada, patrones visuales y problemas de suficiencia.', 1),
  ('Razonamiento Verbal', 'Aptitud Academica', null, 'alta', 'Trabaja vocabulario contextual y comprension lectora con textos continuos y discontinuos.', 2),
  ('Comunicacion y Lengua', 'Humanidades', null, 'media', 'Enfoca normativa, morfosintaxis y semantica aplicada.', 3),
  ('Literatura', 'Humanidades', null, 'media', 'Agrupa autores y obras por literatura universal, espanola, latinoamericana y peruana.', 4),
  ('Historia del Peru y del Mundo', 'Humanidades', null, 'media', 'Relaciona procesos mundiales con procesos peruanos.', 5),
  ('Geografia y Desarrollo Nacional', 'Humanidades', null, 'media', 'Incluye geografia fisica, economica, poblacional y ciudadania segun el temario UNI.', 6),
  ('Economia', 'Humanidades', null, 'media', 'Repasa definiciones y relaciones macroeconomicas.', 7),
  ('Filosofia y Logica', 'Humanidades', null, 'media', 'Integra historia de la filosofia, etica, gnoseologia, epistemologia y logica formal.', 8),
  ('Psicologia', 'Humanidades', null, 'media', 'Organiza los procesos cognitivos y sociales.', 9),
  ('Matematica Parte I: Aritmetica y Algebra', 'Matematica', null, 'alta', 'Curso de alto peso. Trabaja teoria y problemas en ciclos cortos.', 10),
  ('Matematica Parte II: Geometria y Trigonometria', 'Matematica', null, 'alta', 'Separa geometria plana, espacio y trigonometria para evitar saturacion.', 11),
  ('Fisica', 'Ciencias', null, 'alta', 'Prioriza mecanica, electricidad y termodinamica con problemas tipo admision.', 12),
  ('Quimica', 'Ciencias', null, 'alta', 'Domina estructura atomica, estequiometria, soluciones, equilibrio y organica.', 13),
  ('Aptitud Vocacional Arquitectura', 'Prueba Especial', null, 'media', 'Solo aplica a postulantes de Arquitectura; editala segun tu carrera.', 14);

insert into public.exam_template_courses (template_id, name, block_name, area, importance, notes, sort_order)
select t.id, c.name, c.block_name, c.area, c.importance, c.notes, c.sort_order
from _uni_courses c
cross join public.exam_templates t
where t.code = 'uni-2026-general'
on conflict (template_id, name) do update
set block_name = excluded.block_name,
    area = excluded.area,
    importance = excluded.importance,
    notes = excluded.notes,
    sort_order = excluded.sort_order;

-- Se reemplazan los temas de esta plantilla para mantener idempotencia sin duplicados.
delete from public.exam_template_topics
where template_course_id in (
  select c.id
  from public.exam_template_courses c
  join public.exam_templates t on t.id = c.template_id
  where t.code = 'uni-2026-general'
);

create temp table _uni_topics (
  course_name text not null,
  code text not null,
  name text not null,
  importance text not null default 'media',
  notes text,
  sort_order integer not null
) on commit drop;

insert into _uni_topics (course_name, code, name, importance, notes, sort_order)
values
  ('Razonamiento Matematico', 'UNI-RM-01', 'Analisis de figuras', 'alta', 'Series, analogias, distribucion, solidos y conteos.', 1),
  ('Razonamiento Matematico', 'UNI-RM-02', 'Razonamiento logico', 'alta', 'Logica proposicional, inferencia, clases y juegos logicos.', 2),
  ('Razonamiento Matematico', 'UNI-RM-03', 'Sucesiones y distribuciones numericas', 'alta', 'Ley de formacion, sucesiones notables y distribuciones.', 3),
  ('Razonamiento Matematico', 'UNI-RM-04', 'Suficiencia de datos', 'media', 'Analisis de enunciados con dos datos.', 4),
  ('Razonamiento Matematico', 'UNI-RM-05', 'Razonamiento numerico', 'alta', 'Operaciones, criptoaritmetica, ecuaciones, proporciones, conjuntos y probabilidad.', 5),
  ('Razonamiento Matematico', 'UNI-RM-06', 'Areas, perimetros y operadores', 'media', 'Figuras geometricas y operadores definidos.', 6),
  ('Razonamiento Matematico', 'UNI-RM-07', 'Tablas y graficos estadisticos', 'media', 'Pictogramas, barras, frecuencias e histogramas.', 7),

  ('Razonamiento Verbal', 'UNI-RV-01', 'Definiciones', 'media', 'Genero proximo, diferencia especifica y rasgos minimos.', 1),
  ('Razonamiento Verbal', 'UNI-RV-02', 'Analogias', 'alta', 'Relaciones analogicas principales.', 2),
  ('Razonamiento Verbal', 'UNI-RV-03', 'Precision lexica en contexto', 'alta', 'Denotacion, connotacion y sentido contextual.', 3),
  ('Razonamiento Verbal', 'UNI-RV-04', 'Antonimia contextual', 'media', 'Antonimos segun contexto.', 4),
  ('Razonamiento Verbal', 'UNI-RV-05', 'Conectores logico-textuales', 'alta', 'Conjunciones, locuciones y expresiones lexicalizadas.', 5),
  ('Razonamiento Verbal', 'UNI-RV-06', 'Informacion eliminada', 'media', 'Redundancia e impertinencia.', 6),
  ('Razonamiento Verbal', 'UNI-RV-07', 'Plan de redaccion', 'alta', 'Secuencias cronologicas, causa-efecto, analisis y comparacion.', 7),
  ('Razonamiento Verbal', 'UNI-RV-08', 'Inclusion de enunciado', 'media', 'Progresion tematica, topico y comento.', 8),
  ('Razonamiento Verbal', 'UNI-RV-09', 'Coherencia y cohesion textual', 'alta', 'Repeticion, sustitucion, elipsis y enlaces.', 9),
  ('Razonamiento Verbal', 'UNI-RV-10', 'Comprension de lectura', 'alta', 'Textos continuos y discontinuos, idea principal, resumen, inferencia y extrapolacion.', 10),

  ('Comunicacion y Lengua', 'UNI-LEN-01', 'Lenguaje, lengua y habla', 'media', 'Comunicacion humana, clases y elementos.', 1),
  ('Comunicacion y Lengua', 'UNI-LEN-02', 'Escritura y grafemas', 'media', 'Uso de grafemas, minusculas y mayusculas.', 2),
  ('Comunicacion y Lengua', 'UNI-LEN-03', 'Silaba y acentuacion', 'alta', 'Separacion silabica, diptongo, triptongo, hiato y acentuacion.', 3),
  ('Comunicacion y Lengua', 'UNI-LEN-04', 'Signos de puntuacion', 'media', 'Uso normativo de signos de puntuacion.', 4),
  ('Comunicacion y Lengua', 'UNI-LEN-05', 'Semantica de las palabras', 'media', 'Denotacion, connotacion y relaciones semanticas.', 5),
  ('Comunicacion y Lengua', 'UNI-LEN-06', 'Morfologia y correccion idiomatica', 'alta', 'Sustantivo, determinante, adjetivo y grupo nominal.', 6),
  ('Comunicacion y Lengua', 'UNI-LEN-07', 'Verbo y verboides', 'alta', 'Conjugacion y usos normativos.', 7),
  ('Comunicacion y Lengua', 'UNI-LEN-08', 'Preposicion, conjuncion y adverbio', 'media', 'Clases, funciones y uso normativo.', 8),
  ('Comunicacion y Lengua', 'UNI-LEN-09', 'Oracion simple y compuesta', 'alta', 'Concordancia, coordinadas, yuxtapuestas y subordinadas.', 9),
  ('Comunicacion y Lengua', 'UNI-LEN-10', 'Vicios del lenguaje', 'media', 'Anacoluto, pleonasmo, dequeismo, extranjerismos y cacofonia.', 10),

  ('Literatura', 'UNI-LIT-01', 'Teoria literaria', 'media', 'Generos, subgeneros y figuras literarias.', 1),
  ('Literatura', 'UNI-LIT-02', 'Literatura universal antigua y medieval', 'media', 'Homero, tragedia griega y Dante.', 2),
  ('Literatura', 'UNI-LIT-03', 'Renacimiento, Barroco, Romanticismo y Realismo', 'media', 'Shakespeare, Dostoievski, Flaubert y Balzac.', 3),
  ('Literatura', 'UNI-LIT-04', 'Narrativa contemporanea universal', 'media', 'Kafka y Hemingway.', 4),
  ('Literatura', 'UNI-LIT-05', 'Literatura espanola', 'media', 'Mio Cid, Siglo de Oro, Cervantes y generaciones del 98 y 27.', 5),
  ('Literatura', 'UNI-LIT-06', 'Literatura latinoamericana', 'media', 'Modernismo, nueva narrativa, Boom y poesia contemporanea.', 6),
  ('Literatura', 'UNI-LIT-07', 'Literatura peruana', 'media', 'Quechua, colonial, republicana, vanguardismo, indigenismo y literatura actual.', 7),

  ('Historia del Peru y del Mundo', 'UNI-HIS-01', 'Hominizacion y prehistoria', 'media', null, 1),
  ('Historia del Peru y del Mundo', 'UNI-HIS-02', 'Poblamiento de America y del Peru', 'media', null, 2),
  ('Historia del Peru y del Mundo', 'UNI-HIS-03', 'Culturas antiguas y cultura andina', 'media', null, 3),
  ('Historia del Peru y del Mundo', 'UNI-HIS-04', 'Edad Media y surgimiento de Occidente', 'media', null, 4),
  ('Historia del Peru y del Mundo', 'UNI-HIS-05', 'Tahuantinsuyo', 'alta', 'Organizacion economica, social, cultural y dominio territorial.', 5),
  ('Historia del Peru y del Mundo', 'UNI-HIS-06', 'Renacimiento, expansion europea e Ilustracion', 'media', null, 6),
  ('Historia del Peru y del Mundo', 'UNI-HIS-07', 'Virreinato e independencia del Peru', 'alta', null, 7),
  ('Historia del Peru y del Mundo', 'UNI-HIS-08', 'Revoluciones e industrializacion mundial', 'media', null, 8),
  ('Historia del Peru y del Mundo', 'UNI-HIS-09', 'Republica peruana del siglo XIX', 'media', null, 9),
  ('Historia del Peru y del Mundo', 'UNI-HIS-10', 'Siglo XX y mundo contemporaneo', 'media', null, 10),
  ('Historia del Peru y del Mundo', 'UNI-HIS-11', 'Peru contemporaneo', 'media', null, 11),

  ('Geografia y Desarrollo Nacional', 'UNI-GEO-01', 'Teoria geografica y localizacion', 'media', null, 1),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-02', 'Cartografia y representacion del espacio', 'media', null, 2),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-03', 'Ecosistemas y desarrollo sostenible', 'media', 'Incluye fenomenos, desastres, contaminacion y gestion de riesgos.', 3),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-04', 'Areas protegidas del Peru', 'media', null, 4),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-05', 'Geomorfologia, mar e hidrografia del Peru', 'alta', null, 5),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-06', 'Regiones naturales y ecorregiones', 'media', null, 6),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-07', 'Actividades economicas del Peru', 'media', null, 7),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-08', 'Geografia humana y dinamica poblacional', 'media', null, 8),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-09', 'Geopolitica e integracion del Peru', 'media', null, 9),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-10', 'Estado y participacion ciudadana', 'media', 'Poderes publicos, descentralizacion, democracia y control ciudadano.', 10),
  ('Geografia y Desarrollo Nacional', 'UNI-GEO-11', 'Convivencia y diversidad cultural', 'media', null, 11),

  ('Economia', 'UNI-ECO-01', 'Fundamentos de economia', 'media', 'Definicion, ramas, problemas y doctrinas economicas.', 1),
  ('Economia', 'UNI-ECO-02', 'Necesidades, bienes y factores productivos', 'media', null, 2),
  ('Economia', 'UNI-ECO-03', 'Proceso economico y sectores', 'media', null, 3),
  ('Economia', 'UNI-ECO-04', 'Mercado, demanda y oferta', 'alta', 'Equilibrio y modelos de mercado.', 4),
  ('Economia', 'UNI-ECO-05', 'Empresa, dinero y sistema financiero', 'media', null, 5),
  ('Economia', 'UNI-ECO-06', 'Sector publico y politicas economicas', 'media', null, 6),
  ('Economia', 'UNI-ECO-07', 'Macroeconomia, crecimiento y desarrollo', 'media', null, 7),
  ('Economia', 'UNI-ECO-08', 'Comercio internacional e integracion', 'media', null, 8),

  ('Filosofia y Logica', 'UNI-FIL-01', 'Origen y disciplinas de la filosofia', 'media', null, 1),
  ('Filosofia y Logica', 'UNI-FIL-02', 'Filosofia antigua', 'media', 'Presocraticos, Socrates, Platon, Aristoteles y escuelas helenisticas.', 2),
  ('Filosofia y Logica', 'UNI-FIL-03', 'Filosofia moderna', 'media', 'Renacimiento, racionalismo, empirismo, Ilustracion, Kant y Hegel.', 3),
  ('Filosofia y Logica', 'UNI-FIL-04', 'Filosofia contemporanea', 'media', 'Positivismo, Marx, Nietzsche, Wittgenstein, Popper.', 4),
  ('Filosofia y Logica', 'UNI-FIL-05', 'Axiologia, etica y politica', 'media', null, 5),
  ('Filosofia y Logica', 'UNI-FIL-06', 'Gnoseologia y epistemologia', 'media', null, 6),
  ('Filosofia y Logica', 'UNI-LOG-01', 'Logica proposicional', 'media', 'Proposiciones, formalizacion, tablas de verdad.', 7),
  ('Filosofia y Logica', 'UNI-LOG-02', 'Inferencia y silogismo', 'media', 'Reglas de inferencia y silogismo categorico.', 8),

  ('Psicologia', 'UNI-PSI-01', 'Definicion, objetivos y metodos', 'media', null, 1),
  ('Psicologia', 'UNI-PSI-02', 'Origen y escuelas psicologicas', 'media', null, 2),
  ('Psicologia', 'UNI-PSI-03', 'Factores biologicos del comportamiento', 'media', 'Neurona, neurotransmisores, sistema nervioso y endocrino.', 3),
  ('Psicologia', 'UNI-PSI-04', 'Psicoanalisis y actividad consciente', 'media', null, 4),
  ('Psicologia', 'UNI-PSI-05', 'Procesos cognitivos', 'alta', 'Percepcion, memoria, imaginacion, inteligencia y test.', 5),
  ('Psicologia', 'UNI-PSI-06', 'Aprendizaje y motivacion', 'media', null, 6),
  ('Psicologia', 'UNI-PSI-07', 'Pensamiento, lenguaje y personalidad', 'media', null, 7),
  ('Psicologia', 'UNI-PSI-08', 'Socializacion, sexualidad y salud psicologica', 'media', null, 8),

  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-01', 'Razones y proporciones', 'alta', null, 1),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-02', 'Magnitudes proporcionales', 'alta', 'Regla de tres, porcentajes, incrementos y reparto proporcional.', 2),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-03', 'Interes simple y compuesto', 'media', null, 3),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-04', 'Mezcla y aleacion', 'media', null, 4),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-05', 'Estadistica', 'media', 'Tablas, graficos, tendencia central y dispersion.', 5),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-06', 'Probabilidad y conteo', 'alta', 'Eventos, factorial, permutaciones, combinaciones y variable aleatoria.', 6),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-07', 'Numeracion', 'media', null, 7),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-08', 'Numeros naturales, enteros, divisibilidad y primos', 'alta', 'Criterios, diofanticas, MCD y MCM.', 8),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-09', 'Numeros racionales e irracionales', 'alta', null, 9),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-10', 'Potenciacion y radicacion', 'media', null, 10),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-11', 'Logica, conjuntos y numeros reales', 'alta', null, 11),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-12', 'Ecuaciones e inecuaciones', 'alta', null, 12),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-13', 'Funciones', 'alta', null, 13),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-14', 'Polinomios y numeros complejos', 'alta', null, 14),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-15', 'Funciones exponenciales y logaritmicas', 'alta', null, 15),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-16', 'Matrices, determinantes y sistemas', 'alta', null, 16),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-17', 'Programacion lineal', 'media', null, 17),
  ('Matematica Parte I: Aritmetica y Algebra', 'UNI-M1-18', 'Sucesiones y series numericas', 'media', null, 18),

  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-01', 'Nociones basicas y angulos', 'alta', null, 1),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-02', 'Triangulos y congruencia', 'alta', null, 2),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-03', 'Poligonos y cuadrilateros', 'media', null, 3),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-04', 'Circunferencia', 'alta', null, 4),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-05', 'Proporcionalidad y semejanza', 'alta', null, 5),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-06', 'Relaciones metricas', 'alta', null, 6),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-07', 'Poligonos regulares, longitud y areas', 'alta', null, 7),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-08', 'Geometria del espacio', 'alta', null, 8),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-09', 'Solidos geometricos', 'alta', null, 9),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-10', 'Angulo trigonometrico y arco', 'alta', null, 10),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-11', 'Razones trigonometricas', 'alta', null, 11),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-12', 'Identidades trigonometricas', 'alta', null, 12),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-13', 'Funciones trigonometricas', 'alta', null, 13),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-14', 'Ecuaciones e inecuaciones trigonometricas', 'alta', null, 14),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-15', 'Resolucion de triangulos', 'alta', null, 15),
  ('Matematica Parte II: Geometria y Trigonometria', 'UNI-M2-16', 'Conicas y coordenadas', 'media', null, 16),

  ('Fisica', 'UNI-FIS-01', 'Cantidades fisicas y vectores', 'alta', null, 1),
  ('Fisica', 'UNI-FIS-02', 'Cinematica en una dimension', 'alta', 'MRU, MRUV, caida libre y graficos.', 2),
  ('Fisica', 'UNI-FIS-03', 'Cinematica en dos dimensiones', 'alta', 'Proyectiles, movimiento circular y velocidad relativa.', 3),
  ('Fisica', 'UNI-FIS-04', 'Leyes de Newton y equilibrio', 'alta', 'Fuerzas, DCL, torque, friccion y movimiento circular.', 4),
  ('Fisica', 'UNI-FIS-05', 'Gravitacion universal', 'media', null, 5),
  ('Fisica', 'UNI-FIS-06', 'Trabajo y energia', 'alta', null, 6),
  ('Fisica', 'UNI-FIS-07', 'Impulso y cantidad de movimiento', 'alta', null, 7),
  ('Fisica', 'UNI-FIS-08', 'Oscilaciones y ondas mecanicas', 'media', null, 8),
  ('Fisica', 'UNI-FIS-09', 'Fluidos', 'media', null, 9),
  ('Fisica', 'UNI-FIS-10', 'Temperatura, calor y termodinamica', 'alta', null, 10),
  ('Fisica', 'UNI-FIS-11', 'Electrostatica', 'alta', null, 11),
  ('Fisica', 'UNI-FIS-12', 'Corriente electrica', 'alta', null, 12),
  ('Fisica', 'UNI-FIS-13', 'Electromagnetismo', 'alta', null, 13),
  ('Fisica', 'UNI-FIS-14', 'Ondas electromagneticas y optica', 'media', null, 14),
  ('Fisica', 'UNI-FIS-15', 'Fisica moderna', 'media', null, 15),

  ('Quimica', 'UNI-QUI-01', 'Quimica y materia', 'alta', null, 1),
  ('Quimica', 'UNI-QUI-02', 'Estructura atomica', 'alta', null, 2),
  ('Quimica', 'UNI-QUI-03', 'Tabla periodica moderna', 'alta', null, 3),
  ('Quimica', 'UNI-QUI-04', 'Enlace quimico', 'alta', null, 4),
  ('Quimica', 'UNI-QUI-05', 'Nomenclatura inorganica', 'alta', null, 5),
  ('Quimica', 'UNI-QUI-06', 'Estequiometria', 'alta', null, 6),
  ('Quimica', 'UNI-QUI-07', 'Estados de agregacion', 'media', null, 7),
  ('Quimica', 'UNI-QUI-08', 'Soluciones y coloides', 'alta', null, 8),
  ('Quimica', 'UNI-QUI-09', 'Equilibrio quimico', 'alta', null, 9),
  ('Quimica', 'UNI-QUI-10', 'Acidos y bases', 'alta', null, 10),
  ('Quimica', 'UNI-QUI-11', 'Electroquimica', 'media', null, 11),
  ('Quimica', 'UNI-QUI-12', 'Quimica organica', 'alta', null, 12),
  ('Quimica', 'UNI-QUI-13', 'Ecologia y contaminacion ambiental', 'media', null, 13),

  ('Aptitud Vocacional Arquitectura', 'UNI-ARQ-01', 'Sensibilidad e interes por el arte', 'media', null, 1),
  ('Aptitud Vocacional Arquitectura', 'UNI-ARQ-02', 'Nivel cultural e interes profesional', 'media', null, 2),
  ('Aptitud Vocacional Arquitectura', 'UNI-ARQ-03', 'Imaginacion e ingenio para construir', 'media', null, 3),
  ('Aptitud Vocacional Arquitectura', 'UNI-ARQ-04', 'Sentido y percepcion bidimensional y tridimensional', 'media', null, 4);

insert into public.exam_template_topics (template_course_id, code, name, importance, notes, sort_order)
select c.id, topic.code, topic.name, topic.importance, topic.notes, topic.sort_order
from _uni_topics topic
join public.exam_template_courses c on c.name = topic.course_name
join public.exam_templates t on t.id = c.template_id
where t.code = 'uni-2026-general';
