"""Data models for evolution state."""

from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
import time


class Objective(str, Enum):
    MIN = "min"
    MAX = "max"


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
    current_best_obj: Optional[float] = None
    current_best_branch: Optional[str] = None
    stagnation_count: int = 0  # generations without improvement


class Individual(BaseModel):
    """A single code variant living on a git branch."""
    branch: str
    generation: int
    target_id: str
    operation: Operation
    parent_branches: list[str] = Field(default_factory=list)
    fitness: Optional[float] = None
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
    best_branch: str
    best_obj: float


class EvolutionConfig(BaseModel):
    """Configuration for an evolution run."""
    repo_path: str
    benchmark_cmd: str
    objective: Objective = Objective.MIN
    max_fe: int = 500
    pop_size: int = 8
    mutation_rate: float = 0.5
    synergy_interval: int = 3
    top_k_survive: int = 5
    quick_cmd: Optional[str] = None
    # Glob patterns for files that must never be modified by evolution
    protected_patterns: list[str] = Field(default_factory=lambda: [
        "benchmark*.py", "eval*.py", "evaluate*.py",
        "run_eval*", "test_bench*", "*.sh",
    ])


class EvolutionState(BaseModel):
    """Full state of an evolution run, persisted to disk."""
    config: EvolutionConfig
    generation: int = 0
    total_evals: int = 0
    seed_obj: Optional[float] = None
    seed_branch: str = "seed-baseline"
    best_obj_overall: Optional[float] = None
    best_branch_overall: Optional[str] = None
    targets: dict[str, Target] = Field(default_factory=dict)
    # All individuals ever created, keyed by branch name
    individuals: dict[str, Individual] = Field(default_factory=dict)
    # Active branches per target (alive in current population)
    active_branches: dict[str, list[str]] = Field(default_factory=dict)
    # Fitness cache: code_hash -> fitness
    fitness_cache: dict[str, float] = Field(default_factory=dict)
    # Synergy records
    synergy_records: list[dict] = Field(default_factory=list)
    # Current generation batch (stored server-side so LLM just passes a cursor)
    current_batch: list[BatchItem] = Field(default_factory=list)
    batch_cursor: int = 0  # index of the next unprocessed item in current_batch
