"use strict";
/**
 * Evo-anything MCP Server — exposes all evolution tools via stdio transport.
 * OpenClaw discovers this through .mcp.json as a bundle MCP server.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const models_js_1 = require("./src/models.js");
const selection_js_1 = require("./src/selection.js");
const state_js_1 = require("./src/state.js");
const vectordb_js_1 = require("./src/vectordb.js");
const bibtex_js_1 = require("./src/bibtex.js");
const research_state_js_1 = require("./src/research_state.js");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STRUCTURAL_OPS = [
    "insert", "merge", "decouple", "split", "extract",
    "parallelize", "pipeline", "stratify", "cache",
];
const PHASE_BEGIN = "begin_generation";
const PHASE_CODE = "code_ready";
const PHASE_POLICY_PASS = "policy_pass";
const PHASE_POLICY_FAIL = "policy_fail";
const PHASE_FITNESS = "fitness_ready";
const PHASE_SELECT = "select";
const PHASE_REFLECT = "reflect_done";
const PHASE_DONE = "done";
// ---------------------------------------------------------------------------
// Helpers (same as index.ts)
// ---------------------------------------------------------------------------
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomSample(arr, n) {
    const copy = [...arr];
    const result = [];
    for (let i = 0; i < n && copy.length > 0; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        result.push(copy.splice(idx, 1)[0]);
    }
    return result;
}
function chooseParents(state, targetId, op) {
    const target = state.targets[targetId];
    const objectives = state.config.objectives;
    const pareto = target.pareto_branches;
    const active = state.active_branches[targetId] ?? [];
    if (op === models_js_1.Operation.MUTATE || op === models_js_1.Operation.STRUCTURAL) {
        if (pareto.length > 0)
            return [randomChoice(pareto)];
        if (target.current_best_branch)
            return [target.current_best_branch];
        return [state.seed_branch];
    }
    if (pareto.length >= 2)
        return randomSample(pareto, 2);
    const activeInds = active
        .filter((b) => b in state.individuals && state.individuals[b].success)
        .map((b) => state.individuals[b]);
    const pairs = (0, selection_js_1.rankSelect)(activeInds, 1, objectives);
    if (pairs.length > 0)
        return [pairs[0][0].branch, pairs[0][1].branch];
    if (target.current_best_branch)
        return [target.current_best_branch];
    return [state.seed_branch];
}
function calcImprovement(state) {
    if (!state.seed_obj || !state.best_obj_overall)
        return null;
    const result = {};
    for (let i = 0; i < state.config.objectives.length; i++) {
        const seedVal = state.seed_obj[i];
        const bestVal = state.best_obj_overall[i];
        if (seedVal === 0)
            continue;
        const pct = ((bestVal - seedVal) / Math.abs(seedVal)) * 100;
        result[state.config.objectives[i].name] = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    }
    return Object.keys(result).length > 0 ? result : null;
}
function writeDirectionsToMemory(directions, repoPath) {
    const memDir = (0, node_path_1.join)(repoPath, "memory", "global");
    (0, node_fs_1.mkdirSync)(memDir, { recursive: true });
    const memFile = (0, node_path_1.join)(memDir, "long_term.md");
    const lines = ["# User-specified optimization directions\n"];
    for (const d of directions)
        lines.push(`- ${d}\n`);
    lines.push("\n");
    const existing = (0, node_fs_1.existsSync)(memFile) ? (0, node_fs_1.readFileSync)(memFile, "utf-8") : "";
    (0, node_fs_1.writeFileSync)(memFile, lines.join("") + existing);
}
function inheritFromParent(state, newTarget, parentId) {
    if (parentId in state.targets) {
        const parent = state.targets[parentId];
        if (parent.pareto_branches.length > 0) {
            state.active_branches[newTarget.id] = [...parent.pareto_branches];
        }
        if (parent.current_best_branch && !newTarget.current_best_branch) {
            newTarget.current_best_branch = parent.current_best_branch;
            newTarget.current_best_obj = parent.current_best_obj;
        }
    }
    const srcDir = (0, node_path_1.join)(state.config.repo_path, "memory", "targets", parentId);
    const dstDir = (0, node_path_1.join)(state.config.repo_path, "memory", "targets", newTarget.id);
    if ((0, node_fs_1.existsSync)(srcDir)) {
        (0, node_fs_1.mkdirSync)(dstDir, { recursive: true });
        for (const name of (0, node_fs_1.readdirSync)(srcDir)) {
            const srcFile = (0, node_path_1.join)(srcDir, name);
            const dstFile = (0, node_path_1.join)(dstDir, name);
            const note = `# inherited from target '${parentId}' after structural op\n\n`;
            const existing = (0, node_fs_1.readFileSync)(srcFile, "utf-8");
            (0, node_fs_1.writeFileSync)(dstFile, note + existing);
        }
    }
}
function gitExec(repoPath, args) {
    try {
        return (0, node_child_process_1.execFileSync)("git", ["-C", repoPath, ...args], {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024,
        }).trim();
    }
    catch {
        return "";
    }
}
// ---------------------------------------------------------------------------
// Core impls (same as index.ts)
// ---------------------------------------------------------------------------
function beginGenerationImpl(state) {
    const budgetRemaining = state.config.max_fe - state.total_evals;
    if (budgetRemaining <= 0) {
        return { action: PHASE_DONE, reason: "budget exhausted", total_evals: state.total_evals };
    }
    const plan = (0, selection_js_1.planGeneration)(state.targets, state.config.pop_size, state.config.mutation_rate, state.config.structural_rate, budgetRemaining, state.config.synergy_interval, state.generation);
    const batch = [];
    const varCounter = {};
    for (const item of plan) {
        const tid = item.target_id;
        const op = item.operation;
        for (let c = 0; c < item.count; c++) {
            const key = `${tid}/${op}`;
            const idx = varCounter[key] ?? 0;
            varCounter[key] = idx + 1;
            if (op === models_js_1.Operation.SYNERGY) {
                const b = `gen-${state.generation}/synergy/${tid}-${idx}`;
                const parts = tid.split("+");
                const parents = parts
                    .filter((p) => p in state.targets && state.targets[p].current_best_branch)
                    .map((p) => state.targets[p].current_best_branch);
                batch.push({
                    branch: b, operation: op, target_id: tid,
                    parent_branches: parents, target_file: "", target_function: "",
                    target_description: "", target_hint: "", structural_op: "",
                });
            }
            else {
                const target = state.targets[tid];
                const b = `gen-${state.generation}/${tid}/${op}-${idx}`;
                const parents = chooseParents(state, tid, op);
                const structuralOp = op === models_js_1.Operation.STRUCTURAL ? randomChoice(STRUCTURAL_OPS) : "";
                batch.push({
                    branch: b, operation: op, target_id: tid,
                    parent_branches: parents, target_file: target.file,
                    target_function: target.function, target_description: target.description,
                    target_hint: target.hint, structural_op: structuralOp,
                });
            }
        }
    }
    state.current_batch = batch;
    state.batch_cursor = 0;
    (0, state_js_1.save)();
    if (batch.length === 0) {
        return { action: PHASE_DONE, reason: "empty batch", total_evals: state.total_evals };
    }
    return {
        action: "dispatch_workers",
        generation: state.generation,
        batch_size: batch.length,
        objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })),
        benchmark_format: state.config.benchmark.output_format,
        items: batch,
    };
}
function evoSelectSurvivorsImpl() {
    const state = (0, state_js_1.getState)();
    const objectives = state.config.objectives;
    const allKeep = [];
    const allEliminate = [];
    for (const [targetId, branches] of Object.entries(state.active_branches)) {
        const inds = branches.filter((b) => b in state.individuals).map((b) => state.individuals[b]);
        const { keep, eliminate } = (0, selection_js_1.selectSurvivors)(inds, state.config.top_k_survive, objectives);
        const keepBranches = keep.map((ind) => ind.branch);
        const elimBranches = eliminate.map((ind) => ind.branch);
        for (const pfBranch of state.pareto_front) {
            const elimIdx = elimBranches.indexOf(pfBranch);
            if (elimIdx !== -1) {
                elimBranches.splice(elimIdx, 1);
                if (!keepBranches.includes(pfBranch))
                    keepBranches.push(pfBranch);
            }
        }
        state.active_branches[targetId] = keepBranches;
        allKeep.push(...keepBranches);
        allEliminate.push(...elimBranches);
        if (targetId in state.targets) {
            const target = state.targets[targetId];
            const genInds = branches
                .filter((b) => b in state.individuals
                && state.individuals[b].generation === state.generation
                && state.individuals[b].success
                && state.individuals[b].fitness !== null)
                .map((b) => state.individuals[b]);
            const prevFront = target.pareto_branches.filter((b) => b in state.individuals && state.individuals[b].generation < state.generation);
            if ((0, state_js_1.paretoFrontExpanded)(genInds, prevFront, state.individuals, objectives)) {
                target.stagnation_count = 0;
            }
            else {
                target.stagnation_count++;
            }
        }
        (0, state_js_1.updateTargetPareto)(state, targetId);
    }
    (0, state_js_1.updateGlobalPareto)(state);
    (0, selection_js_1.updateTemperatures)(state.targets);
    state.generation++;
    (0, state_js_1.save)();
    return {
        keep: allKeep,
        eliminate: allEliminate,
        best_branch: state.best_branch_overall ?? state.seed_branch,
        best_obj: state.best_obj_overall,
        pareto_front_size: state.pareto_front.length,
    };
}
// ---------------------------------------------------------------------------
// Helper: wrap result as MCP text content
// ---------------------------------------------------------------------------
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new mcp_js_1.McpServer({
    name: "evo-anything",
    version: "0.1.0",
});
// ── evo_init ──────────────────────────────────────────────────────────────
server.tool("evo_init", "Initialize a new evolution run.", {
    repo_path: zod_1.z.string().describe("Path to the target git repository."),
    benchmark_cmd: zod_1.z.string().describe("Shell command that evaluates a code variant."),
    objectives: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string(), direction: zod_1.z.enum(["min", "max"]) })).optional().describe('Objectives list. Defaults to [{"name":"score","direction":"min"}].'),
    benchmark_format: zod_1.z.enum(["numbers", "json"]).optional().describe("Benchmark output format."),
    max_fe: zod_1.z.number().optional().describe("Max fitness evaluations."),
    pop_size: zod_1.z.number().optional().describe("Population size per generation."),
    mutation_rate: zod_1.z.number().optional().describe("Mutation rate."),
    structural_rate: zod_1.z.number().optional().describe("Structural operation rate."),
    synergy_interval: zod_1.z.number().optional().describe("Generations between synergy experiments."),
    top_k_survive: zod_1.z.number().optional().describe("Survivors per target per generation."),
    quick_cmd: zod_1.z.string().optional().describe("Quick sanity-check command."),
    directions: zod_1.z.array(zod_1.z.string()).optional().describe("Domain knowledge hints."),
}, async (params) => {
    const objectives = params.objectives ?? [{ name: "score", direction: "min" }];
    const objSpecs = objectives.map((o) => ({
        name: o.name, direction: o.direction,
    }));
    const config = {
        repo_path: params.repo_path,
        benchmark: {
            cmd: params.benchmark_cmd,
            output_format: (params.benchmark_format ?? "numbers"),
            quick_cmd: params.quick_cmd || null,
        },
        objectives: objSpecs,
        max_fe: params.max_fe ?? 500,
        pop_size: params.pop_size ?? 8,
        mutation_rate: params.mutation_rate ?? 0.5,
        structural_rate: params.structural_rate ?? 0.2,
        directions: params.directions ?? [],
        synergy_interval: params.synergy_interval ?? 3,
        top_k_survive: params.top_k_survive ?? 5,
        protected_patterns: models_js_1.DEFAULT_PROTECTED_PATTERNS,
    };
    const state = (0, models_js_1.createDefaultState)(config);
    (0, state_js_1.setState)(state);
    (0, state_js_1.save)();
    if (config.directions.length > 0)
        writeDirectionsToMemory(config.directions, config.repo_path);
    return ok({
        status: "initialized", repo_path: config.repo_path,
        objectives: objSpecs.map((o) => ({ name: o.name, direction: o.direction })),
        benchmark_format: config.benchmark.output_format,
        max_fe: config.max_fe, pop_size: config.pop_size,
        structural_rate: config.structural_rate,
        directions_loaded: config.directions.length,
    });
});
// ── evo_register_targets ──────────────────────────────────────────────────
server.tool("evo_register_targets", "Register optimization targets identified by code analysis.", {
    targets: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(), file: zod_1.z.string(), function: zod_1.z.string(),
        description: zod_1.z.string().optional(), hint: zod_1.z.string().optional(),
        impact: zod_1.z.string().optional(), derived_from: zod_1.z.array(zod_1.z.string()).optional(),
    })),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const inherited = [];
    for (const t of params.targets) {
        const target = (0, models_js_1.createDefaultTarget)(t);
        state.targets[target.id] = target;
        state.active_branches[target.id] = [];
        for (const parentId of target.derived_from) {
            inheritFromParent(state, target, parentId);
            inherited.push(`${target.id} <- ${parentId}`);
        }
    }
    (0, state_js_1.save)();
    return ok({ registered: params.targets.length, target_ids: params.targets.map((t) => t.id), inherited });
});
// ── evo_report_seed ───────────────────────────────────────────────────────
server.tool("evo_report_seed", "Report the seed baseline fitness.", {
    fitness_values: zod_1.z.array(zod_1.z.number()).describe("Objective values of the unmodified seed code."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    state.seed_obj = params.fitness_values;
    state.best_obj_overall = params.fitness_values;
    state.total_evals++;
    for (const target of Object.values(state.targets))
        target.current_best_obj = params.fitness_values;
    (0, state_js_1.save)();
    return ok({ seed_obj: params.fitness_values, objectives: state.config.objectives.map((o) => o.name), total_evals: state.total_evals });
});
// ── evo_next_batch ────────────────────────────────────────────────────────
server.tool("evo_next_batch", "Get the next batch of operations to execute.", {}, async () => {
    const state = (0, state_js_1.getState)();
    const budgetRemaining = state.config.max_fe - state.total_evals;
    if (budgetRemaining <= 0)
        return ok({ done: true, reason: "budget exhausted", batch: [] });
    const plan = (0, selection_js_1.planGeneration)(state.targets, state.config.pop_size, state.config.mutation_rate, state.config.structural_rate, budgetRemaining, state.config.synergy_interval, state.generation);
    const batch = [];
    const varCounter = {};
    for (const item of plan) {
        const tid = item.target_id, op = item.operation;
        for (let c = 0; c < item.count; c++) {
            const key = `${tid}/${op}`;
            const idx = varCounter[key] ?? 0;
            varCounter[key] = idx + 1;
            if (op === models_js_1.Operation.SYNERGY) {
                const branch = `gen-${state.generation}/synergy/${tid}-${idx}`;
                const parts = tid.split("+");
                const parents = parts.filter((p) => p in state.targets && state.targets[p].current_best_branch).map((p) => state.targets[p].current_best_branch);
                batch.push({ branch, operation: op, target_id: tid, parent_branches: parents, target_file: "", target_function: "", target_description: "", target_hint: "", structural_op: "" });
            }
            else {
                const target = state.targets[tid];
                const branch = `gen-${state.generation}/${tid}/${op}-${idx}`;
                const parents = chooseParents(state, tid, op);
                const structuralOp = op === models_js_1.Operation.STRUCTURAL ? randomChoice(STRUCTURAL_OPS) : "";
                batch.push({ branch, operation: op, target_id: tid, parent_branches: parents, target_file: target.file, target_function: target.function, target_description: target.description, target_hint: target.hint, structural_op: structuralOp });
            }
        }
    }
    state.current_batch = batch;
    state.batch_cursor = 0;
    (0, state_js_1.save)();
    return ok({ generation: state.generation, budget_remaining: budgetRemaining, objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })), benchmark_format: state.config.benchmark.output_format, batch_size: batch.length, batch });
});
// ── evo_report_fitness ────────────────────────────────────────────────────
server.tool("evo_report_fitness", "Report the fitness evaluation result for a branch.", {
    branch: zod_1.z.string(), target_id: zod_1.z.string(),
    operation: zod_1.z.enum(["mutate", "crossover", "structural", "synergy"]),
    parent_branches: zod_1.z.array(zod_1.z.string()),
    fitness_values: zod_1.z.array(zod_1.z.number()),
    success: zod_1.z.boolean(),
    code_hash: zod_1.z.string().optional(),
    raw_output: zod_1.z.string().optional(),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const nObj = state.config.objectives.length;
    if (params.success && params.fitness_values.length !== nObj) {
        return ok({ error: `fitness_values has ${params.fitness_values.length} element(s) but ${nObj} objective(s) are configured.` });
    }
    if (params.code_hash && params.code_hash in state.fitness_cache) {
        state.total_evals++;
        (0, state_js_1.save)();
        return ok({ cached: true, fitness_values: state.fitness_cache[params.code_hash], branch: params.branch });
    }
    const ind = {
        branch: params.branch, generation: state.generation, target_id: params.target_id,
        operation: params.operation, parent_branches: params.parent_branches,
        fitness: params.success ? params.fitness_values : null,
        pareto_rank: null, success: params.success,
        code_hash: params.code_hash || null,
        raw_output: params.raw_output ? params.raw_output.slice(0, 500) : null,
        timestamp: Date.now() / 1000,
    };
    state.individuals[params.branch] = ind;
    state.total_evals++;
    if (params.code_hash && params.success)
        state.fitness_cache[params.code_hash] = params.fitness_values;
    if (!(params.target_id in state.active_branches))
        state.active_branches[params.target_id] = [];
    if (params.success) {
        state.active_branches[params.target_id].push(params.branch);
        (0, state_js_1.updateTargetPareto)(state, params.target_id);
        (0, state_js_1.updateGlobalPareto)(state);
    }
    (0, state_js_1.save)();
    return ok({ branch: params.branch, fitness_values: params.success ? params.fitness_values : null, success: params.success, total_evals: state.total_evals, on_pareto_front: state.pareto_front.includes(params.branch) });
});
// ── evo_select_survivors ──────────────────────────────────────────────────
server.tool("evo_select_survivors", "Run NSGA-II selection at end of generation.", {}, async () => ok(evoSelectSurvivorsImpl()));
// ── evo_get_status ────────────────────────────────────────────────────────
server.tool("evo_get_status", "Get current evolution status.", {}, async () => {
    const state = (0, state_js_1.getState)();
    const targetStatus = {};
    for (const [tid, target] of Object.entries(state.targets)) {
        targetStatus[tid] = {
            status: target.status, temperature: Math.round(target.temperature * 100) / 100,
            current_best_obj: target.current_best_obj, current_best_branch: target.current_best_branch,
            pareto_front_size: target.pareto_branches.length, stagnation: target.stagnation_count,
            active_branches: (state.active_branches[tid] ?? []).length,
        };
    }
    const paretoSummary = state.pareto_front.filter((b) => b in state.individuals).map((b) => ({
        branch: b, fitness: state.individuals[b].fitness,
        generation: state.individuals[b].generation, target_id: state.individuals[b].target_id,
    }));
    return ok({
        generation: state.generation, total_evals: state.total_evals,
        budget_remaining: state.config.max_fe - state.total_evals,
        objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })),
        seed_obj: state.seed_obj, best_obj_overall: state.best_obj_overall,
        best_branch_overall: state.best_branch_overall,
        pareto_front_size: state.pareto_front.length, pareto_front: paretoSummary,
        improvement: calcImprovement(state), targets: targetStatus,
    });
});
// ── evo_get_lineage ───────────────────────────────────────────────────────
server.tool("evo_get_lineage", "Trace the full ancestry of a branch.", { branch: zod_1.z.string() }, async (params) => {
    const state = (0, state_js_1.getState)();
    const lineage = [];
    const visited = new Set();
    const queue = [params.branch];
    while (queue.length > 0) {
        const b = queue.shift();
        if (visited.has(b) || !(b in state.individuals))
            continue;
        visited.add(b);
        const ind = state.individuals[b];
        lineage.push({ branch: ind.branch, generation: ind.generation, target_id: ind.target_id, operation: ind.operation, parent_branches: ind.parent_branches, fitness: ind.fitness, pareto_rank: ind.pareto_rank, success: ind.success });
        queue.push(...ind.parent_branches);
    }
    return ok({ branch: params.branch, lineage });
});
// ── evo_freeze_target ─────────────────────────────────────────────────────
server.tool("evo_freeze_target", "Freeze a target — stop evolving it.", { target_id: zod_1.z.string() }, async (params) => {
    const state = (0, state_js_1.getState)();
    if (!(params.target_id in state.targets))
        return ok({ error: `Target '${params.target_id}' not found` });
    state.targets[params.target_id].status = models_js_1.TargetStatus.FROZEN;
    state.targets[params.target_id].temperature = 0;
    (0, state_js_1.save)();
    return ok({ target_id: params.target_id, status: "frozen" });
});
// ── evo_boost_target ──────────────────────────────────────────────────────
server.tool("evo_boost_target", "Boost a target — increase its evolution priority.", { target_id: zod_1.z.string() }, async (params) => {
    const state = (0, state_js_1.getState)();
    if (!(params.target_id in state.targets))
        return ok({ error: `Target '${params.target_id}' not found` });
    const target = state.targets[params.target_id];
    target.status = models_js_1.TargetStatus.ACTIVE;
    target.temperature = Math.min(3.0, target.temperature + 1.0);
    target.stagnation_count = 0;
    (0, state_js_1.save)();
    return ok({ target_id: params.target_id, temperature: target.temperature });
});
// ── evo_record_synergy ────────────────────────────────────────────────────
server.tool("evo_record_synergy", "Record the result of a synergy experiment.", {
    branch: zod_1.z.string(), target_ids: zod_1.z.array(zod_1.z.string()),
    fitness_values: zod_1.z.array(zod_1.z.number()), success: zod_1.z.boolean(),
    individual_fitnesses: zod_1.z.record(zod_1.z.string(), zod_1.z.array(zod_1.z.number())).optional(),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const objectives = state.config.objectives;
    let gain = null;
    if (params.individual_fitnesses && params.success) {
        gain = {};
        for (let i = 0; i < objectives.length; i++) {
            const vals = Object.values(params.individual_fitnesses).map((v) => v[i]).filter((v) => v !== undefined);
            if (vals.length === 0)
                continue;
            const individualBest = objectives[i].direction === models_js_1.Objective.MIN ? Math.min(...vals) : Math.max(...vals);
            const combined = params.fitness_values[i];
            gain[objectives[i].name] = objectives[i].direction === models_js_1.Objective.MIN ? individualBest - combined : combined - individualBest;
        }
    }
    const record = { branch: params.branch, generation: state.generation, target_ids: params.target_ids, fitness_values: params.fitness_values, success: params.success, individual_fitnesses: params.individual_fitnesses, synergy_gain: gain };
    state.synergy_records.push(record);
    (0, state_js_1.save)();
    return ok(record);
});
// ── evo_check_cache ───────────────────────────────────────────────────────
server.tool("evo_check_cache", "Check if a code variant was already evaluated.", { code_hash: zod_1.z.string() }, async (params) => {
    const state = (0, state_js_1.getState)();
    if (params.code_hash in state.fitness_cache)
        return ok({ cached: true, fitness_values: state.fitness_cache[params.code_hash] });
    return ok({ cached: false });
});
// ── evo_step ──────────────────────────────────────────────────────────────
server.tool("evo_step", "Multi-agent evolution loop driver. Called by OrchestratorAgent and WorkerAgents to advance the evolution.", {
    phase: zod_1.z.enum([PHASE_BEGIN, PHASE_CODE, PHASE_POLICY_PASS, PHASE_POLICY_FAIL, PHASE_FITNESS, PHASE_SELECT, PHASE_REFLECT]),
    branch: zod_1.z.string().optional(),
    parent_commit: zod_1.z.string().optional(),
    fitness_values: zod_1.z.array(zod_1.z.number()).optional(),
    success: zod_1.z.boolean().optional(),
    operation: zod_1.z.string().optional(),
    target_id: zod_1.z.string().optional(),
    parent_branches: zod_1.z.array(zod_1.z.string()).optional(),
    code_hash: zod_1.z.string().optional(),
    raw_output: zod_1.z.string().optional(),
    reason: zod_1.z.string().optional(),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const pb = params.parent_branches ?? [];
    if (params.phase === PHASE_BEGIN) {
        return ok(beginGenerationImpl(state));
    }
    if (params.phase === PHASE_CODE) {
        if (!params.branch)
            return ok({ error: "branch is required for phase 'code_ready'" });
        const item = state.current_batch.find((it) => it.branch === params.branch);
        let parent = params.parent_commit || "";
        if (!parent && item && item.parent_branches.length > 0) {
            parent = gitExec(state.config.repo_path, ["rev-parse", item.parent_branches[0]]);
        }
        if (!parent)
            return ok({ error: "Cannot determine parent commit for policy check." });
        const changedFiles = gitExec(state.config.repo_path, ["diff", "--name-only", `${parent}..${params.branch}`]).split("\n").filter(Boolean);
        const diff = gitExec(state.config.repo_path, ["diff", `${parent}..${params.branch}`]).slice(0, 8000);
        return ok({
            action: "check_policy", branch: params.branch, parent_commit: parent,
            target_id: item?.target_id ?? "", target_file: item?.target_file ?? "",
            operation: item?.operation ?? "", parent_branches: item?.parent_branches ?? [],
            changed_files: changedFiles, diff, protected_patterns: state.config.protected_patterns,
        });
    }
    if (params.phase === PHASE_POLICY_PASS) {
        if (!params.branch)
            return ok({ error: "branch is required for phase 'policy_pass'" });
        const item = state.current_batch.find((it) => it.branch === params.branch);
        return ok({
            action: "run_benchmark", branch: params.branch,
            benchmark_cmd: state.config.benchmark.cmd, quick_cmd: state.config.benchmark.quick_cmd,
            benchmark_format: state.config.benchmark.output_format,
            objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })),
            target_id: item?.target_id ?? params.target_id,
            operation: item?.operation ?? params.operation,
            parent_branches: item?.parent_branches ?? pb,
        });
    }
    if (params.phase === PHASE_POLICY_FAIL) {
        if (!params.branch)
            return ok({ error: "branch is required for phase 'policy_fail'" });
        const item = state.current_batch.find((it) => it.branch === params.branch);
        const failReason = params.reason || params.raw_output || "policy violation";
        const ind = {
            branch: params.branch, generation: state.generation,
            target_id: item?.target_id ?? params.target_id ?? "",
            operation: (item?.operation ?? models_js_1.Operation.MUTATE),
            parent_branches: item?.parent_branches ?? pb,
            fitness: null, pareto_rank: null, success: false,
            code_hash: null, raw_output: `policy_violation: ${failReason}`,
            timestamp: Date.now() / 1000,
        };
        state.individuals[params.branch] = ind;
        (0, state_js_1.save)();
        return ok({ action: "worker_done", branch: params.branch, rejected: true, reason: failReason });
    }
    if (params.phase === PHASE_FITNESS) {
        const fv = params.fitness_values ?? [];
        const nObj = state.config.objectives.length;
        const success = params.success ?? true;
        if (success && fv.length !== nObj) {
            return ok({ error: `fitness_values has ${fv.length} element(s) but ${nObj} objective(s) are configured.` });
        }
        if (params.code_hash && params.code_hash in state.fitness_cache) {
            state.total_evals++;
            (0, state_js_1.save)();
            return ok({ action: "worker_done", branch: params.branch, cached: true, fitness_values: state.fitness_cache[params.code_hash], total_evals: state.total_evals });
        }
        const ind = {
            branch: params.branch ?? "", generation: state.generation, target_id: params.target_id ?? "",
            operation: (params.operation || models_js_1.Operation.MUTATE),
            parent_branches: pb, fitness: success ? fv : null,
            pareto_rank: null, success,
            code_hash: params.code_hash || null,
            raw_output: params.raw_output ? params.raw_output.slice(0, 500) : null,
            timestamp: Date.now() / 1000,
        };
        state.individuals[params.branch ?? ""] = ind;
        state.total_evals++;
        if (params.code_hash && success)
            state.fitness_cache[params.code_hash] = fv;
        const tid = params.target_id ?? "";
        if (!(tid in state.active_branches))
            state.active_branches[tid] = [];
        if (success) {
            state.active_branches[tid].push(params.branch ?? "");
            (0, state_js_1.updateTargetPareto)(state, tid);
            (0, state_js_1.updateGlobalPareto)(state);
        }
        (0, state_js_1.save)();
        return ok({ action: "worker_done", branch: params.branch, fitness_values: success ? fv : null, success, on_pareto_front: state.pareto_front.includes(params.branch ?? ""), total_evals: state.total_evals });
    }
    if (params.phase === PHASE_SELECT) {
        return ok({ ...evoSelectSurvivorsImpl(), action: "reflect" });
    }
    if (params.phase === PHASE_REFLECT) {
        const budgetRemaining = state.config.max_fe - state.total_evals;
        if (budgetRemaining <= 0) {
            return ok({ action: PHASE_DONE, reason: "budget exhausted", total_evals: state.total_evals, best_obj: state.best_obj_overall, pareto_front_size: state.pareto_front.length });
        }
        return ok(beginGenerationImpl(state));
    }
    return ok({ error: `Unknown phase: '${params.phase}'.` });
});
// ── evo_revalidate_targets ────────────────────────────────────────────────
server.tool("evo_revalidate_targets", "Check that all registered targets still exist in the repo after a structural op.", {}, async () => {
    const state = (0, state_js_1.getState)();
    const repo = state.config.repo_path;
    const valid = [];
    const missing = [];
    for (const [tid, target] of Object.entries(state.targets)) {
        if (target.status === models_js_1.TargetStatus.FROZEN)
            continue;
        const filePath = (0, node_path_1.join)(repo, target.file);
        if (!(0, node_fs_1.existsSync)(filePath)) {
            missing.push(tid);
            continue;
        }
        const grepResult = gitExec(repo, ["grep", "-n", `def ${target.function}`, "--", target.file]);
        if (!grepResult)
            missing.push(tid);
        else
            valid.push(tid);
    }
    return ok({ valid, missing });
});
// ===========================================================================
// A-layer: Literature tools
// ===========================================================================
// ── lit_ingest ────────────────────────────────────────────────────────────
server.tool("lit_ingest", "Ingest a paper into the local literature vector database.", {
    id: zod_1.z.string().describe("Unique ID (e.g. arXiv ID like '2503.10721')."),
    title: zod_1.z.string(),
    abstract: zod_1.z.string(),
    authors: zod_1.z.array(zod_1.z.string()),
    year: zod_1.z.number(),
    bibtex: zod_1.z.string().optional().describe("Full BibTeX entry. Auto-generated if omitted."),
    source_url: zod_1.z.string().optional(),
}, async (params) => {
    const bibtex = params.bibtex || (0, bibtex_js_1.formatEntry)({
        key: (0, bibtex_js_1.generateKey)(params.authors, params.year, params.title),
        type: "article",
        fields: {
            author: params.authors.join(" and "),
            title: params.title,
            year: String(params.year),
            url: params.source_url ?? "",
        },
    });
    const record = (0, vectordb_js_1.ingestLiterature)({
        id: params.id,
        title: params.title,
        abstract: params.abstract,
        authors: params.authors,
        year: params.year,
        bibtex,
        source_url: params.source_url ?? "",
    });
    return ok({ ingested: true, id: record.id, total_papers: (0, vectordb_js_1.getLiteratureCount)() });
});
// ── lit_search_local ──────────────────────────────────────────────────────
server.tool("lit_search_local", "Search the local literature vector database.", {
    query: zod_1.z.string().describe("Search query — topic, keywords, or research question."),
    top_k: zod_1.z.number().optional().describe("Max results to return (default 5)."),
}, async (params) => {
    const results = (0, vectordb_js_1.searchLiterature)(params.query, params.top_k ?? 5);
    return ok({
        count: results.length,
        total_in_db: (0, vectordb_js_1.getLiteratureCount)(),
        results: results.map((r) => ({
            id: r.record.id,
            title: r.record.title,
            authors: r.record.authors,
            year: r.record.year,
            abstract: r.record.abstract.slice(0, 300),
            bibtex: r.record.bibtex,
            score: Math.round(r.score * 1000) / 1000,
        })),
    });
});
// ── code_qa ───────────────────────────────────────────────────────────────
server.tool("code_qa", "Answer a question about the evolved code using lineage and diff context.", {
    question: zod_1.z.string().describe("The question about the code."),
    branch: zod_1.z.string().optional().describe("Branch to focus on. Defaults to best branch."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const branch = params.branch ?? state.best_branch_overall ?? state.seed_branch;
    const repo = state.config.repo_path;
    // Gather context: lineage + diff
    const lineage = [];
    const visited = new Set();
    const queue = [branch];
    while (queue.length > 0) {
        const b = queue.shift();
        if (visited.has(b) || !(b in state.individuals))
            continue;
        visited.add(b);
        const ind = state.individuals[b];
        lineage.push({
            branch: ind.branch, generation: ind.generation, target_id: ind.target_id,
            operation: ind.operation, fitness: ind.fitness, success: ind.success,
        });
        queue.push(...ind.parent_branches);
    }
    const diff = gitExec(repo, ["diff", `${state.seed_branch}..${branch}`, "--stat"]);
    const fullDiff = gitExec(repo, ["diff", `${state.seed_branch}..${branch}`]).slice(0, 6000);
    return ok({
        question: params.question,
        branch,
        seed_branch: state.seed_branch,
        lineage,
        diff_stat: diff,
        diff_preview: fullDiff,
        targets: Object.keys(state.targets),
        best_obj: state.best_obj_overall,
        seed_obj: state.seed_obj,
        note: "Use the lineage and diff context above to answer the question. For deeper analysis, read specific files with the read tool.",
    });
});
// ── bib_append ────────────────────────────────────────────────────────────
server.tool("bib_append", "Append BibTeX entries to the project references file, deduplicating automatically.", {
    bibtex: zod_1.z.string().describe("One or more BibTeX entries as a string."),
    bib_path: zod_1.z.string().optional().describe("Path to .bib file. Defaults to research/refs/references.bib relative to repo."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const bibPath = params.bib_path ?? (0, node_path_1.join)(state.config.repo_path, "research", "refs", "references.bib");
    const entries = (0, bibtex_js_1.parseBib)(params.bibtex);
    if (entries.length === 0)
        return ok({ error: "No valid BibTeX entries found in input." });
    const added = (0, bibtex_js_1.appendBib)(bibPath, entries);
    return ok({ added, total_entries_parsed: entries.length, bib_path: bibPath });
});
// ===========================================================================
// B-layer: Visualization tools
// ===========================================================================
// ── viz_generate ──────────────────────────────────────────────────────────
server.tool("viz_generate", "Generate an analysis chart driven by an expected conclusion. Returns a Python script for chart generation.", {
    expectation: zod_1.z.string().describe("Expected conclusion, e.g. 'Our loss curve is more stable than baseline'."),
    data_description: zod_1.z.string().describe("Description of available data and where to find it."),
    chart_type: zod_1.z.string().optional().describe("Preferred chart type: line, bar, heatmap, scatter. Auto-selected if omitted."),
    output_dir: zod_1.z.string().optional().describe("Directory for output figures."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const outputDir = params.output_dir ?? (0, node_path_1.join)(state.config.repo_path, "research", "figures");
    return ok({
        action: "generate_chart",
        expectation: params.expectation,
        data_description: params.data_description,
        chart_type: params.chart_type ?? "auto",
        output_dir: outputDir,
        instructions: [
            "1. Write a Python script using matplotlib/seaborn to generate the chart.",
            "2. Load data as described in data_description.",
            "3. The chart should visually support or refute the expectation.",
            `4. Save to ${outputDir}/<descriptive_name>.png at 300 DPI.`,
            "5. Return the chart path and whether data supports the expectation.",
        ],
    });
});
// ── viz_highlight ─────────────────────────────────────────────────────────
server.tool("viz_highlight", "Analyze a chart against expectations and identify highlight data points.", {
    chart_path: zod_1.z.string().describe("Path to the generated chart image."),
    expectation: zod_1.z.string().describe("The expected conclusion to verify."),
    data_summary: zod_1.z.string().describe("Numerical summary of the charted data."),
}, async (params) => {
    return ok({
        action: "highlight_analysis",
        chart_path: params.chart_path,
        expectation: params.expectation,
        data_summary: params.data_summary,
        instructions: [
            "1. Compare the data summary against the expectation quantitatively.",
            "2. Identify specific data points/regions that best support the conclusion.",
            "3. Note any discrepancies between expectation and actual data.",
            "4. Return: { consistent: bool, highlights: [...], discrepancies: [...] }",
        ],
    });
});
// ── viz_polish ────────────────────────────────────────────────────────────
server.tool("viz_polish", "Polish a chart to publication quality by consulting literature for style standards.", {
    chart_path: zod_1.z.string().describe("Path to the chart to polish."),
    target_venue: zod_1.z.string().optional().describe("Target venue (e.g. 'NeurIPS', 'CVPR'). Used to look up style guidelines."),
}, async (params) => {
    return ok({
        action: "polish_chart",
        chart_path: params.chart_path,
        target_venue: params.target_venue ?? "general",
        instructions: [
            "1. Call /ask-lit to find figure style guidelines for the target venue.",
            "2. Adjust: font sizes (typically 8-10pt), color scheme (colorblind-safe), line widths, legends.",
            "3. Ensure resolution >= 300 DPI, appropriate for single/double column.",
            "4. Save polished version alongside original.",
        ],
    });
});
// ===========================================================================
// B-layer: Benchmark supplement tools
// ===========================================================================
// ── bench_adapt ───────────────────────────────────────────────────────────
server.tool("bench_adapt", "Adapt code to run on a new dataset or benchmark configuration.", {
    dataset_name: zod_1.z.string().describe("Target dataset name (e.g. 'CIFAR-100-LT', 'ImageNet-LT')."),
    requirement: zod_1.z.string().describe("What needs to be adapted and why."),
    code_path: zod_1.z.string().optional().describe("Path to the code to adapt. Defaults to repo root."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const codePath = params.code_path ?? state.config.repo_path;
    return ok({
        action: "adapt_code",
        dataset_name: params.dataset_name,
        requirement: params.requirement,
        code_path: codePath,
        instructions: [
            "1. Call /ask-lit to confirm standard evaluation protocol for this dataset.",
            "2. Use code_qa to analyze existing data loading interfaces.",
            "3. Write/modify dataloader, preprocessing, and evaluation scripts.",
            "4. Ensure the adapted code can be run with bench_run.",
            "5. Return the list of modified/created files.",
        ],
    });
});
// ── bench_run ─────────────────────────────────────────────────────────────
server.tool("bench_run", "Run a benchmark in an isolated git worktree and collect results.", {
    branch: zod_1.z.string().describe("Branch to evaluate."),
    benchmark_cmd: zod_1.z.string().describe("Command to run the benchmark."),
    worktree_path: zod_1.z.string().optional().describe("Worktree path. Auto-created if omitted."),
}, async (params) => {
    const state = (0, state_js_1.getState)();
    const repo = state.config.repo_path;
    const wtPath = params.worktree_path ?? (0, node_path_1.join)(repo, ".worktrees", `bench-${Date.now().toString(36)}`);
    return ok({
        action: "run_benchmark",
        branch: params.branch,
        benchmark_cmd: params.benchmark_cmd,
        repo_path: repo,
        worktree_path: wtPath,
        instructions: [
            `1. Create worktree: git -C ${repo} worktree add ${wtPath} ${params.branch}`,
            `2. Run benchmark: cd ${wtPath} && ${params.benchmark_cmd}`,
            "3. Parse output according to benchmark_format in evolution config.",
            `4. Clean up: git -C ${repo} worktree remove ${wtPath} --force`,
            "5. Return parsed results as { metrics: { name: value, ... }, raw_output: '...' }",
        ],
    });
});
// ── bench_validate ────────────────────────────────────────────────────────
server.tool("bench_validate", "Validate benchmark results against known SOTA values from literature.", {
    dataset_name: zod_1.z.string().describe("Dataset the benchmark was run on."),
    metrics: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).describe("Metric name → value map."),
    method_name: zod_1.z.string().optional().describe("Name of the method being evaluated."),
}, async (params) => {
    return ok({
        action: "validate_results",
        dataset_name: params.dataset_name,
        metrics: params.metrics,
        method_name: params.method_name ?? "ours",
        instructions: [
            `1. Call /ask-lit to find published SOTA values for ${params.dataset_name}.`,
            "2. Compare each metric against known SOTA.",
            "3. Flag results that are suspiciously high (>5% above SOTA) or low.",
            "4. Check if additional standard benchmarks should be run.",
            "5. Return: { reasonable: bool, comparisons: [...], suggestions: [...] }",
        ],
    });
});
// ===========================================================================
// C-layer: Research derivation forest tools
// ===========================================================================
// ── research_init_forest ──────────────────────────────────────────────────
server.tool("research_init_forest", "Initialize a derivation forest from evolution results.", {
    forest_id: zod_1.z.string().describe("Unique ID for this research forest."),
    evo_summary: zod_1.z.string().optional().describe("Summary of evolution results. Auto-generated from evo_get_status if omitted."),
}, async (params) => {
    let summary = params.evo_summary ?? "";
    if (!summary) {
        try {
            const state = (0, state_js_1.getState)();
            summary = `Evolution: gen=${state.generation}, evals=${state.total_evals}, best=${JSON.stringify(state.best_obj_overall)}, targets=${Object.keys(state.targets).join(",")}`;
        }
        catch {
            summary = "No evolution state available.";
        }
    }
    const forest = (0, research_state_js_1.initForest)(params.forest_id, summary);
    return ok({ forest_id: forest.id, status: forest.status, evo_summary: summary });
});
// ── research_add_node ─────────────────────────────────────────────────────
server.tool("research_add_node", "Add a node to the derivation forest.", {
    forest_id: zod_1.z.string(),
    type: zod_1.z.enum(["change", "hypothesis", "evidence", "question"]),
    content: zod_1.z.string().describe("Node content — what this node represents."),
    parent_ids: zod_1.z.array(zod_1.z.string()).optional(),
    source_branches: zod_1.z.array(zod_1.z.string()).optional().describe("Git branches related to this node."),
    literature_refs: zod_1.z.array(zod_1.z.string()).optional().describe("BibTeX keys."),
    experiment_ids: zod_1.z.array(zod_1.z.string()).optional().describe("B-layer experiment IDs."),
}, async (params) => {
    const node = (0, research_state_js_1.addNode)(params.forest_id, params.type, params.content, {
        parent_ids: params.parent_ids,
        source_branches: params.source_branches,
        literature_refs: params.literature_refs,
        experiment_ids: params.experiment_ids,
    });
    if (!node)
        return ok({ error: `Forest '${params.forest_id}' not found.` });
    return ok({ node_id: node.id, type: node.type, depth: node.depth, parent_ids: node.parent_ids });
});
// ── research_update_node ──────────────────────────────────────────────────
server.tool("research_update_node", "Update an existing node in the derivation forest.", {
    forest_id: zod_1.z.string(),
    node_id: zod_1.z.string(),
    content: zod_1.z.string().optional(),
    status: zod_1.z.enum(["active", "pruned", "converged"]).optional(),
    literature_refs: zod_1.z.array(zod_1.z.string()).optional(),
    experiment_ids: zod_1.z.array(zod_1.z.string()).optional(),
}, async (params) => {
    const node = (0, research_state_js_1.updateNode)(params.forest_id, params.node_id, {
        content: params.content,
        status: params.status,
        literature_refs: params.literature_refs,
        experiment_ids: params.experiment_ids,
    });
    if (!node)
        return ok({ error: `Node '${params.node_id}' not found in forest '${params.forest_id}'.` });
    return ok({ node_id: node.id, status: node.status, updated_at: node.updated_at });
});
// ── research_merge_nodes ──────────────────────────────────────────────────
server.tool("research_merge_nodes", "Merge multiple derivation nodes into one (when they represent the same concept).", {
    forest_id: zod_1.z.string(),
    node_ids: zod_1.z.array(zod_1.z.string()).describe("IDs of nodes to merge."),
    merged_content: zod_1.z.string().describe("Content for the merged node."),
}, async (params) => {
    const node = (0, research_state_js_1.mergeNodes)(params.forest_id, params.node_ids, params.merged_content);
    if (!node)
        return ok({ error: "Merge failed — forest or nodes not found." });
    return ok({ merged_node_id: node.id, depth: node.depth, original_count: params.node_ids.length });
});
// ── research_check_convergence ────────────────────────────────────────────
server.tool("research_check_convergence", "Check if derivation branches converge to a shared deep motivation.", {
    forest_id: zod_1.z.string(),
}, async (params) => {
    const result = (0, research_state_js_1.checkConvergence)(params.forest_id);
    const summary = (0, research_state_js_1.getForestSummary)(params.forest_id);
    return ok({ ...result, forest_summary: summary });
});
// ── research_add_convergence_point ────────────────────────────────────────
server.tool("research_add_convergence_point", "Register a convergence point — the deep motivation Q discovered from branch convergence.", {
    forest_id: zod_1.z.string(),
    question: zod_1.z.string().describe("The deep motivation Q — a clear, testable statement."),
    contributing_node_ids: zod_1.z.array(zod_1.z.string()).describe("Node IDs that converge to this point."),
}, async (params) => {
    const point = (0, research_state_js_1.addConvergencePoint)(params.forest_id, params.question, params.contributing_node_ids);
    if (!point)
        return ok({ error: `Forest '${params.forest_id}' not found.` });
    return ok({ point_id: point.id, question: point.question, status: point.verification_status });
});
// ── research_verify_convergence_point ─────────────────────────────────────
server.tool("research_verify_convergence_point", "Verify or reject a convergence point based on literature and experimental evidence.", {
    forest_id: zod_1.z.string(),
    point_id: zod_1.z.string(),
    verified: zod_1.z.boolean().describe("true = verified, false = rejected."),
    evidence_ids: zod_1.z.array(zod_1.z.string()).optional().describe("Experiment or evidence node IDs supporting the decision."),
}, async (params) => {
    const point = (0, research_state_js_1.verifyConvergencePoint)(params.forest_id, params.point_id, params.verified, params.evidence_ids ?? []);
    if (!point)
        return ok({ error: "Convergence point not found." });
    return ok({ point_id: point.id, verification_status: point.verification_status });
});
// ── research_record_contribution ──────────────────────────────────────────
server.tool("research_record_contribution", "Grade a contribution as primary (converged) or auxiliary (non-converged).", {
    forest_id: zod_1.z.string(),
    convergence_point_id: zod_1.z.string(),
    level: zod_1.z.enum(["primary", "auxiliary"]),
    description: zod_1.z.string().describe("Human-readable description of this contribution."),
}, async (params) => {
    const success = (0, research_state_js_1.recordContribution)(params.forest_id, params.convergence_point_id, params.level, params.description);
    if (!success)
        return ok({ error: "Failed to record contribution." });
    return ok({ recorded: true, level: params.level });
});
// ── research_get_forest ───────────────────────────────────────────────────
server.tool("research_get_forest", "Get the full derivation forest state and summary.", {
    forest_id: zod_1.z.string(),
    include_nodes: zod_1.z.boolean().optional().describe("Include full node details (default true)."),
}, async (params) => {
    const forest = (0, research_state_js_1.getForest)(params.forest_id);
    if (!forest)
        return ok({ error: `Forest '${params.forest_id}' not found.` });
    const summary = (0, research_state_js_1.getForestSummary)(params.forest_id);
    if (params.include_nodes === false) {
        return ok({ summary });
    }
    return ok({ summary, forest });
});
// ── research_iterate ──────────────────────────────────────────────────────
server.tool("research_iterate", "Increment the forest iteration counter. Returns whether to continue or stop.", {
    forest_id: zod_1.z.string(),
}, async (params) => {
    const count = (0, research_state_js_1.incrementIteration)(params.forest_id);
    if (count < 0)
        return ok({ error: `Forest '${params.forest_id}' not found.` });
    const forest = (0, research_state_js_1.getForest)(params.forest_id);
    const maxIter = forest?.max_iterations ?? 20;
    const shouldContinue = count < maxIter && forest?.status !== "done";
    if (!shouldContinue && forest?.status !== "done") {
        (0, research_state_js_1.markForestDone)(params.forest_id);
    }
    return ok({ iteration: count, max_iterations: maxIter, continue: shouldContinue, status: forest?.status });
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("MCP server failed to start:", err);
    process.exit(1);
});
