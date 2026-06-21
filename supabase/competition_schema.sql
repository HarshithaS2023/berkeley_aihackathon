-- Run this in your Supabase SQL editor to enable the competition feature.

create table if not exists competition_sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,           -- 6-char join code shared with opponent
  source_profile jsonb not null,              -- topics, concepts, styleNotes
  settings    jsonb not null,                 -- numQuestions, startingDifficulty, problemType, similarity
  status      text not null default 'waiting' check (status in ('waiting','active','complete')),
  created_at  timestamptz not null default now(),
  started_at  timestamptz
);

create table if not exists competition_participants (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references competition_sessions(id) on delete cascade,
  user_name   text not null,
  joined_at   timestamptz not null default now(),
  -- live progress (updated after each question)
  question_number  int not null default 0,
  current_difficulty int not null default 3,
  correct_count   int not null default 0,
  score        float not null default 0,
  completed    boolean not null default false,
  ready        boolean not null default false,
  finished_at  timestamptz,
  results      jsonb                          -- full SessionResult[] on completion
);

-- Enable Supabase real-time on both tables
alter publication supabase_realtime add table competition_sessions;
alter publication supabase_realtime add table competition_participants;

-- Anyone can read sessions/participants (join by code); only insert/update own row
alter table competition_sessions enable row level security;
alter table competition_participants enable row level security;

create policy "read sessions" on competition_sessions for select using (true);
create policy "insert sessions" on competition_sessions for insert with check (true);
create policy "update sessions" on competition_sessions for update using (true);

create policy "read participants" on competition_participants for select using (true);
create policy "insert participants" on competition_participants for insert with check (true);
create policy "update participants" on competition_participants for update using (true);
