---
name: hunt
description: "Find, clone, and set up a codebase for a given task, then hand off to /evolve"
---

# /hunt — Find & Deploy a Codebase

Usage: `/hunt <task description>`

Example: `/hunt I want SOTA on CIFAR-100-LT`

## Step 1: Literature & Repo Search

Run these sources **in parallel** for the best coverage:

### Source A — Papers With Code (via browser)

```
browser navigate: https://paperswithcode.com/sota/<relevant-benchmark>
```

Or search:
```
browser navigate: https://paperswithcode.com/search?q_type=&query=<keywords>
```

Extract: SOTA methods, their paper titles, official code links.

### Source B — arXiv (if `arxiv-watcher` skill is installed)

```
/arxiv-watcher <keywords>
```

Returns structured list of recent papers with abstracts and repo links.
Use when the task involves a specific ML problem (image classification, NLP, etc.).

### Source C — GitHub search

```
exec: gh search repos "<keywords from task>" --sort stars --limit 20 \
  --json name,url,description,stargazersCount,updatedAt
```

Try keyword variations:
- Core method name: e.g. "CIFAR-100 long-tail"
- Algorithm name: e.g. "balanced softmax" "decoupled training"
- Task type: e.g. "imbalanced classification pytorch"

### Source D — Summarize papers quickly (if `summarize` is installed)

For the top candidate papers, get their key contributions fast:
```
/summarize <arxiv_pdf_url>
```

Or for README of candidate repos:
```
/summarize <github_repo_url>
```

## Step 2: Evaluate Candidates

After collecting results from all sources, pick top 3–5 candidates. For each, check:
- Stars / recency / last commit date
- Has eval script or benchmark command?
- Clear setup instructions?
- License allows modification?

Present to user:
```
Found 3 candidates:
1. ⭐ 2.3k user/balanced-meta-softmax — BALMS, ECCV 2020, last commit 3mo ago
2. ⭐ 1.8k user/long-tail-recognition — Multiple methods, active maintenance
3. ⭐ 950 user/cifar-lt-baseline — Clean PyTorch baseline, good eval script
Recommend #1. Proceed? (or pick another)
```

Wait for user confirmation before proceeding.

## Step 3: Clone and Set Up

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

## Step 4: Install Dependencies

```
exec("cd <repo> && pip install -r requirements.txt")
```

Or if it uses conda/poetry/etc, follow the README instructions.
If dependency installation fails, read the error and fix it.

## Step 5: Prepare Data

Look for data download scripts or instructions:
```
exec("cd <repo> && python download_data.py")
```
or
```
exec("cd <repo> && bash scripts/prepare_data.sh")
```

If data needs manual download, tell the user what to do and wait.

## Step 6: Verify Baseline

Find and run the evaluation command:
```
exec("cd <repo> && python eval.py")  # or whatever the README says
```

Confirm it runs and produces a numeric result.

## Step 7: Hand off to /evolve

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
