name: evo-setup
description: "Deterministic pre-evolution setup: validate repo, run baseline, tag seed, create memory dirs, init canvas"

args:
  repo:
    description: "Absolute path to the target git repository"
  benchmark:
    description: "Benchmark command to run. Output format depends on objectives count: single number for one objective, whitespace-separated numbers for multiple objectives, or JSON dict."
  objectives:
    default: '[{"name": "score", "direction": "min"}]'
    description: "JSON array of objective specs. Each object has 'name' (str) and 'direction' ('min' or 'max'). Example: [{\"name\": \"latency\", \"direction\": \"min\"}, {\"name\": \"accuracy\", \"direction\": \"max\"}]"

steps:
  - id: check_clean
    command: exec --shell 'git -C "{args.repo}" status --porcelain'
    # Empty output = clean. Non-empty = dirty tree, should fail fast.

  - id: record_seed_commit
    command: exec --shell 'git -C "{args.repo}" rev-parse HEAD'

  - id: run_baseline
    command: exec --shell 'cd "{args.repo}" && {args.benchmark} 2>&1'
    # stdout must end with fitness values matching the objectives count.

  - id: tag_seed
    command: exec --shell 'git -C "{args.repo}" tag seed-baseline'

  - id: create_memory_dirs
    command: exec --shell 'mkdir -p "{args.repo}/memory/global" "{args.repo}/memory/synergy" "{args.repo}/memory/targets"'

  - id: init_canvas_dir
    command: exec --shell 'mkdir -p ~/clawd/canvas'
