/**
 * Data models for evolution state.
 * TypeScript port of models.py — all Pydantic models become interfaces.
 */
export declare enum Objective {
    MIN = "min",
    MAX = "max"
}
export interface ObjectiveSpec {
    name: string;
    direction: Objective;
}
export declare enum BenchmarkOutputFormat {
    JSON = "json",
    NUMBERS = "numbers"
}
export interface BenchmarkSpec {
    cmd: string;
    output_format: BenchmarkOutputFormat;
    quick_cmd?: string | null;
}
export declare enum Operation {
    MUTATE = "mutate",
    CROSSOVER = "crossover",
    SYNERGY = "synergy",
    STRUCTURAL = "structural"
}
export declare enum TargetStatus {
    ACTIVE = "active",
    FROZEN = "frozen"
}
export interface Target {
    id: string;
    file: string;
    function: string;
    description: string;
    hint: string;
    derived_from: string[];
    impact: string;
    status: TargetStatus;
    temperature: number;
    current_best_obj: number[] | null;
    current_best_branch: string | null;
    pareto_branches: string[];
    stagnation_count: number;
}
export interface Individual {
    branch: string;
    generation: number;
    target_id: string;
    operation: Operation;
    parent_branches: string[];
    fitness: number[] | null;
    pareto_rank: number | null;
    success: boolean;
    code_hash: string | null;
    raw_output: string | null;
    timestamp: number;
}
export interface BatchItem {
    branch: string;
    operation: Operation;
    target_id: string;
    parent_branches: string[];
    target_file: string;
    target_function: string;
    target_description: string;
    target_hint: string;
    structural_op: string;
}
export interface SurvivorResult {
    keep: string[];
    eliminate: string[];
    best_branch: string;
    best_obj: number[] | null;
    pareto_front_size: number;
}
export interface EvolutionConfig {
    repo_path: string;
    benchmark: BenchmarkSpec;
    objectives: ObjectiveSpec[];
    max_fe: number;
    pop_size: number;
    mutation_rate: number;
    structural_rate: number;
    directions: string[];
    synergy_interval: number;
    top_k_survive: number;
    protected_patterns: string[];
}
export interface EvolutionState {
    config: EvolutionConfig;
    generation: number;
    total_evals: number;
    seed_obj: number[] | null;
    seed_branch: string;
    best_obj_overall: number[] | null;
    best_branch_overall: string | null;
    pareto_front: string[];
    targets: Record<string, Target>;
    individuals: Record<string, Individual>;
    active_branches: Record<string, string[]>;
    fitness_cache: Record<string, number[]>;
    synergy_records: Record<string, unknown>[];
    current_batch: BatchItem[];
    batch_cursor: number;
}
export declare function createDefaultTarget(t: {
    id: string;
    file: string;
    function: string;
    description?: string;
    hint?: string;
    impact?: string;
    derived_from?: string[];
}): Target;
export declare function createDefaultState(config: EvolutionConfig): EvolutionState;
export declare const DEFAULT_PROTECTED_PATTERNS: string[];
export interface DerivationNode {
    id: string;
    type: "change" | "hypothesis" | "evidence" | "question";
    content: string;
    parent_ids: string[];
    child_ids: string[];
    /** Git branches from evo_get_lineage related to this node */
    source_branches: string[];
    /** BibTeX keys from literature search */
    literature_refs: string[];
    /** B-layer experiment IDs */
    experiment_ids: string[];
    status: "active" | "pruned" | "converged";
    depth: number;
    created_at: number;
    updated_at: number;
}
export interface ConvergencePoint {
    id: string;
    /** The deep motivation Q — emerged from branch convergence */
    question: string;
    contributing_node_ids: string[];
    evidence_ids: string[];
    verification_status: "pending" | "verified" | "rejected";
}
export type ContributionLevel = "primary" | "auxiliary";
export interface Contribution {
    convergence_point_id: string;
    level: ContributionLevel;
    description: string;
    node_ids: string[];
}
export interface DerivationForest {
    id: string;
    evo_session_summary: string;
    nodes: Record<string, DerivationNode>;
    convergence_points: ConvergencePoint[];
    contributions: Contribution[];
    iteration_count: number;
    max_iterations: number;
    status: "exploring" | "converging" | "done";
    created_at: number;
    updated_at: number;
}
