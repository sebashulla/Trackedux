create extension if not exists pgcrypto;

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  course_name text,
  topic_name text,
  is_public boolean not null default false,
  tags text[] not null default '{}',
  source_deck_id uuid references public.flashcard_decks(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  front text not null,
  back text not null,
  note text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.flashcard_study_sessions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_cards integer not null default 0,
  difficult_count integer not null default 0,
  normal_count integer not null default 0,
  easy_count integer not null default 0,
  mastery_percentage numeric not null default 0,
  studied_at timestamp with time zone not null default now()
);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.flashcards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  rating text check (rating in ('dificil', 'normal', 'facil')),
  reviewed_at timestamp with time zone not null default now()
);

create index if not exists flashcard_decks_user_id_idx on public.flashcard_decks(user_id);
create index if not exists flashcard_decks_public_idx on public.flashcard_decks(is_public) where is_public = true;
create index if not exists flashcards_deck_id_idx on public.flashcards(deck_id);
create index if not exists flashcard_sessions_user_deck_idx on public.flashcard_study_sessions(user_id, deck_id, studied_at desc);
create index if not exists flashcard_reviews_user_card_idx on public.flashcard_reviews(user_id, card_id, reviewed_at desc);

create or replace function public.set_flashcards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_flashcard_decks_updated_at on public.flashcard_decks;
create trigger set_flashcard_decks_updated_at
before update on public.flashcard_decks
for each row execute function public.set_flashcards_updated_at();

drop trigger if exists set_flashcards_updated_at on public.flashcards;
create trigger set_flashcards_updated_at
before update on public.flashcards
for each row execute function public.set_flashcards_updated_at();

alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_study_sessions enable row level security;
alter table public.flashcard_reviews enable row level security;

drop policy if exists "Users can read own and public decks" on public.flashcard_decks;
create policy "Users can read own and public decks"
on public.flashcard_decks
for select
using (user_id = auth.uid() or is_public = true);

drop policy if exists "Users can create own decks" on public.flashcard_decks;
create policy "Users can create own decks"
on public.flashcard_decks
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update own decks" on public.flashcard_decks;
create policy "Users can update own decks"
on public.flashcard_decks
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own decks" on public.flashcard_decks;
create policy "Users can delete own decks"
on public.flashcard_decks
for delete
using (user_id = auth.uid());

drop policy if exists "Users can read cards from own and public decks" on public.flashcards;
create policy "Users can read cards from own and public decks"
on public.flashcards
for select
using (
  exists (
    select 1
    from public.flashcard_decks decks
    where decks.id = flashcards.deck_id
      and (decks.user_id = auth.uid() or decks.is_public = true)
  )
);

drop policy if exists "Users can create cards in own decks" on public.flashcards;
create policy "Users can create cards in own decks"
on public.flashcards
for insert
with check (
  exists (
    select 1
    from public.flashcard_decks decks
    where decks.id = flashcards.deck_id
      and decks.user_id = auth.uid()
  )
);

drop policy if exists "Users can update cards in own decks" on public.flashcards;
create policy "Users can update cards in own decks"
on public.flashcards
for update
using (
  exists (
    select 1
    from public.flashcard_decks decks
    where decks.id = flashcards.deck_id
      and decks.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.flashcard_decks decks
    where decks.id = flashcards.deck_id
      and decks.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete cards in own decks" on public.flashcards;
create policy "Users can delete cards in own decks"
on public.flashcards
for delete
using (
  exists (
    select 1
    from public.flashcard_decks decks
    where decks.id = flashcards.deck_id
      and decks.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own study sessions" on public.flashcard_study_sessions;
create policy "Users can read own study sessions"
on public.flashcard_study_sessions
for select
using (user_id = auth.uid());

drop policy if exists "Users can create own study sessions" on public.flashcard_study_sessions;
create policy "Users can create own study sessions"
on public.flashcard_study_sessions
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can read own reviews" on public.flashcard_reviews;
create policy "Users can read own reviews"
on public.flashcard_reviews
for select
using (user_id = auth.uid());

drop policy if exists "Users can create own reviews" on public.flashcard_reviews;
create policy "Users can create own reviews"
on public.flashcard_reviews
for insert
with check (user_id = auth.uid());
