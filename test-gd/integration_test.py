"""
Full integration test of the multi-objective coevolution engine.

Simulates the OrchestratorAgent + WorkerAgent loop against a gradient descent
optimizer with two objectives: steps_to_converge (min) and final_loss (min).

Instead of LLM-driven code generation, we programmatically create optimizer
variants with different hyperparameters and evaluate them through the engine.
"""

from __future__ import annotations

import json
import hashlib
import os
import sys
import textwrap

# Add the evo-engine to the path.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin", "evo-engine"))

# Override state dir so we don't pollute the real one.
os.environ["U2E_STATE_DIR"] = "/tmp/evo-integration-test-state"

import server  # noqa: E402

# ---------------------------------------------------------------------------
# Optimizer variant generator (replaces LLM code generation)
# ---------------------------------------------------------------------------

VARIANTS = [
    # (description, lr, momentum_factor, nesterov, adaptive)
    ("higher lr", 0.005, 0.0, False, False),
    ("lr=0.01", 0.01, 0.0, False, False),
    ("momentum 0.9", 0.001, 0.9, False, False),
    ("momentum 0.95", 0.001, 0.95, False, False),
    ("nesterov momentum", 0.002, 0.9, True, False),
    ("high lr + momentum", 0.005, 0.9, False, False),
    ("adaptive lr", 0.01, 0.0, False, True),
    ("adaptive + momentum", 0.005, 0.9, False, True),
    ("aggressive lr", 0.02, 0.5, False, False),
    ("nesterov + adaptive", 0.003, 0.9, True, True),
    ("very high lr", 0.05, 0.0, False, False),
    ("moderate everything", 0.003, 0.7, False, False),
    ("conservative momentum", 0.002, 0.5, False, False),
    ("heavy momentum", 0.001, 0.99, False, False),
    ("crossover: adaptive+nesterov", 0.004, 0.85, True, True),
    ("crossover: high lr+heavy mom", 0.008, 0.95, False, True),
]


def run_variant(lr: float, momentum: float, nesterov: bool, adaptive: bool,
                x0: float = -1.5, y0: float = 1.5,
                max_steps: int = 5000, tol: float = 1e-6) -> dict:
    """Run a gradient descent variant and return {steps, final_loss}."""
    x, y = x0, y0
    vx, vy = 0.0, 0.0  # velocity for momentum
    current_lr = lr

    for step in range(1, max_steps + 1):
        dx = -2.0 * (1.0 - x) + 200.0 * (y - x**2) * (-2.0 * x)
        dy = 200.0 * (y - x**2)

        loss = (1.0 - x)**2 + 100.0 * (y - x**2)**2
        if loss < tol:
            return {"steps": step, "final_loss": loss}

        # Adaptive learning rate (simple decay).
        if adaptive:
            current_lr = lr / (1.0 + 0.0001 * step)

        if nesterov and momentum > 0:
            # Nesterov lookahead.
            lx = x - momentum * vx
            ly = y - momentum * vy
            dx_n = -2.0 * (1.0 - lx) + 200.0 * (ly - lx**2) * (-2.0 * lx)
            dy_n = 200.0 * (ly - lx**2)
            vx = momentum * vx + current_lr * dx_n
            vy = momentum * vy + current_lr * dy_n
        elif momentum > 0:
            vx = momentum * vx + current_lr * dx
            vy = momentum * vy + current_lr * dy
        else:
            vx = current_lr * dx
            vy = current_lr * dy

        # Gradient clipping to avoid divergence.
        mag = (vx**2 + vy**2) ** 0.5
        if mag > 1.0:
            vx /= mag
            vy /= mag

        x -= vx
        y -= vy

    final_loss = (1.0 - x)**2 + 100.0 * (y - x**2)**2
    return {"steps": max_steps, "final_loss": final_loss}


def code_hash_of(desc: str) -> str:
    return hashlib.sha256(desc.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Main integration test
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("MULTI-OBJECTIVE COEVOLUTION — FULL INTEGRATION TEST")
    print("Target: gradient_descent on Rosenbrock")
    print("Objectives: steps_to_converge (min), final_loss (min)")
    print("=" * 70)
    print()

    # Clean old state.
    import shutil
    state_dir = os.environ["U2E_STATE_DIR"]
    if os.path.exists(state_dir):
        shutil.rmtree(state_dir)

    # ---------------------------------------------------------------- INIT
    print("[1] evo_init")
    result = server.evo_init(
        repo_path="/home/user/Evo-anything/test-gd",
        benchmark_cmd="python benchmark.py",
        objectives=[
            {"name": "steps", "direction": "min"},
            {"name": "final_loss", "direction": "min"},
        ],
        benchmark_format="numbers",
        max_fe=30,
        pop_size=4,
        mutation_rate=0.5,
        synergy_interval=2,
        top_k_survive=3,
    )
    print(f"  → {result}")
    assert result["status"] == "initialized"
    print()

    # -------------------------------------------------------- REGISTER TARGETS
    print("[2] evo_register_targets")
    result = server.evo_register_targets([
        {
            "id": "gd-optimizer",
            "file": "optimizer.py",
            "function": "gradient_descent",
            "impact": "high",
            "description": "Core gradient descent loop on Rosenbrock function",
        }
    ])
    print(f"  → {result}")
    assert result["registered"] == 1
    print()

    # ----------------------------------------------------------- REPORT SEED
    print("[3] evo_report_seed (baseline)")
    baseline = run_variant(lr=0.001, momentum=0.0, nesterov=False, adaptive=False)
    seed_fitness = [float(baseline["steps"]), baseline["final_loss"]]
    print(f"  baseline: steps={baseline['steps']}, loss={baseline['final_loss']:.6e}")

    result = server.evo_report_seed(fitness_values=seed_fitness)
    print(f"  → {result}")
    print()

    # ----------------------------------------------------------- EVOLUTION LOOP
    variant_idx = 0
    max_generations = 4

    for gen in range(max_generations):
        print(f"{'='*70}")
        print(f"GENERATION {gen}")
        print(f"{'='*70}")

        # ----- begin_generation via evo_step
        print(f"\n[gen-{gen}] evo_step('begin_generation')")
        step_result = server.evo_step(phase="begin_generation")
        if step_result.get("action") == "done":
            print(f"  → DONE: {step_result.get('reason')}")
            break

        assert step_result["action"] == "dispatch_workers", f"Unexpected: {step_result}"
        batch = step_result["items"]
        print(f"  → {len(batch)} items to dispatch")
        print(f"  → objectives: {step_result.get('objectives')}")
        print(f"  → benchmark_format: {step_result.get('benchmark_format')}")

        # ----- Process each batch item (simulate WorkerAgent)
        for item in batch:
            branch = item["branch"]
            target_id = item["target_id"]
            operation = item["operation"]
            parent_branches = item["parent_branches"]

            # Skip synergy for this test (no real git branches).
            if operation == "synergy":
                print(f"\n  [{branch}] SYNERGY — skipping (no git)")
                server.evo_step(
                    phase="fitness_ready",
                    branch=branch,
                    fitness_values=[],
                    success=False,
                    operation=operation,
                    target_id=target_id,
                    parent_branches=parent_branches,
                    raw_output="synergy not supported in integration test",
                )
                continue

            # Pick a variant (simulates LLM code generation).
            if variant_idx >= len(VARIANTS):
                variant_idx = 0  # cycle
            desc, lr, mom, nest, adapt = VARIANTS[variant_idx]
            variant_idx += 1

            print(f"\n  [{branch}] {operation} — variant: {desc}")
            print(f"    lr={lr}, momentum={mom}, nesterov={nest}, adaptive={adapt}")

            # Simulate: code_ready → policy_pass (skip actual git/policy)
            # Go straight to benchmark.

            # Run the variant.
            result = run_variant(lr=lr, momentum=mom, nesterov=nest, adaptive=adapt)
            fitness_values = [float(result["steps"]), result["final_loss"]]
            ch = code_hash_of(desc + str(gen))

            print(f"    result: steps={result['steps']}, loss={result['final_loss']:.6e}")
            print(f"    fitness_values={fitness_values}")

            # Report fitness via evo_step.
            report = server.evo_step(
                phase="fitness_ready",
                branch=branch,
                fitness_values=fitness_values,
                success=True,
                operation=operation,
                target_id=target_id,
                parent_branches=parent_branches,
                code_hash=ch,
            )
            on_pf = report.get("on_pareto_front", False)
            print(f"    → evals={report.get('total_evals')}, "
                  f"on_pareto_front={on_pf}")

        # ----- Selection via evo_step
        print(f"\n[gen-{gen}] evo_step('select')")
        select_result = server.evo_step(phase="select")
        print(f"  → keep={len(select_result.get('keep', []))}, "
              f"eliminate={len(select_result.get('eliminate', []))}, "
              f"pareto_front_size={select_result.get('pareto_front_size')}")
        print(f"  → best_branch={select_result.get('best_branch')}")
        print(f"  → best_obj={select_result.get('best_obj')}")

        # ----- Reflect (simulate — just advance)
        print(f"\n[gen-{gen}] evo_step('reflect_done')")
        reflect = server.evo_step(phase="reflect_done")
        if reflect.get("action") == "done":
            print(f"  → DONE: {reflect.get('reason')}")
            break
        print(f"  → next action: {reflect.get('action')}")

    # ----------------------------------------------------------- FINAL STATUS
    print(f"\n{'='*70}")
    print("FINAL STATUS")
    print(f"{'='*70}")
    status = server.evo_get_status()
    print(json.dumps(status, indent=2, default=str))

    # ----------------------------------------------------------- LINEAGE
    if status.get("best_branch_overall"):
        print(f"\n{'='*70}")
        print(f"LINEAGE of {status['best_branch_overall']}")
        print(f"{'='*70}")
        lineage = server.evo_get_lineage(status["best_branch_overall"])
        print(json.dumps(lineage, indent=2, default=str))

    # ----------------------------------------------------------- ASSERTIONS
    print(f"\n{'='*70}")
    print("ASSERTIONS")
    print(f"{'='*70}")

    assert status["generation"] > 0, "Should have completed at least 1 generation"
    assert status["total_evals"] > 1, "Should have evaluated multiple variants"
    assert status["pareto_front_size"] >= 1, "Should have at least 1 Pareto front member"
    assert status["best_obj_overall"] is not None, "Should have a best objective"
    assert len(status["best_obj_overall"]) == 2, "Should have 2 objective values"
    assert status["objectives"] == [
        {"name": "steps", "direction": "min"},
        {"name": "final_loss", "direction": "min"},
    ], "Objectives should match"

    # Check improvement.
    improvement = status["improvement"]
    assert improvement is not None, "Should report improvement"
    print(f"  improvement: {improvement}")

    # The Pareto front should have meaningful diversity.
    pf = status["pareto_front"]
    print(f"  pareto_front: {len(pf)} solutions")
    for sol in pf:
        print(f"    {sol['branch']}: steps={sol['fitness'][0]}, "
              f"loss={sol['fitness'][1]:.6e}")

    seed = status["seed_obj"]
    best = status["best_obj_overall"]
    print(f"\n  seed:  steps={seed[0]}, loss={seed[1]:.6e}")
    print(f"  best:  steps={best[0]}, loss={best[1]:.6e}")

    # At least one objective should have improved.
    steps_improved = best[0] < seed[0]
    loss_improved = best[1] < seed[1]
    print(f"  steps improved: {steps_improved}")
    print(f"  loss improved:  {loss_improved}")
    assert steps_improved or loss_improved, "At least one objective should improve"

    print(f"\n{'='*70}")
    print("ALL ASSERTIONS PASSED")
    print(f"{'='*70}")

    return status


if __name__ == "__main__":
    main()
