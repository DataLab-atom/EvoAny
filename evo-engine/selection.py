"""Selection algorithms for evolutionary population management.

Ported from reevo2d.py's rank_select / random_select, generalized for git-branch individuals.
"""

from __future__ import annotations
import random
import math
from models import Individual, Operation


def rank_select(
    individuals: list[Individual],
    n_pairs: int,
    is_minimize: bool = True,
) -> list[tuple[Individual, Individual]]:
    """
    Rank-based selection. Select pairs with probability proportional to rank.
    Better individuals have higher probability of being selected.

    Returns list of (better, worse) pairs for crossover.
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    if len(valid) < 2:
        return []

    valid.sort(key=lambda x: x.fitness, reverse=not is_minimize)

    n = len(valid)
    # Rank probabilities: rank 0 (best) gets highest probability
    probs = [1.0 / (rank + 1 + n) for rank in range(n)]
    total = sum(probs)
    probs = [p / total for p in probs]

    pairs = []
    max_trials = n_pairs * 100
    trials = 0
    while len(pairs) < n_pairs and trials < max_trials:
        trials += 1
        idxs = _weighted_sample_two(probs)
        if idxs is None:
            continue
        a, b = valid[idxs[0]], valid[idxs[1]]
        if a.fitness != b.fitness:
            if (a.fitness < b.fitness) == is_minimize:
                pairs.append((a, b))  # (better, worse)
            else:
                pairs.append((b, a))

    return pairs


def random_select(
    individuals: list[Individual],
    n_pairs: int,
    is_minimize: bool = True,
) -> list[tuple[Individual, Individual]]:
    """
    Random selection with equal probability.
    Returns list of (better, worse) pairs.
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    if len(valid) < 2:
        return []

    pairs = []
    max_trials = n_pairs * 100
    trials = 0
    while len(pairs) < n_pairs and trials < max_trials:
        trials += 1
        a, b = random.sample(valid, 2)
        if a.fitness != b.fitness:
            if (a.fitness < b.fitness) == is_minimize:
                pairs.append((a, b))
            else:
                pairs.append((b, a))
        elif random.random() < 0.2 and a.branch != b.branch:
            pairs.append((a, b))

    return pairs


def select_survivors(
    individuals: list[Individual],
    top_k: int,
    is_minimize: bool = True,
) -> tuple[list[Individual], list[Individual]]:
    """
    Keep top-k individuals, eliminate the rest.
    Returns (keep, eliminate).
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    invalid = [ind for ind in individuals if not ind.success or ind.fitness is None]

    valid.sort(key=lambda x: x.fitness, reverse=not is_minimize)

    keep = valid[:top_k]
    eliminate = valid[top_k:] + invalid

    return keep, eliminate


def plan_generation(
    targets: dict,
    pop_size: int,
    mutation_rate: float,
    budget_remaining: int,
    synergy_interval: int,
    generation: int,
    is_minimize: bool = True,
) -> list[dict]:
    """
    Decide what operations to run for each target this generation.
    Uses temperature-based explore/exploit.

    Returns list of {target_id, operation, count, priority}.
    """
    plan = []
    active_targets = {k: v for k, v in targets.items() if v.status.value == "active"}

    if not active_targets:
        return plan

    # Distribute budget proportional to temperature
    total_temp = sum(t.temperature for t in active_targets.values())
    if total_temp == 0:
        total_temp = len(active_targets)

    for target_id, target in active_targets.items():
        weight = target.temperature / total_temp
        n_variants = max(1, round(pop_size * weight))

        # Split between crossover and mutation
        n_mutate = max(1, round(n_variants * mutation_rate))
        n_crossover = max(0, n_variants - n_mutate)

        if n_crossover > 0:
            plan.append({
                "target_id": target_id,
                "operation": Operation.CROSSOVER,
                "count": n_crossover,
                "priority": "high" if target.temperature > 1.0 else "medium",
            })

        plan.append({
            "target_id": target_id,
            "operation": Operation.MUTATE,
            "count": n_mutate,
            "priority": "high" if target.temperature > 1.0 else "medium",
        })

    # Synergy check
    if generation > 0 and generation % synergy_interval == 0 and len(active_targets) > 1:
        target_ids = list(active_targets.keys())
        for i in range(len(target_ids)):
            for j in range(i + 1, len(target_ids)):
                plan.append({
                    "target_id": f"{target_ids[i]}+{target_ids[j]}",
                    "operation": Operation.SYNERGY,
                    "count": 1,
                    "priority": "low",
                })

    return plan


def update_temperatures(targets: dict, is_minimize: bool = True) -> None:
    """
    Update explore/exploit temperatures based on recent performance.
    Mutates targets in place.
    """
    for target in targets.values():
        if target.status.value == "frozen":
            target.temperature = 0.0
            continue

        if target.stagnation_count == 0:
            # Just improved — exploit more
            target.temperature = min(2.0, target.temperature + 0.3)
        elif target.stagnation_count >= 3:
            # Stagnating — explore less, save budget
            target.temperature = max(0.2, target.temperature - 0.2)
        # else: no change


def _weighted_sample_two(probs: list[float]) -> tuple[int, int] | None:
    """Sample two distinct indices with given probabilities."""
    if len(probs) < 2:
        return None
    idx1 = _weighted_choice(probs)
    # Temporarily zero out idx1 and renormalize
    adjusted = list(probs)
    adjusted[idx1] = 0
    total = sum(adjusted)
    if total == 0:
        return None
    adjusted = [p / total for p in adjusted]
    idx2 = _weighted_choice(adjusted)
    return (idx1, idx2)


def _weighted_choice(probs: list[float]) -> int:
    """Weighted random choice returning index."""
    r = random.random()
    cumulative = 0.0
    for i, p in enumerate(probs):
        cumulative += p
        if r <= cumulative:
            return i
    return len(probs) - 1
