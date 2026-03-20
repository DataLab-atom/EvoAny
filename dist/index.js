"use strict";
/**
 * Evo-anything — Native OpenClaw plugin entry point.
 *
 * Registers all agent tools for the evolutionary algorithm engine.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
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
// Helpers
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
    // CROSSOVER — need two distinct parents.
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
// Core tool implementations
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
// Plugin entry point
// ---------------------------------------------------------------------------
function default_1(api) {
    // ── evo_init ───────────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_init",
        description: "Initialize a new evolution run.",
        parameters: {
            type: "object",
            properties: {
                repo_path: { type: "string", description: "Path to the target git repository." },
                benchmark_cmd: { type: "string", description: "Shell command that evaluates a code variant." },
                objectives: {
                    type: "array", items: { type: "object", properties: { name: { type: "string" }, direction: { type: "string", enum: ["min", "max"] } }, required: ["name", "direction"] },
                    description: 'List of objectives. Defaults to [{"name":"score","direction":"min"}].',
                },
                benchmark_format: { type: "string", enum: ["numbers", "json"], default: "numbers" },
                max_fe: { type: "number", default: 500 },
                pop_size: { type: "number", default: 8 },
                mutation_rate: { type: "number", default: 0.5 },
                structural_rate: { type: "number", default: 0.2 },
                synergy_interval: { type: "number", default: 3 },
                top_k_survive: { type: "number", default: 5 },
                quick_cmd: { type: "string", default: "" },
                directions: { type: "array", items: { type: "string" }, description: "Domain knowledge hints." },
            },
            required: ["repo_path", "benchmark_cmd"],
        },
        async execute(_id, params) {
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
            const result = {
                status: "initialized", repo_path: config.repo_path,
                objectives: objSpecs.map((o) => ({ name: o.name, direction: o.direction })),
                benchmark_format: config.benchmark.output_format,
                max_fe: config.max_fe, pop_size: config.pop_size,
                structural_rate: config.structural_rate,
                directions_loaded: config.directions.length,
            };
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
    });
    // ── evo_register_targets ───────────────────────────────────────────────
    api.registerTool({
        name: "evo_register_targets",
        description: "Register optimization targets identified by code analysis.",
        parameters: {
            type: "object",
            properties: {
                targets: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string" }, file: { type: "string" }, function: { type: "string" },
                            description: { type: "string" }, hint: { type: "string" },
                            impact: { type: "string" }, derived_from: { type: "array", items: { type: "string" } },
                        },
                        required: ["id", "file", "function"],
                    },
                },
            },
            required: ["targets"],
        },
        async execute(_id, params) {
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
            return { content: [{ type: "text", text: JSON.stringify({ registered: params.targets.length, target_ids: params.targets.map((t) => t.id), inherited }) }] };
        },
    });
    // ── evo_report_seed ────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_report_seed",
        description: "Report the seed baseline fitness.",
        parameters: {
            type: "object",
            properties: { fitness_values: { type: "array", items: { type: "number" }, description: "Objective values of the unmodified seed code." } },
            required: ["fitness_values"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            state.seed_obj = params.fitness_values;
            state.best_obj_overall = params.fitness_values;
            state.total_evals++;
            for (const target of Object.values(state.targets))
                target.current_best_obj = params.fitness_values;
            (0, state_js_1.save)();
            return { content: [{ type: "text", text: JSON.stringify({ seed_obj: params.fitness_values, objectives: state.config.objectives.map((o) => o.name), total_evals: state.total_evals }) }] };
        },
    });
    // ── evo_next_batch ─────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_next_batch",
        description: "Get the next batch of operations to execute.",
        parameters: { type: "object", properties: {} },
        async execute() {
            const state = (0, state_js_1.getState)();
            const budgetRemaining = state.config.max_fe - state.total_evals;
            if (budgetRemaining <= 0)
                return { content: [{ type: "text", text: JSON.stringify({ done: true, reason: "budget exhausted", batch: [] }) }] };
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
            return { content: [{ type: "text", text: JSON.stringify({ generation: state.generation, budget_remaining: budgetRemaining, objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })), benchmark_format: state.config.benchmark.output_format, batch_size: batch.length, batch }) }] };
        },
    });
    // ── evo_report_fitness ─────────────────────────────────────────────────
    api.registerTool({
        name: "evo_report_fitness",
        description: "Report the fitness evaluation result for a branch.",
        parameters: {
            type: "object",
            properties: {
                branch: { type: "string" }, target_id: { type: "string" },
                operation: { type: "string", enum: ["mutate", "crossover", "structural", "synergy"] },
                parent_branches: { type: "array", items: { type: "string" } },
                fitness_values: { type: "array", items: { type: "number" } },
                success: { type: "boolean" },
                code_hash: { type: "string", default: "" },
                raw_output: { type: "string", default: "" },
            },
            required: ["branch", "target_id", "operation", "parent_branches", "fitness_values", "success"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const nObj = state.config.objectives.length;
            if (params.success && params.fitness_values.length !== nObj) {
                return { content: [{ type: "text", text: JSON.stringify({ error: `fitness_values has ${params.fitness_values.length} element(s) but ${nObj} objective(s) are configured. Pass one value per objective.` }) }] };
            }
            if (params.code_hash && params.code_hash in state.fitness_cache) {
                state.total_evals++;
                (0, state_js_1.save)();
                return { content: [{ type: "text", text: JSON.stringify({ cached: true, fitness_values: state.fitness_cache[params.code_hash], branch: params.branch }) }] };
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
            return { content: [{ type: "text", text: JSON.stringify({ branch: params.branch, fitness_values: params.success ? params.fitness_values : null, success: params.success, total_evals: state.total_evals, on_pareto_front: state.pareto_front.includes(params.branch) }) }] };
        },
    });
    // ── evo_select_survivors ───────────────────────────────────────────────
    api.registerTool({
        name: "evo_select_survivors",
        description: "Run NSGA-II selection at end of generation.",
        parameters: { type: "object", properties: {} },
        async execute() {
            const result = evoSelectSurvivorsImpl();
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        },
    });
    // ── evo_get_status ─────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_get_status",
        description: "Get current evolution status.",
        parameters: { type: "object", properties: {} },
        async execute() {
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
            return { content: [{ type: "text", text: JSON.stringify({
                            generation: state.generation, total_evals: state.total_evals,
                            budget_remaining: state.config.max_fe - state.total_evals,
                            objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })),
                            seed_obj: state.seed_obj, best_obj_overall: state.best_obj_overall,
                            best_branch_overall: state.best_branch_overall,
                            pareto_front_size: state.pareto_front.length, pareto_front: paretoSummary,
                            improvement: calcImprovement(state), targets: targetStatus,
                        }) }] };
        },
    });
    // ── evo_get_lineage ────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_get_lineage",
        description: "Trace the full ancestry of a branch.",
        parameters: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"] },
        async execute(_id, params) {
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
            return { content: [{ type: "text", text: JSON.stringify({ branch: params.branch, lineage }) }] };
        },
    });
    // ── evo_freeze_target ──────────────────────────────────────────────────
    api.registerTool({
        name: "evo_freeze_target",
        description: "Freeze a target — stop evolving it.",
        parameters: { type: "object", properties: { target_id: { type: "string" } }, required: ["target_id"] },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            if (!(params.target_id in state.targets))
                return { content: [{ type: "text", text: JSON.stringify({ error: `Target '${params.target_id}' not found` }) }] };
            state.targets[params.target_id].status = models_js_1.TargetStatus.FROZEN;
            state.targets[params.target_id].temperature = 0;
            (0, state_js_1.save)();
            return { content: [{ type: "text", text: JSON.stringify({ target_id: params.target_id, status: "frozen" }) }] };
        },
    });
    // ── evo_boost_target ───────────────────────────────────────────────────
    api.registerTool({
        name: "evo_boost_target",
        description: "Boost a target — increase its evolution priority.",
        parameters: { type: "object", properties: { target_id: { type: "string" } }, required: ["target_id"] },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            if (!(params.target_id in state.targets))
                return { content: [{ type: "text", text: JSON.stringify({ error: `Target '${params.target_id}' not found` }) }] };
            const target = state.targets[params.target_id];
            target.status = models_js_1.TargetStatus.ACTIVE;
            target.temperature = Math.min(3.0, target.temperature + 1.0);
            target.stagnation_count = 0;
            (0, state_js_1.save)();
            return { content: [{ type: "text", text: JSON.stringify({ target_id: params.target_id, temperature: target.temperature }) }] };
        },
    });
    // ── evo_record_synergy ─────────────────────────────────────────────────
    api.registerTool({
        name: "evo_record_synergy",
        description: "Record the result of a synergy experiment.",
        parameters: {
            type: "object",
            properties: {
                branch: { type: "string" }, target_ids: { type: "array", items: { type: "string" } },
                fitness_values: { type: "array", items: { type: "number" } }, success: { type: "boolean" },
                individual_fitnesses: { type: "object", additionalProperties: { type: "array", items: { type: "number" } } },
            },
            required: ["branch", "target_ids", "fitness_values", "success"],
        },
        async execute(_id, params) {
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
            return { content: [{ type: "text", text: JSON.stringify(record) }] };
        },
    });
    // ── evo_check_cache ────────────────────────────────────────────────────
    api.registerTool({
        name: "evo_check_cache",
        description: "Check if a code variant was already evaluated.",
        parameters: { type: "object", properties: { code_hash: { type: "string" } }, required: ["code_hash"] },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            if (params.code_hash in state.fitness_cache)
                return { content: [{ type: "text", text: JSON.stringify({ cached: true, fitness_values: state.fitness_cache[params.code_hash] }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ cached: false }) }] };
        },
    });
    // ── evo_step — stateless loop driver ───────────────────────────────────
    api.registerTool({
        name: "evo_step",
        description: "Multi-agent evolution loop driver. Called by OrchestratorAgent and WorkerAgents to advance the evolution.",
        parameters: {
            type: "object",
            properties: {
                phase: { type: "string", enum: [PHASE_BEGIN, PHASE_CODE, PHASE_POLICY_PASS, PHASE_POLICY_FAIL, PHASE_FITNESS, PHASE_SELECT, PHASE_REFLECT] },
                branch: { type: "string", default: "" }, parent_commit: { type: "string", default: "" },
                fitness_values: { type: "array", items: { type: "number" } },
                success: { type: "boolean", default: true },
                operation: { type: "string", default: "" }, target_id: { type: "string", default: "" },
                parent_branches: { type: "array", items: { type: "string" } },
                code_hash: { type: "string", default: "" }, raw_output: { type: "string", default: "" },
                reason: { type: "string", default: "" },
            },
            required: ["phase"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const pb = params.parent_branches ?? [];
            // begin_generation
            if (params.phase === PHASE_BEGIN) {
                const result = beginGenerationImpl(state);
                return { content: [{ type: "text", text: JSON.stringify(result) }] };
            }
            // code_ready
            if (params.phase === PHASE_CODE) {
                if (!params.branch)
                    return { content: [{ type: "text", text: JSON.stringify({ error: "branch is required for phase 'code_ready'" }) }] };
                const item = state.current_batch.find((it) => it.branch === params.branch);
                let parent = params.parent_commit || "";
                if (!parent && item && item.parent_branches.length > 0) {
                    parent = gitExec(state.config.repo_path, ["rev-parse", item.parent_branches[0]]);
                }
                if (!parent)
                    return { content: [{ type: "text", text: JSON.stringify({ error: "Cannot determine parent commit for policy check. Pass parent_commit= explicitly." }) }] };
                const changedFiles = gitExec(state.config.repo_path, ["diff", "--name-only", `${parent}..${params.branch}`]).split("\n").filter(Boolean);
                const diff = gitExec(state.config.repo_path, ["diff", `${parent}..${params.branch}`]).slice(0, 8000);
                return { content: [{ type: "text", text: JSON.stringify({
                                action: "check_policy", branch: params.branch, parent_commit: parent,
                                target_id: item?.target_id ?? "", target_file: item?.target_file ?? "",
                                operation: item?.operation ?? "", parent_branches: item?.parent_branches ?? [],
                                changed_files: changedFiles, diff, protected_patterns: state.config.protected_patterns,
                            }) }] };
            }
            // policy_pass
            if (params.phase === PHASE_POLICY_PASS) {
                if (!params.branch)
                    return { content: [{ type: "text", text: JSON.stringify({ error: "branch is required for phase 'policy_pass'" }) }] };
                const item = state.current_batch.find((it) => it.branch === params.branch);
                return { content: [{ type: "text", text: JSON.stringify({
                                action: "run_benchmark", branch: params.branch,
                                benchmark_cmd: state.config.benchmark.cmd, quick_cmd: state.config.benchmark.quick_cmd,
                                benchmark_format: state.config.benchmark.output_format,
                                objectives: state.config.objectives.map((o) => ({ name: o.name, direction: o.direction })),
                                target_id: item?.target_id ?? params.target_id,
                                operation: item?.operation ?? params.operation,
                                parent_branches: item?.parent_branches ?? pb,
                            }) }] };
            }
            // policy_fail
            if (params.phase === PHASE_POLICY_FAIL) {
                if (!params.branch)
                    return { content: [{ type: "text", text: JSON.stringify({ error: "branch is required for phase 'policy_fail'" }) }] };
                const item = state.current_batch.find((it) => it.branch === params.branch);
                const failReason = params.reason || params.raw_output || "policy violation";
                const ind = {
                    branch: params.branch, generation: state.generation,
                    target_id: item?.target_id ?? params.target_id,
                    operation: item?.operation ?? models_js_1.Operation.MUTATE,
                    parent_branches: item?.parent_branches ?? pb,
                    fitness: null, pareto_rank: null, success: false,
                    code_hash: null, raw_output: `policy_violation: ${failReason}`,
                    timestamp: Date.now() / 1000,
                };
                state.individuals[params.branch] = ind;
                (0, state_js_1.save)();
                return { content: [{ type: "text", text: JSON.stringify({ action: "worker_done", branch: params.branch, rejected: true, reason: failReason }) }] };
            }
            // fitness_ready
            if (params.phase === PHASE_FITNESS) {
                const fv = params.fitness_values ?? [];
                const nObj = state.config.objectives.length;
                if (params.success && fv.length !== nObj) {
                    return { content: [{ type: "text", text: JSON.stringify({ error: `fitness_values has ${fv.length} element(s) but ${nObj} objective(s) are configured. Pass one value per objective.` }) }] };
                }
                if (params.code_hash && params.code_hash in state.fitness_cache) {
                    state.total_evals++;
                    (0, state_js_1.save)();
                    return { content: [{ type: "text", text: JSON.stringify({ action: "worker_done", branch: params.branch, cached: true, fitness_values: state.fitness_cache[params.code_hash], total_evals: state.total_evals }) }] };
                }
                const ind = {
                    branch: params.branch, generation: state.generation, target_id: params.target_id,
                    operation: (params.operation || models_js_1.Operation.MUTATE),
                    parent_branches: pb, fitness: params.success ? fv : null,
                    pareto_rank: null, success: params.success,
                    code_hash: params.code_hash || null,
                    raw_output: params.raw_output ? params.raw_output.slice(0, 500) : null,
                    timestamp: Date.now() / 1000,
                };
                state.individuals[params.branch] = ind;
                state.total_evals++;
                if (params.code_hash && params.success)
                    state.fitness_cache[params.code_hash] = fv;
                if (!(params.target_id in state.active_branches))
                    state.active_branches[params.target_id] = [];
                if (params.success) {
                    state.active_branches[params.target_id].push(params.branch);
                    (0, state_js_1.updateTargetPareto)(state, params.target_id);
                    (0, state_js_1.updateGlobalPareto)(state);
                }
                (0, state_js_1.save)();
                return { content: [{ type: "text", text: JSON.stringify({ action: "worker_done", branch: params.branch, fitness_values: params.success ? fv : null, success: params.success, on_pareto_front: state.pareto_front.includes(params.branch), total_evals: state.total_evals }) }] };
            }
            // select
            if (params.phase === PHASE_SELECT) {
                const result = evoSelectSurvivorsImpl();
                return { content: [{ type: "text", text: JSON.stringify({ ...result, action: "reflect" }) }] };
            }
            // reflect_done
            if (params.phase === PHASE_REFLECT) {
                const budgetRemaining = state.config.max_fe - state.total_evals;
                if (budgetRemaining <= 0) {
                    return { content: [{ type: "text", text: JSON.stringify({ action: PHASE_DONE, reason: "budget exhausted", total_evals: state.total_evals, best_obj: state.best_obj_overall, pareto_front_size: state.pareto_front.length }) }] };
                }
                const result = beginGenerationImpl(state);
                return { content: [{ type: "text", text: JSON.stringify(result) }] };
            }
            return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown phase: '${params.phase}'.` }) }] };
        },
    });
    // ── evo_revalidate_targets ─────────────────────────────────────────────
    api.registerTool({
        name: "evo_revalidate_targets",
        description: "Check that all registered targets still exist in the repo after a structural op.",
        parameters: { type: "object", properties: {} },
        async execute() {
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
            return { content: [{ type: "text", text: JSON.stringify({ valid, missing }) }] };
        },
    });
    // =======================================================================
    // A-layer: Literature tools
    // =======================================================================
    // ── lit_ingest ──────────────────────────────────────────────────────────
    api.registerTool({
        name: "lit_ingest",
        description: "Ingest a paper into the local literature vector database.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "Unique ID (e.g. arXiv ID)." },
                title: { type: "string" },
                abstract: { type: "string" },
                authors: { type: "array", items: { type: "string" } },
                year: { type: "number" },
                bibtex: { type: "string", description: "Full BibTeX entry. Auto-generated if omitted." },
                source_url: { type: "string" },
            },
            required: ["id", "title", "abstract", "authors", "year"],
        },
        async execute(_id, params) {
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
                id: params.id, title: params.title, abstract: params.abstract,
                authors: params.authors, year: params.year, bibtex,
                source_url: params.source_url ?? "",
            });
            return { content: [{ type: "text", text: JSON.stringify({ ingested: true, id: record.id, total_papers: (0, vectordb_js_1.getLiteratureCount)() }) }] };
        },
    });
    // ── lit_search_local ────────────────────────────────────────────────────
    api.registerTool({
        name: "lit_search_local",
        description: "Search the local literature vector database.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query." },
                top_k: { type: "number", description: "Max results (default 5)." },
            },
            required: ["query"],
        },
        async execute(_id, params) {
            const results = (0, vectordb_js_1.searchLiterature)(params.query, params.top_k ?? 5);
            return { content: [{ type: "text", text: JSON.stringify({
                            count: results.length, total_in_db: (0, vectordb_js_1.getLiteratureCount)(),
                            results: results.map((r) => ({
                                id: r.record.id, title: r.record.title, authors: r.record.authors,
                                year: r.record.year, abstract: r.record.abstract.slice(0, 300),
                                bibtex: r.record.bibtex, score: Math.round(r.score * 1000) / 1000,
                            })),
                        }) }] };
        },
    });
    // ── code_qa ─────────────────────────────────────────────────────────────
    api.registerTool({
        name: "code_qa",
        description: "Answer a question about the evolved code using lineage and diff context.",
        parameters: {
            type: "object",
            properties: {
                question: { type: "string", description: "The question about the code." },
                branch: { type: "string", description: "Branch to focus on. Defaults to best branch." },
            },
            required: ["question"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const branch = params.branch ?? state.best_branch_overall ?? state.seed_branch;
            const repo = state.config.repo_path;
            const lineage = [];
            const visited = new Set();
            const queue = [branch];
            while (queue.length > 0) {
                const b = queue.shift();
                if (visited.has(b) || !(b in state.individuals))
                    continue;
                visited.add(b);
                const ind = state.individuals[b];
                lineage.push({ branch: ind.branch, generation: ind.generation, target_id: ind.target_id, operation: ind.operation, fitness: ind.fitness, success: ind.success });
                queue.push(...ind.parent_branches);
            }
            const diff = gitExec(repo, ["diff", `${state.seed_branch}..${branch}`, "--stat"]);
            const fullDiff = gitExec(repo, ["diff", `${state.seed_branch}..${branch}`]).slice(0, 6000);
            return { content: [{ type: "text", text: JSON.stringify({
                            question: params.question, branch, seed_branch: state.seed_branch,
                            lineage, diff_stat: diff, diff_preview: fullDiff,
                            targets: Object.keys(state.targets), best_obj: state.best_obj_overall, seed_obj: state.seed_obj,
                            note: "Use the lineage and diff context above to answer the question.",
                        }) }] };
        },
    });
    // ── bib_append ──────────────────────────────────────────────────────────
    api.registerTool({
        name: "bib_append",
        description: "Append BibTeX entries to the project references file.",
        parameters: {
            type: "object",
            properties: {
                bibtex: { type: "string", description: "BibTeX entries as a string." },
                bib_path: { type: "string", description: "Path to .bib file." },
            },
            required: ["bibtex"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const bibPath = params.bib_path ?? (0, node_path_1.join)(state.config.repo_path, "research", "refs", "references.bib");
            const entries = (0, bibtex_js_1.parseBib)(params.bibtex);
            if (entries.length === 0)
                return { content: [{ type: "text", text: JSON.stringify({ error: "No valid BibTeX entries found." }) }] };
            const added = (0, bibtex_js_1.appendBib)(bibPath, entries);
            return { content: [{ type: "text", text: JSON.stringify({ added, total_entries_parsed: entries.length, bib_path: bibPath }) }] };
        },
    });
    // =======================================================================
    // B-layer: Visualization tools
    // =======================================================================
    // ── viz_generate ────────────────────────────────────────────────────────
    api.registerTool({
        name: "viz_generate",
        description: "Generate an analysis chart driven by an expected conclusion.",
        parameters: {
            type: "object",
            properties: {
                expectation: { type: "string", description: "Expected conclusion." },
                data_description: { type: "string", description: "Description of available data." },
                chart_type: { type: "string", description: "Chart type: line, bar, heatmap, scatter." },
                output_dir: { type: "string" },
            },
            required: ["expectation", "data_description"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const outputDir = params.output_dir ?? (0, node_path_1.join)(state.config.repo_path, "research", "figures");
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "generate_chart", expectation: params.expectation,
                            data_description: params.data_description, chart_type: params.chart_type ?? "auto",
                            output_dir: outputDir,
                            instructions: [
                                "1. Write a Python script using matplotlib/seaborn.",
                                "2. Load data as described.",
                                "3. Chart should support or refute the expectation.",
                                `4. Save to ${outputDir}/<name>.png at 300 DPI.`,
                            ],
                        }) }] };
        },
    });
    // ── viz_highlight ───────────────────────────────────────────────────────
    api.registerTool({
        name: "viz_highlight",
        description: "Analyze a chart against expectations and identify highlights.",
        parameters: {
            type: "object",
            properties: {
                chart_path: { type: "string" },
                expectation: { type: "string" },
                data_summary: { type: "string" },
            },
            required: ["chart_path", "expectation", "data_summary"],
        },
        async execute(_id, params) {
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "highlight_analysis", chart_path: params.chart_path,
                            expectation: params.expectation, data_summary: params.data_summary,
                            instructions: [
                                "1. Compare data against expectation quantitatively.",
                                "2. Identify specific supporting data points.",
                                "3. Note discrepancies.",
                            ],
                        }) }] };
        },
    });
    // ── viz_polish ──────────────────────────────────────────────────────────
    api.registerTool({
        name: "viz_polish",
        description: "Polish a chart to publication quality.",
        parameters: {
            type: "object",
            properties: {
                chart_path: { type: "string" },
                target_venue: { type: "string", description: "Target venue (NeurIPS, CVPR, etc.)." },
            },
            required: ["chart_path"],
        },
        async execute(_id, params) {
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "polish_chart", chart_path: params.chart_path,
                            target_venue: params.target_venue ?? "general",
                            instructions: [
                                "1. Call /ask-lit for venue style guidelines.",
                                "2. Adjust fonts, colors, line widths.",
                                "3. Ensure >= 300 DPI.",
                            ],
                        }) }] };
        },
    });
    // =======================================================================
    // B-layer: Benchmark supplement tools
    // =======================================================================
    // ── bench_adapt ─────────────────────────────────────────────────────────
    api.registerTool({
        name: "bench_adapt",
        description: "Adapt code to run on a new dataset or benchmark configuration.",
        parameters: {
            type: "object",
            properties: {
                dataset_name: { type: "string" },
                requirement: { type: "string" },
                code_path: { type: "string" },
            },
            required: ["dataset_name", "requirement"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "adapt_code", dataset_name: params.dataset_name,
                            requirement: params.requirement, code_path: params.code_path ?? state.config.repo_path,
                            instructions: [
                                "1. Call /ask-lit for standard evaluation protocol.",
                                "2. Use code_qa to analyze existing data interfaces.",
                                "3. Write/modify dataloader and eval scripts.",
                            ],
                        }) }] };
        },
    });
    // ── bench_run ───────────────────────────────────────────────────────────
    api.registerTool({
        name: "bench_run",
        description: "Run a benchmark in an isolated git worktree.",
        parameters: {
            type: "object",
            properties: {
                branch: { type: "string" },
                benchmark_cmd: { type: "string" },
                worktree_path: { type: "string" },
            },
            required: ["branch", "benchmark_cmd"],
        },
        async execute(_id, params) {
            const state = (0, state_js_1.getState)();
            const repo = state.config.repo_path;
            const wtPath = params.worktree_path ?? (0, node_path_1.join)(repo, ".worktrees", `bench-${Date.now().toString(36)}`);
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "run_benchmark", branch: params.branch,
                            benchmark_cmd: params.benchmark_cmd, repo_path: repo, worktree_path: wtPath,
                            instructions: [
                                `1. git -C ${repo} worktree add ${wtPath} ${params.branch}`,
                                `2. cd ${wtPath} && ${params.benchmark_cmd}`,
                                "3. Parse output.",
                                `4. git -C ${repo} worktree remove ${wtPath} --force`,
                            ],
                        }) }] };
        },
    });
    // ── bench_validate ──────────────────────────────────────────────────────
    api.registerTool({
        name: "bench_validate",
        description: "Validate benchmark results against known SOTA.",
        parameters: {
            type: "object",
            properties: {
                dataset_name: { type: "string" },
                metrics: { type: "object", additionalProperties: { type: "number" } },
                method_name: { type: "string" },
            },
            required: ["dataset_name", "metrics"],
        },
        async execute(_id, params) {
            return { content: [{ type: "text", text: JSON.stringify({
                            action: "validate_results", dataset_name: params.dataset_name,
                            metrics: params.metrics, method_name: params.method_name ?? "ours",
                            instructions: [
                                `/ask-lit for SOTA values on ${params.dataset_name}.`,
                                "Compare each metric against known SOTA.",
                                "Flag suspicious results.",
                            ],
                        }) }] };
        },
    });
    // =======================================================================
    // C-layer: Research derivation forest tools
    // =======================================================================
    // ── research_init_forest ────────────────────────────────────────────────
    api.registerTool({
        name: "research_init_forest",
        description: "Initialize a derivation forest from evolution results.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" },
                evo_summary: { type: "string" },
            },
            required: ["forest_id"],
        },
        async execute(_id, params) {
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
            return { content: [{ type: "text", text: JSON.stringify({ forest_id: forest.id, status: forest.status, evo_summary: summary }) }] };
        },
    });
    // ── research_add_node ───────────────────────────────────────────────────
    api.registerTool({
        name: "research_add_node",
        description: "Add a node to the derivation forest.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" },
                type: { type: "string", enum: ["change", "hypothesis", "evidence", "question"] },
                content: { type: "string" },
                parent_ids: { type: "array", items: { type: "string" } },
                source_branches: { type: "array", items: { type: "string" } },
                literature_refs: { type: "array", items: { type: "string" } },
                experiment_ids: { type: "array", items: { type: "string" } },
            },
            required: ["forest_id", "type", "content"],
        },
        async execute(_id, params) {
            const node = (0, research_state_js_1.addNode)(params.forest_id, params.type, params.content, {
                parent_ids: params.parent_ids, source_branches: params.source_branches,
                literature_refs: params.literature_refs, experiment_ids: params.experiment_ids,
            });
            if (!node)
                return { content: [{ type: "text", text: JSON.stringify({ error: `Forest '${params.forest_id}' not found.` }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ node_id: node.id, type: node.type, depth: node.depth }) }] };
        },
    });
    // ── research_update_node ────────────────────────────────────────────────
    api.registerTool({
        name: "research_update_node",
        description: "Update a node in the derivation forest.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" }, node_id: { type: "string" },
                content: { type: "string" },
                status: { type: "string", enum: ["active", "pruned", "converged"] },
                literature_refs: { type: "array", items: { type: "string" } },
                experiment_ids: { type: "array", items: { type: "string" } },
            },
            required: ["forest_id", "node_id"],
        },
        async execute(_id, params) {
            const node = (0, research_state_js_1.updateNode)(params.forest_id, params.node_id, {
                content: params.content, status: params.status,
                literature_refs: params.literature_refs, experiment_ids: params.experiment_ids,
            });
            if (!node)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Node not found." }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ node_id: node.id, status: node.status }) }] };
        },
    });
    // ── research_merge_nodes ────────────────────────────────────────────────
    api.registerTool({
        name: "research_merge_nodes",
        description: "Merge multiple derivation nodes into one.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" },
                node_ids: { type: "array", items: { type: "string" } },
                merged_content: { type: "string" },
            },
            required: ["forest_id", "node_ids", "merged_content"],
        },
        async execute(_id, params) {
            const node = (0, research_state_js_1.mergeNodes)(params.forest_id, params.node_ids, params.merged_content);
            if (!node)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Merge failed." }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ merged_node_id: node.id, depth: node.depth }) }] };
        },
    });
    // ── research_check_convergence ──────────────────────────────────────────
    api.registerTool({
        name: "research_check_convergence",
        description: "Check if derivation branches converge.",
        parameters: { type: "object", properties: { forest_id: { type: "string" } }, required: ["forest_id"] },
        async execute(_id, params) {
            const result = (0, research_state_js_1.checkConvergence)(params.forest_id);
            const summary = (0, research_state_js_1.getForestSummary)(params.forest_id);
            return { content: [{ type: "text", text: JSON.stringify({ ...result, forest_summary: summary }) }] };
        },
    });
    // ── research_add_convergence_point ──────────────────────────────────────
    api.registerTool({
        name: "research_add_convergence_point",
        description: "Register a convergence point (deep motivation Q).",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" },
                question: { type: "string" },
                contributing_node_ids: { type: "array", items: { type: "string" } },
            },
            required: ["forest_id", "question", "contributing_node_ids"],
        },
        async execute(_id, params) {
            const point = (0, research_state_js_1.addConvergencePoint)(params.forest_id, params.question, params.contributing_node_ids);
            if (!point)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Forest not found." }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ point_id: point.id, question: point.question }) }] };
        },
    });
    // ── research_verify_convergence_point ───────────────────────────────────
    api.registerTool({
        name: "research_verify_convergence_point",
        description: "Verify or reject a convergence point.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" }, point_id: { type: "string" },
                verified: { type: "boolean" },
                evidence_ids: { type: "array", items: { type: "string" } },
            },
            required: ["forest_id", "point_id", "verified"],
        },
        async execute(_id, params) {
            const point = (0, research_state_js_1.verifyConvergencePoint)(params.forest_id, params.point_id, params.verified, params.evidence_ids ?? []);
            if (!point)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Point not found." }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ point_id: point.id, verification_status: point.verification_status }) }] };
        },
    });
    // ── research_record_contribution ────────────────────────────────────────
    api.registerTool({
        name: "research_record_contribution",
        description: "Grade a contribution as primary or auxiliary.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" }, convergence_point_id: { type: "string" },
                level: { type: "string", enum: ["primary", "auxiliary"] },
                description: { type: "string" },
            },
            required: ["forest_id", "convergence_point_id", "level", "description"],
        },
        async execute(_id, params) {
            const success = (0, research_state_js_1.recordContribution)(params.forest_id, params.convergence_point_id, params.level, params.description);
            if (!success)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to record." }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ recorded: true, level: params.level }) }] };
        },
    });
    // ── research_get_forest ─────────────────────────────────────────────────
    api.registerTool({
        name: "research_get_forest",
        description: "Get derivation forest state and summary.",
        parameters: {
            type: "object",
            properties: {
                forest_id: { type: "string" },
                include_nodes: { type: "boolean", description: "Include full nodes (default true)." },
            },
            required: ["forest_id"],
        },
        async execute(_id, params) {
            const forest = (0, research_state_js_1.getForest)(params.forest_id);
            if (!forest)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Forest not found." }) }] };
            const summary = (0, research_state_js_1.getForestSummary)(params.forest_id);
            if (params.include_nodes === false)
                return { content: [{ type: "text", text: JSON.stringify({ summary }) }] };
            return { content: [{ type: "text", text: JSON.stringify({ summary, forest }) }] };
        },
    });
    // ── research_iterate ────────────────────────────────────────────────────
    api.registerTool({
        name: "research_iterate",
        description: "Increment forest iteration counter.",
        parameters: { type: "object", properties: { forest_id: { type: "string" } }, required: ["forest_id"] },
        async execute(_id, params) {
            const count = (0, research_state_js_1.incrementIteration)(params.forest_id);
            if (count < 0)
                return { content: [{ type: "text", text: JSON.stringify({ error: "Forest not found." }) }] };
            const forest = (0, research_state_js_1.getForest)(params.forest_id);
            const maxIter = forest?.max_iterations ?? 20;
            const shouldContinue = count < maxIter && forest?.status !== "done";
            if (!shouldContinue && forest?.status !== "done")
                (0, research_state_js_1.markForestDone)(params.forest_id);
            return { content: [{ type: "text", text: JSON.stringify({ iteration: count, max_iterations: maxIter, continue: shouldContinue, status: forest?.status }) }] };
        },
    });
}
