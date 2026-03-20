/**
 * C2: Research derivation forest state management.
 *
 * Manages the derivation forest (推导森林) lifecycle — persistence, node
 * manipulation, convergence detection, and contribution grading.
 */
import type { DerivationNode, DerivationForest, ConvergencePoint, ContributionLevel } from "./models.js";
export declare function initForest(forestId: string, evoSessionSummary: string): DerivationForest;
export declare function getForest(forestId: string): DerivationForest | null;
export declare function addNode(forestId: string, type: DerivationNode["type"], content: string, opts?: {
    parent_ids?: string[];
    source_branches?: string[];
    literature_refs?: string[];
    experiment_ids?: string[];
}): DerivationNode | null;
export declare function updateNode(forestId: string, nodeId: string, updates: {
    content?: string;
    status?: DerivationNode["status"];
    literature_refs?: string[];
    experiment_ids?: string[];
}): DerivationNode | null;
export declare function mergeNodes(forestId: string, nodeIds: string[], mergedContent: string): DerivationNode | null;
/**
 * Check if multiple active derivation branches converge to the same deep question.
 *
 * Strategy: Find pairs of leaf-level hypothesis nodes whose content shares
 * significant keyword overlap — a heuristic for "pointing at the same problem".
 * True convergence is confirmed by the ResearchAgent via experiment.
 */
export declare function checkConvergence(forestId: string): {
    converged: boolean;
    candidates: {
        node_ids: string[];
        shared_keywords: string[];
    }[];
};
export declare function addConvergencePoint(forestId: string, question: string, contributingNodeIds: string[]): ConvergencePoint | null;
export declare function verifyConvergencePoint(forestId: string, pointId: string, verified: boolean, evidenceIds: string[]): ConvergencePoint | null;
export declare function recordContribution(forestId: string, convergencePointId: string, level: ContributionLevel, description: string): boolean;
export declare function incrementIteration(forestId: string): number;
export declare function markForestDone(forestId: string): void;
export declare function getForestSummary(forestId: string): Record<string, unknown> | null;
