"""Selection algorithms for evolutionary population management.

All selection uses NSGA-II semantics:
  - Primary sort key:  Pareto rank (lower = better; rank 1 = non-dominated front)
  - Secondary sort key: crowding distance (higher = better; preserves diversity)

Single-objective runs are a degenerate case where every individual is on its
own rank (no two solutions can dominate each other on a single axis), so the
algorithm degrades to simple rank selection — identical behaviour to the old
top-k select_survivors.
"""

from __future__ import annotations
import random
from models import Individual, ObjectiveSpec, Objective, Operation


# ---------------------------------------------------------------------------
# Core NSGA-II primitives
# ---------------------------------------------------------------------------


def dominates(
    a: list[float],
    b: list[float],
    objectives: list[ObjectiveSpec],
) -> bool:
    """Return True if fitness vector *a* Pareto-dominates *b*.

    *a* dominates *b* iff:
      - *a* is at least as good as *b* on every objective, AND
      - *a* is strictly better than *b* on at least one objective.
    """
    at_least_as_good = True
    strictly_better = False
    for ai, bi, obj in zip(a, b, objectives):
        if obj.direction == Objective.MIN:
            if ai > bi:
                at_least_as_good = False
                break
            if ai < bi:
                strictly_better = True
        else:  # MAX
            if ai < bi:
                at_least_as_good = False
                break
            if ai > bi:
                strictly_better = True
    return at_least_as_good and strictly_better


def fast_non_dominated_sort(
    individuals: list[Individual],
    objectives: list[ObjectiveSpec],
) -> list[list[Individual]]:
    """Partition *individuals* into Pareto fronts F1, F2, …

    F1 is the non-dominated front (rank 1).  Each subsequent front Fi contains
    individuals that are only dominated by those in F1..F(i-1).

    Individuals whose fitness is None are excluded (they cannot be compared).
    Runs in O(n²·m) where n = population size, m = number of objectives.
    """
    valid = [ind for ind in individuals if ind.fitness is not None]
    n = len(valid)
    if n == 0:
        return []

    dominated_count = [0] * n          # how many individuals dominate i
    domination_list = [[] for _ in range(n)]  # indices that i dominates

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            fi = valid[i].fitness
            fj = valid[j].fitness
            if dominates(fi, fj, objectives):
                domination_list[i].append(j)
            elif dominates(fj, fi, objectives):
                dominated_count[i] += 1

    fronts: list[list[int]] = [[]]
    for i in range(n):
        if dominated_count[i] == 0:
            fronts[0].append(i)

    current = 0
    while fronts[current]:
        next_front: list[int] = []
        for i in fronts[current]:
            for j in domination_list[i]:
                dominated_count[j] -= 1
                if dominated_count[j] == 0:
                    next_front.append(j)
        current += 1
        fronts.append(next_front)

    # Convert index lists → Individual lists, drop empty trailing front.
    return [[valid[i] for i in front] for front in fronts if front]


def crowding_distance_assignment(
    front: list[Individual],
    objectives: list[ObjectiveSpec],
) -> dict[str, float]:
    """Compute crowding distance for each individual in a single Pareto front.

    Boundary individuals (best/worst on any objective) receive ∞.
    Interior individuals receive the sum of normalised gaps to their neighbours
    across all objectives.

    Returns a mapping branch → crowding distance.
    """
    distances: dict[str, float] = {ind.branch: 0.0 for ind in front}
    n = len(front)
    if n <= 2:
        for ind in front:
            distances[ind.branch] = float("inf")
        return distances

    for m in range(len(objectives)):
        sorted_front = sorted(front, key=lambda x: x.fitness[m])
        # Boundary individuals get infinite distance.
        distances[sorted_front[0].branch] = float("inf")
        distances[sorted_front[-1].branch] = float("inf")
        f_min = sorted_front[0].fitness[m]
        f_max = sorted_front[-1].fitness[m]
        span = f_max - f_min
        if span == 0:
            continue
        for k in range(1, n - 1):
            distances[sorted_front[k].branch] += (
                sorted_front[k + 1].fitness[m] - sorted_front[k - 1].fitness[m]
            ) / span

    return distances


# ---------------------------------------------------------------------------
# Public selection API
# ---------------------------------------------------------------------------


def select_survivors(
    individuals: list[Individual],
    top_k: int,
    objectives: list[ObjectiveSpec],
) -> tuple[list[Individual], list[Individual]]:
    """Keep the best *top_k* individuals using NSGA-II selection.

    Selection procedure:
      1. Accept entire Pareto fronts until the next front would overflow top_k.
      2. Fill the remaining slots from that front ordered by crowding distance
         (descending — prefer boundary / isolated individuals for diversity).

    Returns (keep, eliminate).
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    invalid = [ind for ind in individuals if not ind.success or ind.fitness is None]

    if not valid:
        return [], invalid

    fronts = fast_non_dominated_sort(valid, objectives)

    # Assign pareto_rank to individuals (mutates in place — informational).
    for rank, front in enumerate(fronts, start=1):
        for ind in front:
            ind.pareto_rank = rank

    keep: list[Individual] = []
    remaining = top_k

    for front in fronts:
        if remaining <= 0:
            break
        if len(front) <= remaining:
            keep.extend(front)
            remaining -= len(front)
        else:
            # Partial front: pick by crowding distance.
            distances = crowding_distance_assignment(front, objectives)
            sorted_front = sorted(
                front,
                key=lambda x: distances[x.branch],
                reverse=True,
            )
            keep.extend(sorted_front[:remaining])
            remaining = 0

    keep_set = {ind.branch for ind in keep}
    eliminate = [ind for ind in valid if ind.branch not in keep_set] + invalid
    return keep, eliminate


def rank_select(
    individuals: list[Individual],
    n_pairs: int,
    objectives: list[ObjectiveSpec],
) -> list[tuple[Individual, Individual]]:
    """Select parent pairs using Pareto rank + crowding distance.

    Individuals with lower Pareto rank (closer to front 1) and higher crowding
    distance are given higher selection probability.  Returns (better, worse)
    pairs for crossover.
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    if len(valid) < 2:
        return []

    fronts = fast_non_dominated_sort(valid, objectives)

    rank_of: dict[str, int] = {}
    cd_of: dict[str, float] = {}
    for rank, front in enumerate(fronts, start=1):
        for ind in front:
            rank_of[ind.branch] = rank
        cd_of.update(crowding_distance_assignment(front, objectives))

    # Sort: lower rank first, then higher crowding distance.
    valid.sort(
        key=lambda x: (rank_of.get(x.branch, 9999), -cd_of.get(x.branch, 0.0))
    )

    n = len(valid)
    probs = [1.0 / (i + 1 + n) for i in range(n)]
    total = sum(probs)
    probs = [p / total for p in probs]

    def _is_better(a: Individual, b: Individual) -> bool:
        ra, rb = rank_of.get(a.branch, 9999), rank_of.get(b.branch, 9999)
        if ra != rb:
            return ra < rb
        return cd_of.get(a.branch, 0.0) >= cd_of.get(b.branch, 0.0)

    pairs: list[tuple[Individual, Individual]] = []
    max_trials = n_pairs * 100
    trials = 0
    while len(pairs) < n_pairs and trials < max_trials:
        trials += 1
        idxs = _weighted_sample_two(probs)
        if idxs is None:
            continue
        a, b = valid[idxs[0]], valid[idxs[1]]
        if a.branch == b.branch:
            continue
        if _is_better(a, b):
            pairs.append((a, b))
        else:
            pairs.append((b, a))

    return pairs


def random_select(
    individuals: list[Individual],
    n_pairs: int,
    objectives: list[ObjectiveSpec],
) -> list[tuple[Individual, Individual]]:
    """Random selection with equal probability.

    Returns (better, worse) pairs where 'better' is determined by Pareto rank.
    Falls back to arbitrary order when both individuals have equal rank.
    """
    valid = [ind for ind in individuals if ind.success and ind.fitness is not None]
    if len(valid) < 2:
        return []

    fronts = fast_non_dominated_sort(valid, objectives)
    rank_of: dict[str, int] = {}
    for rank, front in enumerate(fronts, start=1):
        for ind in front:
            rank_of[ind.branch] = rank

    pairs: list[tuple[Individual, Individual]] = []
    max_trials = n_pairs * 100
    trials = 0
    while len(pairs) < n_pairs and trials < max_trials:
        trials += 1
        a, b = random.sample(valid, 2)
        ra, rb = rank_of.get(a.branch, 9999), rank_of.get(b.branch, 9999)
        if ra < rb:
            pairs.append((a, b))
        elif rb < ra:
            pairs.append((b, a))
        elif random.random() < 0.2:
            pairs.append((a, b))  # same rank — order is arbitrary

    return pairs


# ---------------------------------------------------------------------------
# Generation planning
# ---------------------------------------------------------------------------


def plan_generation(
    targets: dict,
    pop_size: int,
    mutation_rate: float,
    structural_rate: float,
    budget_remaining: int,
    synergy_interval: int,
    generation: int,
) -> list[dict]:
    """Decide what operations to run for each target this generation.

    Uses temperature-based explore/exploit budget distribution.
    Returns list of {target_id, operation, count, priority}.

    Structural ops get a base slice of each target's budget (structural_rate).
    When stagnation_count >= 3 the structural rate is doubled (capped at 0.5).
    """
    plan = []
    active_targets = {k: v for k, v in targets.items() if v.status.value == "active"}

    if not active_targets:
        return plan

    total_temp = sum(t.temperature for t in active_targets.values())
    if total_temp == 0:
        total_temp = len(active_targets)

    for target_id, target in active_targets.items():
        weight = target.temperature / total_temp
        n_variants = max(1, round(pop_size * weight))

        # Structural slots — boosted on stagnation.
        effective_structural_rate = structural_rate
        if target.stagnation_count >= 3:
            effective_structural_rate = min(0.5, structural_rate * 2)
        n_structural = round(n_variants * effective_structural_rate)
        n_remaining = max(1, n_variants - n_structural)

        if n_structural > 0:
            plan.append({
                "target_id": target_id,
                "operation": Operation.STRUCTURAL,
                "count": n_structural,
                "priority": "high" if target.stagnation_count >= 3 else "medium",
            })

        n_mutate = max(1, round(n_remaining * mutation_rate))
        n_crossover = max(0, n_remaining - n_mutate)

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

    # Synergy check every N generations when there are multiple active targets.
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


def update_temperatures(targets: dict) -> None:
    """Update per-target explore/exploit temperatures based on recent stagnation.

    Mutates targets in place.  The stagnation_count is set by the caller
    (server.py) based on whether the local Pareto front expanded this generation.
    """
    for target in targets.values():
        if target.status.value == "frozen":
            target.temperature = 0.0
            continue

        if target.stagnation_count == 0:
            # Pareto front expanded — increase budget to explore further.
            target.temperature = min(2.0, target.temperature + 0.3)
        elif target.stagnation_count >= 3:
            # Stagnating — reduce budget, save for other targets.
            target.temperature = max(0.2, target.temperature - 0.2)


# ---------------------------------------------------------------------------
# Pareto front helpers (used by server.py)
# ---------------------------------------------------------------------------


def pareto_front_of(
    individuals: list[Individual],
    objectives: list[ObjectiveSpec],
) -> list[Individual]:
    """Return the non-dominated subset (rank-1 front) of *individuals*."""
    fronts = fast_non_dominated_sort(individuals, objectives)
    return fronts[0] if fronts else []


def representative_branch(
    pareto_branches: list[str],
    individuals: dict,
    objectives: list[ObjectiveSpec],
) -> str | None:
    """Pick the representative branch from a Pareto front.

    'Representative' = best on the first objective (primary objective).
    Used wherever a single 'best_branch' is needed for display or mutation.
    """
    candidates = [
        individuals[b] for b in pareto_branches
        if b in individuals and individuals[b].fitness is not None
    ]
    if not candidates:
        return None
    first_obj = objectives[0]
    reverse = first_obj.direction == Objective.MAX
    candidates.sort(key=lambda x: x.fitness[0], reverse=reverse)
    return candidates[0].branch


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _weighted_sample_two(probs: list[float]) -> tuple[int, int] | None:
    """Sample two distinct indices according to *probs*."""
    if len(probs) < 2:
        return None
    idx1 = _weighted_choice(probs)
    adjusted = list(probs)
    adjusted[idx1] = 0.0
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
