-- TaskMatch integrations: imported-task provenance (Level 3).
-- Run once in the Supabase SQL Editor, AFTER the earlier scripts (safe to re-run).
--
-- Adds two columns to tasks so a task imported from an external system (e.g. GitHub Issues)
-- remembers where it came from, and a re-import skips issues already brought in.
--   external_source  — 'github' (room for 'jira', etc. later)
--   external_ref     — the issue's URL (unique per workspace, so no duplicates)
-- Both are nullable: tasks created the normal way leave them empty, and the API works with or
-- without these columns (it falls back gracefully), so running this is an enhancement, not a gate.

alter table public.tasks add column if not exists external_source text;
alter table public.tasks add column if not exists external_ref text;

-- One task per external issue, per workspace. (Partial: only rows that actually have a ref.)
create unique index if not exists tasks_external_ref_per_ws
  on public.tasks (workspace_id, external_ref)
  where external_ref is not null;

-- Verify:
--   select column_name from information_schema.columns
--   where table_name = 'tasks' and column_name in ('external_source', 'external_ref');
