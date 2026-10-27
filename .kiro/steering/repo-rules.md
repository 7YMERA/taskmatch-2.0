---
inclusion: always
---

# Repo rules

Follow the shared rules for both assistants in #[[file:AGENTS.md]].

The ones that matter most:

- Start every branch from the latest `main`. Never push to an old branch such as `level-3b-jira-autotune`: Vercel builds a preview for any branch whose `vercel.json` doesn't turn previews off, and each failed build emails the owner.
- Push Wiki pages to `https://github.com/7YMERA/taskmatch-v2.wiki.git`, never to a branch of the code repo.
- Commit as `7YMERA <140389858+7YMERA@users.noreply.github.com>`, set with `git config` in this repo only.
- No passwords, demo logins or keys in notes, commits or PRs. The repo is public.
