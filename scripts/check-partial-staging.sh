#!/bin/sh
# Pre-commit guard: refuse a commit when a staged file also has unstaged changes.
# lint-staged runs with --no-stash (the stash stack is shared by every worktree
# and git stash is banned), so it would fix and re-stage those unstaged hunks too.
# Fast: two `git diff --name-only` calls, no file contents.

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$staged" ] && exit 0
unstaged=$(git diff --name-only)
[ -z "$unstaged" ] && exit 0

both=""
old_ifs=$IFS
IFS='
'
for f in $staged; do
  if printf '%s\n' "$unstaged" | grep -Fxq -- "$f"; then
    both="$both
  $f"
  fi
done
IFS=$old_ifs

if [ -n "$both" ]; then
  echo "pre-commit: these files are partially staged (staged AND unstaged changes):$both" >&2
  echo "Stage the whole file (git add <file>) or move the extra edits out of the" >&2
  echo "working tree first (a WIP commit, never git stash), then commit again." >&2
  exit 1
fi
exit 0
