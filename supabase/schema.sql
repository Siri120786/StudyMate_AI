-- Run the whole file in the Supabase SQL editor. It is idempotent, so re-running
-- it after an update is safe. The backend writes with the service-role key
-- (bypasses RLS); the browser only ever reads its own rows.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table documents add column if not exists subject text not null default 'General';
alter table documents add column if not exists blurb text not null default '';

create table if not exists summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  content text not null,
  created_at timestamptz not null default now(),
  unique (document_id, level)
);

-- Topic-wise study: an outline per document, and summaries/quizzes that can be scoped to one topic.
alter table documents add column if not exists topics jsonb not null default '[]';
alter table summaries add column if not exists topic text not null default '';
alter table summaries drop constraint if exists summaries_document_id_level_key;
-- Summaries and podcasts are kept per language so switching languages never overwrites the other one.
alter table summaries add column if not exists lang text not null default 'en';
drop index if exists summaries_doc_level_topic;
create unique index if not exists summaries_doc_level_topic_lang on summaries (document_id, level, topic, lang);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null,
  score int not null,
  total int not null,
  xp int not null,
  created_at timestamptz not null default now()
);
alter table attempts add column if not exists seconds int not null default 0;

alter table quizzes add column if not exists scope text not null default 'lesson';
alter table quizzes add column if not exists topic text not null default '';

create table if not exists topic_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  correct int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);
alter table topic_mastery add column if not exists document_id uuid references documents(id) on delete set null;

-- Two-host audio overviews. The audio itself lives in the private "podcasts" storage bucket.
create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null default '',
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  status text not null default 'generating',
  title text not null default '',
  script jsonb not null default '[]',
  seconds int not null default 0,
  error text not null default '',
  created_at timestamptz not null default now(),
  unique (document_id, topic, level)
);

alter table podcasts add column if not exists lang text not null default 'en';
alter table podcasts drop constraint if exists podcasts_document_id_topic_level_key;
create unique index if not exists podcasts_doc_topic_level_lang on podcasts (document_id, topic, level, lang);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  daily_goal_xp int not null default 100,
  subjects text[] not null default '{}',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null default '',
  front text not null,
  back text not null,
  interval_days int not null default 0,
  reviews int not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  kind text not null check (kind in ('summary', 'flashcard', 'quiz')),
  xp int not null default 0,
  minutes numeric(7, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table documents enable row level security;
alter table summaries enable row level security;
alter table quizzes enable row level security;
alter table attempts enable row level security;
alter table topic_mastery enable row level security;
alter table profiles enable row level security;
alter table flashcards enable row level security;
alter table activity enable row level security;
alter table podcasts enable row level security;

drop policy if exists "own documents" on documents;
drop policy if exists "own summaries" on summaries;
drop policy if exists "own quizzes" on quizzes;
drop policy if exists "own attempts" on attempts;
drop policy if exists "own mastery" on topic_mastery;
drop policy if exists "own profile" on profiles;
drop policy if exists "own flashcards" on flashcards;
drop policy if exists "own activity" on activity;
drop policy if exists "own podcasts" on podcasts;

create policy "own documents" on documents for select using (auth.uid() = user_id);
create policy "own summaries" on summaries for select using (auth.uid() = user_id);
create policy "own quizzes" on quizzes for select using (auth.uid() = user_id);
create policy "own attempts" on attempts for select using (auth.uid() = user_id);
create policy "own mastery" on topic_mastery for select using (auth.uid() = user_id);
create policy "own profile" on profiles for select using (auth.uid() = user_id);
create policy "own flashcards" on flashcards for select using (auth.uid() = user_id);
create policy "own activity" on activity for select using (auth.uid() = user_id);
create policy "own podcasts" on podcasts for select using (auth.uid() = user_id);

create index if not exists documents_user_idx on documents (user_id, created_at desc);
create index if not exists attempts_user_idx on attempts (user_id, created_at desc);
create index if not exists activity_user_idx on activity (user_id, created_at desc);
create index if not exists flashcards_doc_idx on flashcards (document_id, due_at);


-- ===== Study planner, mock exams, SM-2 flashcards, focus timer, badges and challenges =====

alter table flashcards add column if not exists ease real not null default 2.5;
alter table flashcards add column if not exists streak int not null default 0;
alter table flashcards add column if not exists lapses int not null default 0;

-- focus sessions and challenge bonuses are logged as activity too
alter table activity drop constraint if exists activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in ('summary', 'flashcard', 'quiz', 'focus', 'bonus'));

-- mixed quizzes span several documents; mock exams are timed
alter table quizzes add column if not exists document_ids uuid[] not null default '{}';
alter table quizzes add column if not exists time_limit_sec int not null default 0;
alter table quizzes add column if not exists mode text not null default 'practice';

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exam_date date not null,
  document_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  seen boolean not null default false,
  primary key (user_id, badge)
);

create table if not exists challenge_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  key text not null,
  primary key (user_id, day, key)
);

alter table exams enable row level security;
alter table badges enable row level security;
alter table challenge_claims enable row level security;

drop policy if exists "own exams" on exams;
drop policy if exists "own badges" on badges;
drop policy if exists "own claims" on challenge_claims;
create policy "own exams" on exams for select using (auth.uid() = user_id);
create policy "own badges" on badges for select using (auth.uid() = user_id);
create policy "own claims" on challenge_claims for select using (auth.uid() = user_id);

create index if not exists exams_user_idx on exams (user_id, exam_date);


-- ===== Explain it back, mind maps, cheat sheets, highlights, sharing and study groups =====

alter table activity drop constraint if exists activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in ('summary', 'flashcard', 'quiz', 'focus', 'bonus', 'explain'));

-- generated extras, kept per language like summaries
create table if not exists extras (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mindmap', 'cheatsheet')),
  lang text not null default 'en',
  content text not null,
  created_at timestamptz not null default now(),
  unique (document_id, kind, lang)
);

create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  topic text not null default '',
  level text not null default '',
  text text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- a share link exposes one document to anyone who has the token, until it is revoked
create table if not exists shares (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table extras enable row level security;
alter table annotations enable row level security;
alter table shares enable row level security;
alter table study_groups enable row level security;
alter table group_members enable row level security;

drop policy if exists "own extras" on extras;
drop policy if exists "own annotations" on annotations;
drop policy if exists "own shares" on shares;
drop policy if exists "own memberships" on group_members;
drop policy if exists "member groups" on study_groups;
create policy "own extras" on extras for select using (auth.uid() = user_id);
create policy "own annotations" on annotations for select using (auth.uid() = user_id);
create policy "own shares" on shares for select using (auth.uid() = user_id);
create policy "own memberships" on group_members for select using (auth.uid() = user_id);
create policy "member groups" on study_groups for select using (
  exists (select 1 from group_members m where m.group_id = study_groups.id and m.user_id = auth.uid())
);

create index if not exists annotations_doc_idx on annotations (document_id, created_at);
create index if not exists group_members_user_idx on group_members (user_id);
