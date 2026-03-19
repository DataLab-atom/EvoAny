---
name: evo-status
description: "Check current evolution progress"
---

# /evo-status — Evolution Status

Call `evo_get_status` and format the result for the user:

```
Generation: {generation} | Evals: {total_evals}/{max_fe}
Seed: {seed_obj} → Best: {best_obj_overall} ({improvement})

Targets:
  {target_id}: {current_best_obj} (temp={temperature}, stagnation={stagnation}) [{status}]
  ...

Best branch: {best_branch_overall}
Budget remaining: {budget_remaining}
```
