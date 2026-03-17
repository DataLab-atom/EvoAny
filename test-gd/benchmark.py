"""Benchmark script for the gradient descent optimizer.

Outputs two space-separated numbers (multi-objective, "numbers" format):
  steps_to_converge  final_loss

Both objectives are MIN (fewer steps + lower loss = better).
"""

from optimizer import gradient_descent

result = gradient_descent()
print(f"{result['steps']} {result['final_loss']:.10e}")
