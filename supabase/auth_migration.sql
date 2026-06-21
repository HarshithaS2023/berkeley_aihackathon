-- Run this in Supabase SQL Editor if tables were created before per-user auth.
-- This removes open/public policies, deletes legacy unowned sessions, and locks data to auth.uid().

alter table sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Drop every existing policy on these tables (including old open "allow read/insert" rules).
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sessions', 'questions', 'mistakes')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table sessions enable row level security;
alter table questions enable row level security;
alter table mistakes enable row level security;

-- Remove pre-auth rows that are not tied to any user (cascades to questions/mistakes).
delete from sessions where user_id is null;

create index if not exists sessions_user_id_idx on sessions(user_id);

alter table sessions alter column user_id set not null;

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
