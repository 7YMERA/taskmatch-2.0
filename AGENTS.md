# Working on this repo (Claude and Kiro)

Two assistants work here: Claude (cloud and the personal laptop) and Kiro (KiroCrew, on the work
laptop). Read the [Claude notes](https://github.com/7YMERA/taskmatch-v2/wiki/Claude-Notes) and
[Kiro notes](https://github.com/7YMERA/taskmatch-v2/wiki/Kiro-Notes) on the Wiki before starting.

## Branches and Vercel previews

Only `main` deploys. The root [`vercel.json`](vercel.json) turns previews off for every other branch,
but Vercel reads that file **from the branch being pushed**. A branch without it gets a preview
build, and on the Hobby plan that build fails for commits Vercel can't tie to the owner's account,
so the owner gets a "failed deployment" email for every push.

- Start every branch from the latest `main`, so it carries the current `vercel.json`.
- Never push to an old or merged branch (for example `level-3b-jira-autotune`). Make a new branch from `main` instead.
- Never push Wiki pages to a branch of this repo. Push them to the Wiki repo itself
  (`https://github.com/7YMERA/taskmatch-v2.wiki.git`). If you can't, leave them as a git bundle in the
  project files for the owner's laptop to publish.
- Never push to `main` directly; open a pull request.

## Commit identity

Commit as the owner's GitHub no-reply address, set for this repo only (never globally on the work laptop):

```bash
git config user.name "7YMERA"
git config user.email "140389858+7YMERA@users.noreply.github.com"
```

An address like `taskmatch@local` isn't linked to any GitHub account, so the commits show no avatar
and Vercel can't match them to the owner.

## Every pull request

- Update `README.md`.
- Add an entry at the top of the Wiki **Changelog** (light and dark screenshots when the UI changes;
  "before" is always v1, the FYP in `7YMERA/taskmatch-git`).
- Add a row to your own notes page on the Wiki (`Claude-Notes` or `Kiro-Notes`): what changed,
  challenges, limitations, suggestions.
- The `docs/` folder is gone; write-ups live on the Wiki.

## Never commit secrets

The repo and Wiki are public. No passwords, demo logins, API keys or tokens in code, notes, commit
messages or PR text. Keys live in `.env` files and the Vercel settings.

## Code conventions

- New workspace-scoped tables go in `WORKSPACE_TABLES` in `taskmatch-api/main.py`.
- Permissions live in three places that must agree: `permissions.json`, the API's
  `ROLE_PERMISSIONS`, and SQL `tm_can()`.
- No emoji in the product UI; use the outline SVG icons in `taskmatch/app/components/ui.tsx`.
- The frontend's Next.js version differs from older docs: see [taskmatch/AGENTS.md](taskmatch/AGENTS.md).
