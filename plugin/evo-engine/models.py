"""Data models for evolution state."""

from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
import time


class Objective(str, Enum):
    MIN = "min"
    MAX = "max"


class ObjectiveSpec(BaseModel):
    """Specification for a single optimization objective."""
    name: str
    direction: Objective


class BenchmarkOutputFormat(str, Enum):
    # Output is a JSON dict: {"speed": 1.2, "memory": 45.0}
    # Keys must match objective names, in order.
    JSON = "json"
    # Output ends with whitespace-separated numbers, one per objective.
    # Single-objective legacy: just one number on the last line.
    NUMBERS = "numbers"


class BenchmarkSpec(BaseModel):
    """How to run the benchmark and parse its output."""
    cmd: str
    output_format: BenchmarkOutputFormat = BenchmarkOutputFormat.NUMBERS
    quick_cmd: Optional[str] = None


class Operation(str, Enum):
    MUTATE = "mutate"
    CROSSOVER = "crossover"
    SYNERGY = "synergy"


class TargetStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"


class Target(BaseModel):
    """An optimization target (a function to evolve)."""
    id: str
    file: str
    function: str
    lines: str = ""
    impact: str = "medium"
    description: str = ""
    status: TargetStatus = TargetStatus.ACTIVE
    temperature: float = 1.0  # explore/exploit control
    # Representative fitness from the local Pareto front (first obj or primary obj).
    current_best_obj: Optional[list[float]] = None
    # Representative branch (best on first objective).
    current_best_branch: Optional[str] = None
    # Full local Pareto front for this target (branch names).
    pareto_branches: list[str] = Field(default_factory=list)
    stagnation_count: int = 0  # generations without Pareto front expansion


class Individual(BaseModel):
    """A single code variant living on a git branch."""
    branch: str
    generation: int
    target_id: str
    operation: Operation
    parent_branches: list[str] = Field(default_factory=list)
    # One fitness value per objective, in the same order as config.objectives.
    fitness: Optional[list[float]] = None
    # NSGA-II Pareto rank assigned after selection (1 = non-dominated front).
    pareto_rank: Optional[int] = None
    success: bool = False
    code_hash: Optional[str] = None
    raw_output: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)


class BatchItem(BaseModel):
    """A single operation to execute in the next batch."""
    branch: str
    operation: Operation
    target_id: str
    parent_branches: list[str]
    target_file: str
    target_function: str


class SurvivorResult(BaseModel):
    """Result of selection: who lives, who dies."""
    keep: list[str]
    eliminate: list[str]
    # Representative best branch (best on first objective).
    best_branch: str
    # Fitness of the representative (one value per objective).
    best_obj: Optional[list[float]] = None
    # Number of non-dominated solutions in the global Pareto front.
    pareto_front_size: int = 0


class EvolutionConfig(BaseModel):
    """Configuration for an evolution run."""
    repo_path: str
    benchmark: BenchmarkSpec
    # At least one objective is required.
    objectives: list[ObjectiveSpec]
    max_fe: int = 500
    pop_size: int = 8
    mutation_rate: float = 0.5
    synergy_interval: int = 3
    top_k_survive: int = 5
    # Glob patterns for files that must never be modified by evolution.
    protected_patterns: list[str] = Field(default_factory=lambda: [
        "benchmark*.py", "eval*.py", "evaluate*.py",
        "run_eval*", "test_bench*", "*.sh",
    ])


class EvolutionState(BaseModel):
    """Full state of an evolution run, persisted to disk."""
    config: EvolutionConfig
    generation: int = 0
    total_evals: int = 0
    # Baseline fitness of unmodified code (one value per objective).
    seed_obj: Optional[list[float]] = None
    seed_branch: str = "seed-baseline"
    # Representative best (best on first objective) — kept for agent compat.
    best_obj_overall: Optional[list[float]] = None
    best_branch_overall: Optional[str] = None
    # Global Pareto front: list of non-dominated branch names.
    pareto_front: list[str] = Field(default_factory=list)
    targets: dict[str, Target] = Field(default_factory=dict)
    # All individuals ever created, keyed by branch name.
    individuals: dict[str, Individual] = Field(default_factory=dict)
    # Active branches per target (alive in current population).
    active_branches: dict[str, list[str]] = Field(default_factory=dict)
    # Fitness cache: code_hash -> fitness vector.
    fitness_cache: dict[str, list[float]] = Field(default_factory=dict)
    # Synergy records.
    synergy_records: list[dict] = Field(default_factory=list)
    # Current generation batch.
    current_batch: list[BatchItem] = Field(default_factory=list)
    batch_cursor: int = 0
