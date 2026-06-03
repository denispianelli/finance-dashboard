#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash).
#
# Stops the agent from integrating a STALE branch into `main`: if a command
# merges/pushes the current branch into main while HEAD is behind origin/main,
# deny it (exit 2) and tell Claude to update the branch first. Fails open
# (allows) when offline or outside a git repo, so it never wedges the agent.
#
# Reads the tool call as JSON on stdin; only `gh pr merge` and pushes targeting
# `main` are guarded — everything else passes through untouched.
set -u

payload=$(cat)
cmd=$(printf '%s' "$payload" | python3 -c 'import sys, json
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    print("")' 2>/dev/null)
[ -n "${cmd:-}" ] || exit 0

# Guard only commands that integrate the current branch INTO main.
integrates=0
[[ "$cmd" == *"gh pr merge"* ]] && integrates=1
# push to a ref named exactly `main` (origin main, HEAD:main, :main) — but not
# a branch merely containing "main", e.g. `main-fix`.
if [[ "$cmd" =~ git[[:space:]]+push ]] && [[ "$cmd" =~ (:|[[:space:]])main([[:space:]]|$) ]]; then
  integrates=1
fi
[ "$integrates" -eq 1 ] || exit 0

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
git fetch origin main --quiet 2>/dev/null || true
git rev-parse --verify --quiet origin/main >/dev/null 2>&1 || exit 0

behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "${behind:-0}" -gt 0 ]; then
  branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "HEAD")
  {
    echo "BLOCKED: '${branch}' is ${behind} commit(s) behind origin/main."
    echo "Do not integrate a stale branch into main — update it first:"
    echo "    git merge origin/main     # (or rebase), resolve conflicts, re-run typecheck + tests"
    echo "then retry the merge/push. Override only with the user's explicit approval."
  } >&2
  exit 2
fi
exit 0
