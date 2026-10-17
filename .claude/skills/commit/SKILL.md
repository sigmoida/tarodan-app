---
name: commit
description: Commit the current work in tarodan-app as one or more focused Conventional Commits that pass commitlint. Use whenever work is ready to commit, including at the end of an agent task.
argument-hint: "[optional hint, e.g. only the ui package]"
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(npx commitlint *), Read, Grep
---

# Commit

Extra instruction (may be empty): $ARGUMENTS

## Current state

- Branch: !`git branch --show-current`
- Staged: !`git diff --cached --stat`
- Unstaged: !`git diff --stat`
- Untracked: !`git status --porcelain --untracked-files=all | grep '^??' || echo none`
- Recent commits (match their tone): !`git log --oneline -8`

## Rules (tarodan-ops: docs/commit-and-branch-rules.md)

- **English**, always, even when the conversation is Turkish. ASCII header.
- Format `type(scope): subject`.
  - Types: `feat fix refactor perf docs test chore build ci style revert`
    (`style` = formatting only; git's own `Revert "..."` / `Reapply "..."`
    messages are accepted as generated).
  - Scopes: `api`, `web`, `admin`, `ui`, `types`, `i18n`, `design-tokens`,
    `auth`, `shared`, `infra`, `ci`, `deps`, `release`, `scripts`. Join with
    commas when a change truly spans areas
    (`fix(api,i18n): ...`); omit only for repo-wide changes.
  - Subject: imperative, starts lower case, at most 72 characters, no period.
- Write a body whenever the why is not obvious: what was broken, why this
  approach, what was deliberately left alone. Wrap at 72 columns.
- **No `Co-Authored-By` trailer and no "Generated with" footer.**
- Focused commits; split unrelated changes, but never leave an intermediate
  commit that does not build.
- **Never `git add -A` blindly.** Leave out scratch output, `.env*`, editor
  state and lockfile churn you did not cause, and say what you left out.
- Never `--no-verify`, never `git stash`, never `--amend` a commit that is not
  yours or is already pushed.
- Do not push, open a PR or create a branch unless asked. If the branch is
  `master`, stop and ask. If it is `development` and you are an agent, stop:
  agents commit on their own `<type>/<kebab>` branch.

## Steps

1. Read the diff well enough to describe it accurately.
2. Decide the grouping (one or several commits) and say it in one line.
3. Stage explicit paths (`git add <paths>`), then commit with a heredoc:

   ```bash
   git commit -F - <<'MSG'
   fix(api): lock the offer row before a seller counter

   Two counters raced and both passed the status check ...
   MSG
   ```

4. lint-staged (eslint --fix + prettier) may rewrite staged files and
   commitlint may reject the message. Fix and retry; confirm with
   `git log --oneline -1`.
5. Report the subject line(s) and anything left uncommitted. A commit is not
   approval: mid-level work goes to the senior of its discipline for
   `/code-review`, and seniors self-review before handing over (tarodan-ops
   `CLAUDE.md`, "Process").

To check a message first: `echo "feat(api): add x" | npx commitlint`.
