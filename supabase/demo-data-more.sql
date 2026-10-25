-- TaskMatch demo data, part 2: a fuller task list.
--
-- Run once in the Supabase SQL Editor, AFTER demo-data.sql. Adds to the Acme Studio and Weekend
-- hackathon workspaces it created:
--   * about 50 tasks across the projects, each with the skills it needs
--   * finished work spread over the last two months (a few finished late), so the dashboard
--     trends, on-time rate and scores have history to draw
--   * work in progress, tasks assigned but not started, and some still waiting for people
--   * comments and audit trail entries to go with it
--   * four more people in Acme Studio if it has fewer than eight, so the work can be spread out
--
-- People are picked the same way the app's best match does: most required skills, then the
-- lightest load. Safe to run twice: it stops if these tasks are already there. Nothing is deleted.

do $$
declare
  ws uuid;
  hack uuid;
  admin_email text;
  rec record;
  t_id uuid;
  pick uuid;
  proj uuid;
  done_day date;
  hrs numeric;
  n int := 0;
begin
  select workspace_id into ws from public.projects where key = 'PLAT' order by created_at limit 1;
  if ws is null then raise exception 'Run demo-data.sql first.'; end if;
  select id into hack from public.workspaces where name = 'Weekend hackathon' order by created_at limit 1;

  if exists (select 1 from public.tasks where workspace_id = ws and description = 'Offline mode for My Tasks') then
    raise notice 'The extra demo tasks are already there. Nothing changed.';
    return;
  end if;

  select email into admin_email from public.workspace_members
  where workspace_id = ws and role = 'admin' order by joined_at limit 1;

  -- What to add. state: done, late (finished after its due date), doing, assigned, open.
  -- age: for finished work, days ago it finished; for open work, days until it's due.
  -- hints: words to look for in the workspace's skill names.
  -- Skill levels are 1 (beginner) to 3 (advanced).
  create temp table demo_more (
    ord int, wsp text, pkey text, descr text, sev text, hrs numeric, state text, age int, hints text[]
  ) on commit drop;

  insert into demo_more values
    -- Platform rebuild
    ( 1, 'acme', 'PLAT', 'Move session tokens to HTTP-only cookies',           'Critical', 6,  'done',     52, '{security,auth,python,api}'),
    ( 2, 'acme', 'PLAT', 'Add request tracing to the API',                      'Medium',   5,  'done',     41, '{python,api,devops,cloud}'),
    ( 3, 'acme', 'PLAT', 'Nightly database backups with restore test',          'Critical', 4,  'late',     33, '{database,sql,devops,cloud}'),
    ( 4, 'acme', 'PLAT', 'Split the matcher into its own module',                'Medium',   8,  'done',     19, '{python,algorithm,backend}'),
    ( 5, 'acme', 'PLAT', 'Load test the assign endpoint',                        'Medium',   4,  'done',      6, '{testing,python,api}'),
    ( 6, 'acme', 'PLAT', 'Upgrade to the latest Postgres version',               'Low',      3,  'doing',     5, '{database,sql,devops}'),
    ( 7, 'acme', 'PLAT', 'Role checks on every write endpoint',                  'Critical', 6,  'doing',     3, '{security,python,api}'),
    ( 8, 'acme', 'PLAT', 'Retry failed webhook deliveries',                      'Medium',   5,  'assigned',  9, '{python,api,backend}'),
    ( 9, 'acme', 'PLAT', 'Cache skill lookups for faster matching',             'Low',      3,  'assigned', 14, '{python,database,algorithm}'),
    (10, 'acme', 'PLAT', 'Single sign-on with Google Workspace',                 'Medium',   10, 'open',     18, '{auth,security,api}'),
    (11, 'acme', 'PLAT', 'Audit log retention setting',                          'Low',      2,  'open',     25, '{database,sql,backend}'),
    -- Mobile app
    (12, 'acme', 'MOB',  'Offline mode for My Tasks',                            'Medium',   12, 'done',     38, '{mobile,flutter,react,android,ios}'),
    (13, 'acme', 'MOB',  'Push reminder the day before a task is due',          'Medium',   6,  'done',     24, '{mobile,firebase,android,ios}'),
    (14, 'acme', 'MOB',  'Sign in with a magic link on phones',                  'Critical', 5,  'late',     12, '{mobile,auth,security}'),
    (15, 'acme', 'MOB',  'Swipe to start or complete a task',                    'Low',      4,  'doing',     4, '{mobile,ui,flutter,react}'),
    (16, 'acme', 'MOB',  'App store screenshots and listing',                    'Low',      3,  'assigned', 11, '{design,ui,marketing}'),
    (17, 'acme', 'MOB',  'Tablet layout for the board view',                     'Medium',   6,  'open',     20, '{mobile,ui,design,react}'),
    (18, 'acme', 'MOB',  'Crash reporting for the mobile app',                   'Medium',   3,  'open',      7, '{mobile,devops,testing}'),
    -- Website relaunch
    (19, 'acme', 'WEB',  'New pricing page',                                     'Medium',   5,  'done',     47, '{ui,design,react,html,css}'),
    (20, 'acme', 'WEB',  'Customer stories section on the landing page',        'Low',      4,  'done',     29, '{design,writing,ui,html}'),
    (21, 'acme', 'WEB',  'Fix colour contrast on buttons and links',             'Medium',   3,  'done',     15, '{ui,css,design,accessib}'),
    (22, 'acme', 'WEB',  'Getting started guide for new admins',                 'Medium',   6,  'done',      9, '{writing,docs,communication}'),
    (23, 'acme', 'WEB',  'Speed up the landing page (images and fonts)',         'Low',      4,  'late',      3, '{react,html,css,javascript}'),
    (24, 'acme', 'WEB',  'Interactive product tour',                             'Medium',   8,  'doing',     6, '{react,javascript,ui}'),
    (25, 'acme', 'WEB',  'Status page for outages',                              'Low',      3,  'assigned',  8, '{html,devops,writing}'),
    (26, 'acme', 'WEB',  'Translate the site into Malay',                        'Low',      6,  'open',     30, '{writing,communication,language}'),
    (27, 'acme', 'WEB',  'Cookie banner that remembers the choice',              'Medium',   2,  'open',      1, '{javascript,react,security}'),
    -- Data & insights
    (28, 'acme', 'DATA', 'Weekly email summary for team leads',                  'Medium',   6,  'done',     35, '{python,data,writing}'),
    (29, 'acme', 'DATA', 'Workload heatmap by week',                             'Low',      5,  'done',     21, '{data,visual,react,analytics}'),
    (30, 'acme', 'DATA', 'Export the skills matrix to Excel',                    'Low',      3,  'done',     11, '{data,excel,python}'),
    (31, 'acme', 'DATA', 'Predict hours from similar past tasks',                'Critical', 10, 'late',     16, '{machine,python,data,statistic}'),
    (32, 'acme', 'DATA', 'On-time rate by project chart',                        'Medium',   4,  'doing',     2, '{data,visual,analytics,react}'),
    (33, 'acme', 'DATA', 'Clean up duplicate skills in the catalogue',           'Low',      2,  'doing',    10, '{data,sql,database}'),
    (34, 'acme', 'DATA', 'Quarterly utilisation report',                         'Medium',   5,  'assigned', 12, '{data,analytics,excel,writing}'),
    (35, 'acme', 'DATA', 'Flag people who are overloaded',                       'Medium',   4,  'open',     15, '{data,python,analytics}'),
    -- No project yet (shows up as unfiled)
    (36, 'acme', null,   'Plan the team offsite agenda',                         'Low',      2,  'done',     27, '{communication,leadership,management}'),
    (37, 'acme', null,   'Interview two frontend candidates',                    'Medium',   3,  'doing',     4, '{leadership,react,communication}'),
    (38, 'acme', null,   'Update the onboarding checklist',                      'Low',      2,  'open',     13, '{writing,communication,management}'),
    -- Weekend hackathon
    (39, 'hack', 'HACK', 'Pick the team name and logo',                          'Low',      1,  'done',      1, '{UI/UX,Pitching}'),
    (40, 'hack', 'HACK', 'Sketch the three main screens',                        'Medium',   3,  'done',      1, '{UI/UX}'),
    (41, 'hack', 'HACK', 'Seed data for the demo',                               'Medium',   2,  'doing',     1, '{Python,API Development}'),
    (42, 'hack', 'HACK', 'Login screen',                                         'Medium',   3,  'doing',     1, '{React}'),
    (43, 'hack', 'HACK', 'Matching results list',                                'Critical', 5,  'assigned',  1, '{React,API Development}'),
    (44, 'hack', 'HACK', 'Deploy the demo somewhere public',                     'Critical', 2,  'assigned',  2, '{API Development,Python}'),
    (45, 'hack', 'HACK', 'Record a 2-minute backup video',                       'Medium',   2,  'open',      2, '{Pitching,UI/UX}'),
    (46, 'hack', 'HACK', 'Rehearse the pitch twice',                             'Medium',   1,  'open',      2, '{Pitching}');

  -- The hackathon roster needs skills for matching to mean anything.
  if hack is not null and not exists (
    select 1 from public.student_skills ss join public.students s on s.id = ss.student_id where s.workspace_id = hack
  ) then
    insert into public.student_skills (workspace_id, student_id, skill_id, proficiency)
    select hack, s.id, k.id, v.p
    from (values ('jordan@example.com', 'React', 3), ('jordan@example.com', 'API Development', 2),
                 ('priya@example.com', 'UI/UX', 3), ('priya@example.com', 'Pitching', 3), ('priya@example.com', 'React', 1),
                 ('sam@example.com', 'Python', 3), ('sam@example.com', 'API Development', 3), ('sam@example.com', 'Pitching', 2)) v(email, skill, p)
    join public.students s on s.workspace_id = hack and s.email = v.email
    join public.skills k on k.workspace_id = hack and k.skill_name = v.skill;
  end if;

  -- A small roster can't carry this much work, so a short one gets four more people.
  if (select count(*) from public.students where workspace_id = ws) < 8 then
    insert into public.students (workspace_id, name, email, matric, programme, year) values
      (ws, 'Aisha Rahman', 'aisha.demo@example.com', '90000011', 'Software Engineering', 4),
      (ws, 'Daniel Tan', 'daniel.demo@example.com', '90000012', 'Computer Science', 3),
      (ws, 'Mei Ling Wong', 'meiling.demo@example.com', '90000013', 'Data Science', 3),
      (ws, 'Ravi Kumar', 'ravi.demo@example.com', '90000014', 'Information Technology', 2)
    on conflict do nothing;

    insert into public.student_skills (workspace_id, student_id, skill_id, proficiency)
    select ws, s.id, k.id, 2 + (abs(hashtext(k.id::text || s.email)) % 2)  -- levels are 1 to 3
    from public.students s
    join (values ('aisha.demo@example.com', '{python,database,sql,api,security}'::text[]),
                 ('daniel.demo@example.com', '{react,ui,css,javascript,design,html}'::text[]),
                 ('meiling.demo@example.com', '{data,analytics,python,sql,machine,visual}'::text[]),
                 ('ravi.demo@example.com', '{mobile,flutter,android,ios,firebase,testing}'::text[])) v(email, hints)
      on v.email = s.email
    cross join lateral (
      select k.id from public.skills k
      where k.workspace_id = ws
      order by exists (select 1 from unnest(v.hints) h where k.skill_name ilike '%' || h || '%') desc,
               abs(hashtext(k.id::text || s.email))
      limit 4) k
    where s.workspace_id = ws
      and not exists (select 1 from public.student_skills x where x.student_id = s.id);
  end if;

  for rec in
    select d.*, case d.wsp when 'acme' then ws else hack end as w
    from demo_more d
    where d.wsp = 'acme' or hack is not null
    order by d.ord
  loop
    select id into proj from public.projects where workspace_id = rec.w and key = rec.pkey;

    if rec.state in ('done', 'late') then
      done_day := current_date - rec.age;
      insert into public.tasks (workspace_id, project_id, description, status, severity, committed_hours,
                                start_date, due_date, completed_at)
      values (rec.w, proj, rec.descr, 'Completed', rec.sev, rec.hrs,
              done_day - (rec.hrs / 2)::int - 3,
              case when rec.state = 'late' then done_day - 2 else done_day + 1 + (rec.ord % 3) end,
              done_day + time '15:30')
      returning id into t_id;
    else
      insert into public.tasks (workspace_id, project_id, description, status, severity, committed_hours,
                                start_date, due_date)
      values (rec.w, proj, rec.descr, case when rec.state = 'doing' then 'In Progress' else 'New' end,
              rec.sev, rec.hrs, current_date - (rec.ord % 5), current_date + rec.age)
      returning id into t_id;
    end if;

    -- Required skills: the workspace's skills whose names match the hints, else two of them.
    insert into public.task_skills (workspace_id, task_id, skill_id, min_proficiency)
    select rec.w, t_id, k.id, case when rec.sev = 'Critical' then 3 else 2 end
    from (select k.id from public.skills k
          where k.workspace_id = rec.w
            and exists (select 1 from unnest(rec.hints) h where k.skill_name ilike '%' || h || '%')
          order by k.skill_name limit 3) k;
    if not found then
      insert into public.task_skills (workspace_id, task_id, skill_id, min_proficiency)
      select rec.w, t_id, k.id, 2
      from public.skills k where k.workspace_id = rec.w
      order by abs(hashtext(k.id::text || rec.ord)) limit 2;
    end if;

    continue when rec.state = 'open';

    -- Best match: most required skills met, then the lightest current load.
    pick := null;
    select s.id into pick
    from public.students s
    where s.workspace_id = rec.w
      and (rec.state in ('done', 'late') or s.away_until is null or s.away_until < current_date)
      and (rec.state in ('done', 'late')
           or (select count(*) from public.assignments a
               where a.student_id = s.id and a.status in ('Assigned', 'In Progress')) < 4)
    order by
      (select count(*) from public.task_skills ts
       join public.student_skills ss on ss.skill_id = ts.skill_id and ss.student_id = s.id
       where ts.task_id = t_id and ss.proficiency >= ts.min_proficiency) desc,
      (select count(*) from public.assignments a
       where a.student_id = s.id and a.status in ('Assigned', 'In Progress')),
      random()
    limit 1;

    if pick is null then   -- everyone's full: leave it waiting for people
      update public.tasks set status = 'New' where id = t_id and status = 'In Progress';
      continue;
    end if;
    n := n + 1;

    if rec.state in ('done', 'late') then
      -- Most land near the estimate; late ones ran over. Score = committed / (committed + actual).
      hrs := round(rec.hrs * case when rec.state = 'late' then 1.6 else 0.7 + (rec.ord % 5) * 0.12 end, 1);
      insert into public.assignments (workspace_id, task_id, student_id, status, assigned_date,
                                      in_progress_at, completed_at, actual_hours, score)
      values (rec.w, t_id, pick, 'Completed', done_day - (rec.hrs / 2)::int - 4,
              (done_day - (rec.hrs / 2)::int - 3) + time '10:00', done_day + time '15:30',
              hrs, round(rec.hrs / (rec.hrs + hrs), 3));
      insert into public.activity_logs (workspace_id, action, entity_type, entity_id, summary, details,
                                        actor_email, actor_role, created_at)
      select rec.w, case when rec.state = 'late' then 'task.completed_late' else 'task.completed' end,
             'task', t_id,
             s.name || ' completed task ''' || rec.descr || ''' in ' || hrs || 'h'
               || case when rec.state = 'late' then ' (past due)' else ' (on time)' end,
             jsonb_build_object('task_id', t_id, 'student_id', s.id, 'elapsed_hours', hrs,
                                'committed_hours', rec.hrs, 'late', rec.state = 'late'),
             s.email, 'member', done_day + time '15:30'
      from public.students s where s.id = pick;
    else
      insert into public.assignments (workspace_id, task_id, student_id, status, assigned_date, in_progress_at)
      values (rec.w, t_id, pick, case when rec.state = 'doing' then 'In Progress' else 'Assigned' end,
              current_date - 1 - (rec.ord % 4),
              case when rec.state = 'doing' then now() - make_interval(hours => 6 + rec.ord % 40) end);
      insert into public.activity_logs (workspace_id, action, entity_type, entity_id, summary, details,
                                        actor_email, actor_role, created_at)
      select rec.w, 'assignment.assigned', 'assignment', t_id,
             s.name || ' assigned to task ''' || rec.descr || ''' (best match)',
             jsonb_build_object('task_id', t_id, 'student_id', s.id, 'mode', 'best_match'),
             admin_email, 'admin', now() - make_interval(days => 1 + rec.ord % 4, hours => rec.ord % 7)
      from public.students s where s.id = pick;
    end if;
  end loop;

  -- A short conversation on some of the new work.
  insert into public.task_comments (workspace_id, task_id, author_email, body, created_at)
  select t.workspace_id, t.id, coalesce(s.email, admin_email), c.body, now() - make_interval(hours => c.h)
  from public.tasks t
  left join public.assignments a on a.task_id = t.id
  left join public.students s on s.id = a.student_id
  join (values
    ('Role checks on every write endpoint', 'Done for tasks and projects. Doing assignments next.', 20),
    ('Role checks on every write endpoint', 'Viewers now get a clear message instead of a silent fail.', 3),
    ('Interactive product tour', 'First three steps work. Need copy for the last two.', 26),
    ('On-time rate by project chart', 'Draft is up, colours follow the project colour.', 5),
    ('Nightly database backups with restore test', 'Restore test caught a missing extension. Fixed, but it pushed this past the date.', 800),
    ('Predict hours from similar past tasks', 'Needed more history than expected; accuracy is about right now.', 390),
    ('Swipe to start or complete a task', 'Works on Android, checking iOS gestures.', 9),
    ('Seed data for the demo', 'Ten fake profiles in, matching looks believable.', 2)) c(task, body, h)
    on c.task = t.description
  where t.workspace_id in (ws, hack);

  raise notice 'Added % assigned or finished tasks (plus some still waiting for people).', n;
end $$;

-- What each workspace has now.
select w.name as workspace, coalesce(p.key, '(none)') as project, t.status, count(*) as tasks
from public.tasks t
join public.workspaces w on w.id = t.workspace_id
left join public.projects p on p.id = t.project_id
group by 1, 2, 3
order by 1, 2, 3;
