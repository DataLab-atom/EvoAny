name: evo-finish
description: "Post-evolution: tag best, push branch, approval gate, open PR"

args:
  repo:
    description: "Absolute path to the target git repository"
  best_branch:
    description: "The best branch from evolution (e.g. gen-5/loss-fn/mutate-2)"
  original_branch:
    description: "The branch to target for the PR (e.g. main)"
  pr_title:
    description: "PR title summarizing the improvement"
  pr_body:
    description: "PR body with per-target table, key changes, and repro steps"

steps:
  - id: tag_best
    command: exec --shell 'git -C "{args.repo}" tag best-overall {args.best_branch}'

  - id: push_best
    command: exec --shell 'git -C "{args.repo}" push origin {args.best_branch}'

  - id: show_diff_summary
    command: exec --shell 'git -C "{args.repo}" diff seed-baseline..{args.best_branch} --stat'
    # Shows which files changed and how much — shown to user before approval

  - id: approve_pr
    command: exec --shell 'echo "{args.pr_title}"'
    stdin: $show_diff_summary.stdout
    approval: required
    # Halts here. User sees: pr_title + diff stat + prompt "Open PR?"

  - id: open_pr
    command: exec --shell 'gh pr create --repo $(git -C "{args.repo}" remote get-url origin | sed "s/.*github.com[:/]//;s/.git$//") --head {args.best_branch} --base {args.original_branch} --title "{args.pr_title}" --body "{args.pr_body}"'
    condition: $approve_pr.approved
    # Skipped entirely if user denies

  - id: show_result
    command: exec --shell 'echo "Done. Best branch: {args.best_branch}"'
    stdin: $show_diff_summary.stdout
