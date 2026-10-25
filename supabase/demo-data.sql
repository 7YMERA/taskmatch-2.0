-- TaskMatch demo data: makes a fresh install look like a team that's been using it for a while.
--
-- Run once in the Supabase SQL Editor, after workspaces.sql. It works with the people, skills and
-- tasks you already have, and adds:
--   * a name for the workspace ("My team" becomes "Acme Studio")
--   * four projects plus an archived one, with your existing tasks filed into them
--   * open tasks given to the best-matching people (some started), a few left for "needs people"
--   * fresh start and due dates on open tasks, so the dashboard isn't all overdue
--   * one person on leave, a few task comments, two invite links, audit trail entries
--   * a second workspace, "Weekend hackathon", so the workspace switcher has something to switch to
--
-- Safe to run twice: it stops if the demo projects are already there. Nothing is deleted.

-- 0. Same step as section 5 of workspaces.sql, for databases that ran an earlier copy of it.
-- An older database may have a skill name, email or matric number unique across the whole table.
-- With workspaces, two teams can both have "Python" (and one person can be on two rosters), so
-- those become unique within a workspace instead.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'u' and array_length(c.conkey, 1) = 1
      and ((c.conrelid = 'public.skills'::regclass and a.attname = 'skill_name')
        or (c.conrelid = 'public.students'::regclass and a.attname in ('email', 'matric')))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I unique (workspace_id, %I)', r.tbl, r.conname, r.attname);
  end loop;

  for r in
    select i.indexrelid::regclass as idx, ci.relname as idxname, i.indrelid::regclass as tbl, a.attname
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indisunique and not i.indisprimary and i.indnatts = 1
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and ((i.indrelid = 'public.skills'::regclass and a.attname = 'skill_name')
        or (i.indrelid = 'public.students'::regclass and a.attname in ('email', 'matric')))
  loop
    execute format('drop index %s', r.idx);
    execute format('create unique index %I on %s (workspace_id, %I)', r.idxname, r.tbl, r.attname);
  end loop;
end $$;

do $$
declare
  ws uuid;
  hack uuid;
  admin_id uuid;
  admin_email text;
  p_plat uuid; p_mob uuid; p_web uuid; p_data uuid;
  rec record;
  pick uuid;
  n int := 0;
  open_total int;
begin
  if exists (select 1 from public.projects where key in ('PLAT', 'HACK'))
     or exists (select 1 from public.workspaces where name = 'Weekend hackathon') then
    raise notice 'Demo data is already there. Nothing changed.';
    return;
  end if;

  -- The workspace to dress up: "My team" from workspaces.sql, else the one with the most tasks.
  select w.id into ws from public.workspaces w
  order by (w.name = 'My team') desc, (select count(*) from public.tasks t where t.workspace_id = w.id) desc, w.created_at
  limit 1;
  if ws is null then raise exception 'Run workspaces.sql first.'; end if;

  select user_id, email into admin_id, admin_email from public.workspace_members
  where workspace_id = ws and role = 'admin' order by joined_at limit 1;

  -- 1. A proper name.
  update public.workspaces set name = 'Acme Studio' where id = ws and name = 'My team';

  -- 2. Projects.
  insert into public.projects (workspace_id, name, key, description, color, created_at) values
    (ws, 'Platform rebuild', 'PLAT', 'Move the matcher and API onto the new stack, with tests and CI.', 'indigo', now() - interval '60 days')
    returning id into p_plat;
  insert into public.projects (workspace_id, name, key, description, color, created_at) values
    (ws, 'Mobile app', 'MOB', 'A phone-first version of My Tasks for people on the move.', 'emerald', now() - interval '45 days')
    returning id into p_mob;
  insert into public.projects (workspace_id, name, key, description, color, created_at) values
    (ws, 'Website relaunch', 'WEB', 'New landing page, docs and onboarding.', 'sky', now() - interval '30 days')
    returning id into p_web;
  insert into public.projects (workspace_id, name, key, description, color, created_at) values
    (ws, 'Data & insights', 'DATA', 'Reports, exports and smarter matching from past work.', 'amber', now() - interval '20 days')
    returning id into p_data;
  insert into public.projects (workspace_id, name, key, description, color, archived, created_at) values
    (ws, 'Pilot with first client', 'PILOT', 'Wrapped up last quarter.', 'rose', true, now() - interval '120 days');

  -- 3. File existing tasks by what they're about; anything else is spread across the four.
  update public.tasks set project_id = case
      when description ~* '\m(mobile|phone|notifications?|push|offline)\M' then p_mob
      when description ~* '\m(api|auth\w*|database|sql|schema|migrat\w*|deploy\w*|server|security|ci|tests?|testing|refactor\w*|backend|rate|payment\w*)\M' then p_plat
      when description ~* '\m(pages?|landing|design\w*|ui|ux|theme|dark|onboarding|docs|copy|accessib\w*|layout|settings)\M' then p_web
      when description ~* '\m(reports?|analytics?|charts?|export\w*|csv|ml|insights?|metrics?|dashboards?|data|queries)\M' then p_data
      else (array[p_plat, p_mob, p_web, p_data])[1 + (abs(hashtext(id::text)) % 4)]
    end
  where workspace_id = ws and project_id is null;

  -- 4. Fresh dates on open work: mostly due in the next three weeks, two slightly overdue.
  with o as (
    select id, row_number() over (order by coalesce(due_date, current_date), id) as rn
    from public.tasks where workspace_id = ws and status <> 'Completed'
  )
  update public.tasks t set
    start_date = current_date - ((o.rn % 9) + 1)::int,
    due_date = current_date + case when o.rn <= 2 then -o.rn::int else ((o.rn * 3) % 21 + 2)::int end
  from o where t.id = o.id;

  -- 5. Give open, unstaffed tasks to the best match: most required skills met, then the lightest
  --    load (under three active tasks). The last three stay open for "needs people".
  select count(*) into open_total from public.tasks tk
  where tk.workspace_id = ws and tk.status <> 'Completed'
    and not exists (select 1 from public.assignments a where a.task_id = tk.id);

  for rec in
    select tk.id, tk.description from public.tasks tk
    where tk.workspace_id = ws and tk.status <> 'Completed'
      and not exists (select 1 from public.assignments a where a.task_id = tk.id)
    order by tk.due_date nulls last, tk.id
    limit greatest(open_total - 3, 0)
  loop
    select s.id into pick
    from public.students s
    where s.workspace_id = ws and (s.away_until is null or s.away_until < current_date)
      and (select count(*) from public.assignments a
           where a.student_id = s.id and a.status in ('Assigned', 'In Progress')) < 3
    order by
      (select count(*) from public.task_skills ts
       join public.student_skills ss on ss.skill_id = ts.skill_id and ss.student_id = s.id
       where ts.task_id = rec.id and ss.proficiency >= ts.min_proficiency) desc,
      (select count(*) from public.assignments a
       where a.student_id = s.id and a.status in ('Assigned', 'In Progress')),
      random()
    limit 1;
    exit when pick is null;

    n := n + 1;
    if n % 2 = 0 then   -- every other one is already under way
      insert into public.assignments (workspace_id, task_id, student_id, status, assigned_date, in_progress_at)
      values (ws, rec.id, pick, 'In Progress', current_date - 3, now() - interval '2 days');
      update public.tasks set status = 'In Progress' where id = rec.id and status = 'New';
    else
      insert into public.assignments (workspace_id, task_id, student_id, status, assigned_date)
      values (ws, rec.id, pick, 'Assigned', current_date - 1);
    end if;

    insert into public.activity_logs (workspace_id, action, entity_type, entity_id, summary, details, actor_email, actor_role, created_at)
    select ws, 'assignment.assigned', 'assignment', rec.id,
           s.name || ' assigned to task ''' || rec.description || ''' (best match)',
           jsonb_build_object('task_id', rec.id, 'student_id', s.id, 'mode', 'best_match'),
           admin_email, 'admin', now() - make_interval(hours => n)
    from public.students s where s.id = pick;
  end loop;

  -- 6. One person on leave (someone with nothing in progress, if possible).
  update public.students set away_until = current_date + 6
  where id = (select s.id from public.students s where s.workspace_id = ws
              order by (select count(*) from public.assignments a where a.student_id = s.id
                        and a.status in ('Assigned', 'In Progress')), s.name limit 1)
    and not exists (select 1 from public.students x where x.workspace_id = ws and x.away_until >= current_date);

  -- 7. A few comments on work in progress.
  insert into public.task_comments (workspace_id, task_id, author_email, body, created_at)
  select ws, a.task_id, s.email, c.body, now() - make_interval(hours => c.h)
  from (select distinct on (a.task_id) a.task_id, a.student_id
        from public.assignments a where a.workspace_id = ws and a.status = 'In Progress'
        order by a.task_id limit 3) a
  join public.students s on s.id = a.student_id
  cross join lateral (values
    ('Started on this. First pass should be up for review tomorrow.', 30),
    ('Found an edge case with empty inputs, adding a test for it.', 6)) as c(body, h);

  -- 8. Two invite links (copy them from Members & roles).
  insert into public.workspace_invites (code, workspace_id, role, created_by, expires_at, max_uses, uses) values
    (substr(md5(random()::text), 1, 12), ws, 'member', admin_id, now() + interval '6 days', 25, 3),
    (substr(md5(random()::text), 1, 12), ws, 'lead', admin_id, now() + interval '20 hours', 25, 1);

  -- 9. Audit trail entries for the setup above.
  insert into public.activity_logs (workspace_id, action, entity_type, entity_id, summary, actor_email, actor_role, created_at) values
    (ws, 'workspace.renamed', 'workspace', ws, 'Renamed the workspace to Acme Studio', admin_email, 'admin', now() - interval '3 days'),
    (ws, 'project.created', 'project', p_plat, 'Created project ''Platform rebuild'' (PLAT)', admin_email, 'admin', now() - interval '3 days' + interval '5 minutes'),
    (ws, 'project.created', 'project', p_mob, 'Created project ''Mobile app'' (MOB)', admin_email, 'admin', now() - interval '3 days' + interval '6 minutes'),
    (ws, 'project.created', 'project', p_web, 'Created project ''Website relaunch'' (WEB)', admin_email, 'admin', now() - interval '3 days' + interval '7 minutes'),
    (ws, 'project.created', 'project', p_data, 'Created project ''Data & insights'' (DATA)', admin_email, 'admin', now() - interval '3 days' + interval '8 minutes'),
    (ws, 'project.archived', 'project', null, 'Archived project ''Pilot with first client''', admin_email, 'admin', now() - interval '2 days'),
    (ws, 'workspace.invite_created', 'workspace', ws, 'Created an invite link for members (7 days)', admin_email, 'admin', now() - interval '1 day'),
    (ws, 'workspace.invite_created', 'workspace', ws, 'Created an invite link for team leads (1 day)', admin_email, 'admin', now() - interval '4 hours');

  -- 10. A second workspace, so the switcher has somewhere to go. You're a team lead there.
  insert into public.workspaces (name, created_by, created_at)
  values ('Weekend hackathon', admin_id, now() - interval '10 days') returning id into hack;
  insert into public.workspace_members (workspace_id, user_id, email, role)
  select hack, user_id, email, 'lead' from public.workspace_members where workspace_id = ws and role = 'admin';

  insert into public.skills (workspace_id, skill_name)
  select hack, x from unnest(array['React', 'Python', 'UI/UX', 'API Development', 'Pitching']) x;

  insert into public.students (workspace_id, name, email, matric, programme, year) values
    (hack, 'Jordan Lee', 'jordan@example.com', '90000001', 'Computer Science', 3),
    (hack, 'Priya Menon', 'priya@example.com', '90000002', 'Information Technology', 2),
    (hack, 'Sam Okafor', 'sam@example.com', '90000003', 'Information Systems', 4);

  insert into public.projects (workspace_id, name, key, description, color)
  values (hack, 'Hackathon MVP', 'HACK', 'Ship a working demo by Sunday evening.', 'rose') returning id into pick;

  insert into public.tasks (workspace_id, project_id, description, status, severity, committed_hours, start_date, due_date)
  values
    (hack, pick, 'Pitch deck and demo script', 'New', 'Medium', 4, current_date, current_date + 2),
    (hack, pick, 'Prototype the matching screen', 'In Progress', 'Critical', 8, current_date - 1, current_date + 1),
    (hack, pick, 'Set up the API and database', 'New', 'Critical', 6, current_date, current_date + 1);

  raise notice 'Demo data added to % and to the Weekend hackathon workspace.', (select name from public.workspaces where id = ws);
end $$;

-- What was added, per project.
select w.name as workspace, p.key, p.name as project, p.archived, count(t.id) as tasks
from public.projects p
join public.workspaces w on w.id = p.workspace_id
left join public.tasks t on t.project_id = p.id
group by 1, 2, 3, 4
order by 1, 4, 2;
