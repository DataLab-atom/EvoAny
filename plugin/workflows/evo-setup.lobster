name: evo-setup
description: "Deterministic pre-evolution setup: validate repo, run baseline, tag seed, create memory dirs, init canvas"

args:
  repo:
    description: "Absolute path to the target git repository"
  benchmark:
    description: "Benchmark command to run (must print a float on the last line)"
  objective:
    default: "max"
    description: "Optimization direction: max or min"

steps:
  - id: check_clean
    command: exec --shell 'git -C "{args.repo}" status --porcelain'
    # Empty output = clean. Non-empty = dirty tree, should fail fast.

  - id: record_seed_commit
    command: exec --shell 'git -C "{args.repo}" rev-parse HEAD'

  - id: run_baseline
    command: exec --shell 'cd "{args.repo}" && {args.benchmark} 2>&1'
    # stdout must end with a float on the last line (e.g. "0.8423")

  - id: tag_seed
    command: exec --shell 'git -C "{args.repo}" tag seed-baseline'

  - id: create_memory_dirs
    command: exec --shell 'mkdir -p "{args.repo}/memory/global" "{args.repo}/memory/synergy" "{args.repo}/memory/targets"'

  - id: init_canvas_dir
    command: exec --shell 'mkdir -p ~/clawd/canvas'
