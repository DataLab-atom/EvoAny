"use strict";
/**
 * C2: Research derivation forest state management.
 *
 * Manages the derivation forest (推导森林) lifecycle — persistence, node
 * manipulation, convergence detection, and contribution grading.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initForest = initForest;
exports.getForest = getForest;
exports.addNode = addNode;
exports.updateNode = updateNode;
exports.mergeNodes = mergeNodes;
exports.checkConvergence = checkConvergence;
exports.addConvergencePoint = addConvergencePoint;
exports.verifyConvergencePoint = verifyConvergencePoint;
exports.recordContribution = recordContribution;
exports.incrementIteration = incrementIteration;
exports.markForestDone = markForestDone;
exports.getForestSummary = getForestSummary;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const STATE_DIR = process.env["U2E_STATE_DIR"] ??
    (0, node_path_1.join)(process.env["HOME"] ?? "~", ".openclaw", "u2e-state");
const forests = {};
function forestPath(forestId) {
    return (0, node_path_1.join)(STATE_DIR, "forests", `${forestId}.json`);
}
function loadForest(forestId) {
    if (forestId in forests)
        return forests[forestId];
    const p = forestPath(forestId);
    if (!(0, node_fs_1.existsSync)(p))
        return null;
    const f = JSON.parse((0, node_fs_1.readFileSync)(p, "utf-8"));
    forests[forestId] = f;
    return f;
}
function saveForest(forestId) {
    const f = forests[forestId];
    if (!f)
        return;
    const p = forestPath(forestId);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(p), { recursive: true });
    (0, node_fs_1.writeFileSync)(p, JSON.stringify(f, null, 2));
}
// ---------------------------------------------------------------------------
// Forest lifecycle
// ---------------------------------------------------------------------------
let _counter = 0;
function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${(_counter++).toString(36)}`;
}
function initForest(forestId, evoSessionSummary) {
    const forest = {
        id: forestId,
        evo_session_summary: evoSessionSummary,
        nodes: {},
        convergence_points: [],
        contributions: [],
        iteration_count: 0,
        max_iterations: 20,
        status: "exploring",
        created_at: Date.now(),
        updated_at: Date.now(),
    };
    forests[forestId] = forest;
    saveForest(forestId);
    return forest;
}
function getForest(forestId) {
    return loadForest(forestId);
}
// ---------------------------------------------------------------------------
// Node operations
// ---------------------------------------------------------------------------
function addNode(forestId, type, content, opts = {}) {
    const forest = loadForest(forestId);
    if (!forest)
        return null;
    const parentIds = opts.parent_ids ?? [];
    // Calculate depth from parents
    let depth = 0;
    for (const pid of parentIds) {
        if (pid in forest.nodes) {
            depth = Math.max(depth, forest.nodes[pid].depth + 1);
        }
    }
    const node = {
        id: newId(type),
        type,
        content,
        parent_ids: parentIds,
        child_ids: [],
        source_branches: opts.source_branches ?? [],
        literature_refs: opts.literature_refs ?? [],
        experiment_ids: opts.experiment_ids ?? [],
        status: "active",
        depth,
        created_at: Date.now(),
        updated_at: Date.now(),
    };
    forest.nodes[node.id] = node;
    // Update parent child_ids
    for (const pid of parentIds) {
        if (pid in forest.nodes) {
            forest.nodes[pid].child_ids.push(node.id);
        }
    }
    forest.updated_at = Date.now();
    saveForest(forestId);
    return node;
}
function updateNode(forestId, nodeId, updates) {
    const forest = loadForest(forestId);
    if (!forest || !(nodeId in forest.nodes))
        return null;
    const node = forest.nodes[nodeId];
    if (updates.content !== undefined)
        node.content = updates.content;
    if (updates.status !== undefined)
        node.status = updates.status;
    if (updates.literature_refs)
        node.literature_refs = updates.literature_refs;
    if (updates.experiment_ids)
        node.experiment_ids = updates.experiment_ids;
    node.updated_at = Date.now();
    forest.updated_at = Date.now();
    saveForest(forestId);
    return node;
}
function mergeNodes(forestId, nodeIds, mergedContent) {
    const forest = loadForest(forestId);
    if (!forest)
        return null;
    // Collect all parent_ids, source_branches, literature_refs, experiment_ids from merged nodes
    const allParentIds = new Set();
    const allBranches = new Set();
    const allRefs = new Set();
    const allExps = new Set();
    let maxDepth = 0;
    for (const nid of nodeIds) {
        const n = forest.nodes[nid];
        if (!n)
            continue;
        for (const pid of n.parent_ids)
            allParentIds.add(pid);
        for (const b of n.source_branches)
            allBranches.add(b);
        for (const r of n.literature_refs)
            allRefs.add(r);
        for (const e of n.experiment_ids)
            allExps.add(e);
        maxDepth = Math.max(maxDepth, n.depth);
    }
    // Remove merged node ids from parent set
    for (const nid of nodeIds)
        allParentIds.delete(nid);
    const merged = addNode(forestId, "hypothesis", mergedContent, {
        parent_ids: [...allParentIds],
        source_branches: [...allBranches],
        literature_refs: [...allRefs],
        experiment_ids: [...allExps],
    });
    if (!merged)
        return null;
    // Depth should be at least as deep as deepest merged node
    merged.depth = maxDepth;
    // Mark original nodes as pruned and point their children to the merged node
    for (const nid of nodeIds) {
        const n = forest.nodes[nid];
        if (!n)
            continue;
        n.status = "pruned";
        n.updated_at = Date.now();
        for (const childId of n.child_ids) {
            const child = forest.nodes[childId];
            if (child) {
                child.parent_ids = child.parent_ids.filter((p) => p !== nid);
                child.parent_ids.push(merged.id);
            }
        }
        merged.child_ids.push(...n.child_ids);
    }
    // Deduplicate child_ids
    merged.child_ids = [...new Set(merged.child_ids)];
    forest.updated_at = Date.now();
    saveForest(forestId);
    return merged;
}
// ---------------------------------------------------------------------------
// Convergence detection
// ---------------------------------------------------------------------------
/**
 * Check if multiple active derivation branches converge to the same deep question.
 *
 * Strategy: Find pairs of leaf-level hypothesis nodes whose content shares
 * significant keyword overlap — a heuristic for "pointing at the same problem".
 * True convergence is confirmed by the ResearchAgent via experiment.
 */
function checkConvergence(forestId) {
    const forest = loadForest(forestId);
    if (!forest)
        return { converged: false, candidates: [] };
    // Collect active hypothesis nodes at depth >= 2
    const hypotheses = Object.values(forest.nodes).filter((n) => n.status === "active" && n.type === "hypothesis" && n.depth >= 2);
    if (hypotheses.length < 2)
        return { converged: false, candidates: [] };
    // Extract keywords from each hypothesis
    const nodeKeywords = new Map();
    for (const h of hypotheses) {
        const words = h.content
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3);
        nodeKeywords.set(h.id, new Set(words));
    }
    // Find pairs with significant overlap
    const candidates = [];
    for (let i = 0; i < hypotheses.length; i++) {
        for (let j = i + 1; j < hypotheses.length; j++) {
            const a = nodeKeywords.get(hypotheses[i].id);
            const b = nodeKeywords.get(hypotheses[j].id);
            // Must be from different root branches (different initial change nodes)
            const rootA = findRoot(forest, hypotheses[i].id);
            const rootB = findRoot(forest, hypotheses[j].id);
            if (rootA === rootB)
                continue;
            const shared = [...a].filter((w) => b.has(w));
            const overlapRatio = shared.length / Math.min(a.size, b.size);
            if (overlapRatio >= 0.3 && shared.length >= 3) {
                candidates.push({
                    node_ids: [hypotheses[i].id, hypotheses[j].id],
                    shared_keywords: shared.slice(0, 10),
                });
            }
        }
    }
    return { converged: candidates.length > 0, candidates };
}
function findRoot(forest, nodeId) {
    const visited = new Set();
    let current = nodeId;
    while (true) {
        if (visited.has(current))
            break;
        visited.add(current);
        const node = forest.nodes[current];
        if (!node || node.parent_ids.length === 0)
            break;
        current = node.parent_ids[0];
    }
    return current;
}
// ---------------------------------------------------------------------------
// Convergence point management
// ---------------------------------------------------------------------------
function addConvergencePoint(forestId, question, contributingNodeIds) {
    const forest = loadForest(forestId);
    if (!forest)
        return null;
    const point = {
        id: newId("conv"),
        question,
        contributing_node_ids: contributingNodeIds,
        evidence_ids: [],
        verification_status: "pending",
    };
    forest.convergence_points.push(point);
    // Mark contributing nodes as converged
    for (const nid of contributingNodeIds) {
        if (nid in forest.nodes) {
            forest.nodes[nid].status = "converged";
            forest.nodes[nid].updated_at = Date.now();
        }
    }
    forest.status = "converging";
    forest.updated_at = Date.now();
    saveForest(forestId);
    return point;
}
function verifyConvergencePoint(forestId, pointId, verified, evidenceIds) {
    const forest = loadForest(forestId);
    if (!forest)
        return null;
    const point = forest.convergence_points.find((p) => p.id === pointId);
    if (!point)
        return null;
    point.verification_status = verified ? "verified" : "rejected";
    point.evidence_ids = evidenceIds;
    if (!verified) {
        // Un-converge the nodes so they can continue exploring
        for (const nid of point.contributing_node_ids) {
            if (nid in forest.nodes) {
                forest.nodes[nid].status = "active";
                forest.nodes[nid].updated_at = Date.now();
            }
        }
        forest.status = "exploring";
    }
    forest.updated_at = Date.now();
    saveForest(forestId);
    return point;
}
// ---------------------------------------------------------------------------
// Contribution recording
// ---------------------------------------------------------------------------
function recordContribution(forestId, convergencePointId, level, description) {
    const forest = loadForest(forestId);
    if (!forest)
        return false;
    const point = forest.convergence_points.find((p) => p.id === convergencePointId);
    if (!point)
        return false;
    forest.contributions.push({
        convergence_point_id: convergencePointId,
        level,
        description,
        node_ids: point.contributing_node_ids,
    });
    forest.updated_at = Date.now();
    saveForest(forestId);
    return true;
}
// ---------------------------------------------------------------------------
// Iteration tracking
// ---------------------------------------------------------------------------
function incrementIteration(forestId) {
    const forest = loadForest(forestId);
    if (!forest)
        return -1;
    forest.iteration_count++;
    forest.updated_at = Date.now();
    saveForest(forestId);
    return forest.iteration_count;
}
function markForestDone(forestId) {
    const forest = loadForest(forestId);
    if (!forest)
        return;
    forest.status = "done";
    forest.updated_at = Date.now();
    saveForest(forestId);
}
// ---------------------------------------------------------------------------
// Summary / export helpers
// ---------------------------------------------------------------------------
function getForestSummary(forestId) {
    const forest = loadForest(forestId);
    if (!forest)
        return null;
    const activeNodes = Object.values(forest.nodes).filter((n) => n.status === "active");
    const prunedNodes = Object.values(forest.nodes).filter((n) => n.status === "pruned");
    const convergedNodes = Object.values(forest.nodes).filter((n) => n.status === "converged");
    const maxDepth = Math.max(0, ...Object.values(forest.nodes).map((n) => n.depth));
    return {
        forest_id: forestId,
        status: forest.status,
        iteration_count: forest.iteration_count,
        max_iterations: forest.max_iterations,
        total_nodes: Object.keys(forest.nodes).length,
        active_nodes: activeNodes.length,
        pruned_nodes: prunedNodes.length,
        converged_nodes: convergedNodes.length,
        max_depth: maxDepth,
        convergence_points: forest.convergence_points.length,
        verified_points: forest.convergence_points.filter((p) => p.verification_status === "verified").length,
        contributions: forest.contributions.length,
    };
}
