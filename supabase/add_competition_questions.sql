-- Migration: add pre-generated questions to competition sessions
-- Run this in your Supabase SQL editor if you already ran competition_schema.sql

alter table competition_sessions
  add column if not exists questions jsonb not null default '[]'::jsonb;
