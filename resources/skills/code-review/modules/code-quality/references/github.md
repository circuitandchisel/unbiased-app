# GitHub review workflow

Use the current repository remote or the repository named in the user-provided PR URL. Read project guidance first. Use GitHub tools already available in the session; if using the CLI, `gh repo view`, `gh pr view`, `gh pr diff`, and `gh issue view` are read-only ways to inspect the repo, PR, and linked issue. If authentication or access is missing, explain the blocker; do not change remotes or credentials.

For a PR, inspect its base branch and head commit and ask the user to confirm the required fixed point when they have not supplied one. Review the actual target diff, not an unrelated local checkout. Read linked issues for acceptance criteria. If the user provides the spec directly, use that instead. If there is no spec, ask; if the user confirms none exists, report the Spec axis as unavailable.

Do not call `gh pr review`, `gh pr comment`, `gh issue comment`, `gh pr merge`, or any other write operation as part of a review. Report the Standards and Spec findings in the chat.
