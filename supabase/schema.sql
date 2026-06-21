-- Fresh install schema (includes auth-scoped row-level security)

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  accuracy      float not null,
  avg_time      int not null,
  num_questions int not null,
  topics        text[] not null default '{}'
);

create table questions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question    text not null,
  answer      text not null,
  concepts    text[] not null default '{}',
  difficulty  int not null check (difficulty between 1 and 5),
  correct     boolean not null,
  time_spent  int not null,
  hints_used  int not null default 0
);

create table mistakes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  concept       text not null,
  error_pattern text not null default ''
);

create index sessions_user_id_idx on sessions(user_id);
create index questions_session_id_idx on questions(session_id);
create index mistakes_session_id_idx on mistakes(session_id);
create index sessions_created_at_idx on sessions(created_at desc);

alter table sessions enable row level security;
alter table questions enable row level security;
alter table mistakes enable row level security;

create policy "users insert own sessions"
  on sessions for insert
  with check (auth.uid() = user_id);

create policy "users select own sessions"
  on sessions for select
  using (auth.uid() = user_id);

create policy "users insert own questions"
  on questions for insert
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "users select own questions"
  on questions for select
  using (
    exists (
      select 1 from sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "users insert own mistakes"
  on mistakes for insert
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "users select own mistakes"
  on mistakes for select
  using (
    exists (
      select 1 from sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
