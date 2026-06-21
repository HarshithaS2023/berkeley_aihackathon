-- Run in Supabase SQL editor if competition tables already exist without `ready`.
alter table competition_participants
  add column if not exists ready boolean not null default false;
