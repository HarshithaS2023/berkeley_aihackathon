-- Optional: let any signed-in user read all quiz sessions for shared team analytics.
-- Run once in Supabase → SQL Editor. Existing per-user policies stay; these add OR access.

create policy "team read all sessions"
  on sessions for select
  to authenticated
  using (true);

create policy "team read all questions"
  on questions for select
  to authenticated
  using (true);

create policy "team read all mistakes"
  on mistakes for select
  to authenticated
  using (true);
