-- TaskMatch matcher auto-tune: per-workspace fit weights (Level 3).
-- Run once in the Supabase SQL Editor, AFTER rls.sql, roles.sql and workspaces.sql (safe to re-run).
--
-- The matcher scores a person against a task from four parts (skills / experience / availability /
-- record), each with a weight that adds to 100. Those weights are the same for everyone by default.
-- This table lets ONE workspace save its own tuned weights — proposed from how well each part
-- predicted real outcomes, and applied only when a leader chooses to. No row = the default weights.
--
-- The API writes this row with the service-role key; RLS below guards direct reads.
-- One row per workspace is expected; the API reads the first and upserts it.

create table if not exists public.matcher_weights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade
    default public.tm_current_ws(),
  weights jsonb not null,                      -- {"skills":45,"experience":20,"availability":20,"record":15}
  updated_at timestamptz not null default now()
);
-- At most one weights row per workspace.
create unique index if not exists matcher_weights_one_per_ws
  on public.matcher_weights (workspace_id);

alter table public.matcher_weights enable row level security;

-- Anyone who can see insights in the workspace may read the active weights.
drop policy if exists matcher_weights_read on public.matcher_weights;
create policy matcher_weights_read on public.matcher_weights for select to authenticated
  using (workspace_id = public.tm_current_ws() and public.tm_can('insights.view'));

-- Writes (apply weights) go through the API's service-role key, which bypasses RLS.
-- No INSERT/UPDATE/DELETE policy is granted to authenticated clients on purpose.

-- Verify:
--   select relname, relrowsecurity from pg_class where relname = 'matcher_weights';
--   select tablename, policyname, cmd from pg_policies where tablename = 'matcher_weights';
