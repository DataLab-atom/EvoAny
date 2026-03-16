---
name: hunt
description: "Find, clone, and set up a codebase for a given task, then hand off to /evolve"
---

# /hunt — Find & Deploy a Codebase

Usage: `/hunt <task description>`

Example: `/hunt I want SOTA on CIFAR-100-LT`

## Step 1: Search for candidate repos

Use `exec` to search GitHub:

```
gh search repos "<keywords from task>" --sort stars --limit 20 --json name,url,description,stargazersCount
```

Also try variations:
- Extract key terms from the task (e.g. "CIFAR-100" "long-tail" "imbalanced classification")
- Search with different keyword combos
- Check paperswithcode.com via `browser` for SOTA methods + their official repos

Pick the top 3-5 candidates. For each, quickly check:
- Stars / recency / maintenance (last commit date)
- Does it have an eval script or benchmark command?
- Does it have clear setup instructions?
- License allows modification?

Present candidates to the user:
```
Found 3 candidates:
1. ⭐ 2.3k user/balanced-meta-softmax — BALMS, ECCV 2020, last commit 3mo ago
2. ⭐ 1.8k user/long-tail-recognition — Multiple methods, active maintenance
3. ⭐ 950 user/cifar-lt-baseline — Clean PyTorch baseline, good eval script
Recommend #1. Proceed? (or pick another)
```

Wait for user confirmation before proceeding.

## Step 2: Clone and set up

```
exec("git clone <repo_url> ~/evo-workspace/<repo_name>")
exec("cd ~/evo-workspace/<repo_name> && cat README.md")
```

Read the README to understand:
- Python version requirement
- How to install dependencies
- How to download/prepare data
- How to run training
- How to run evaluation

## Step 3: Install dependencies

```
exec("cd <repo> && pip install -r requirements.txt")
```

Or if it uses conda/poetry/etc, follow the README instructions.
If dependency installation fails, read the error and fix it.

## Step 4: Prepare data

Look for data download scripts or instructions:
```
exec("cd <repo> && python download_data.py")
```
or
```
exec("cd <repo> && bash scripts/prepare_data.sh")
```

If data needs manual download, tell the user what to do and wait.

## Step 5: Verify baseline

Find and run the evaluation command:
```
exec("cd <repo> && python eval.py")  # or whatever the README says
```

Confirm it runs and produces a numeric result.

## Step 6: Hand off to /evolve

Once everything works, automatically invoke /evolve:
```
/evolve <repo_path> <benchmark_cmd> --objective max --max-evals 200
```

Tell the user:
```
Repo cloned and set up at ~/evo-workspace/<name>
Baseline: XX.X%
Starting evolution with 200 evaluations.
```
