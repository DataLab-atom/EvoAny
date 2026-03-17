"""Gradient descent optimizer — the evolution target.

This is the function that the evolutionary algorithm will try to optimize.
It performs gradient descent on the Rosenbrock function and returns:
  - steps_to_converge: number of iterations to reach threshold (lower is better)
  - final_loss: final function value achieved (lower is better)
"""

import math


def gradient_descent(x0: float = -1.5, y0: float = 1.5,
                     lr: float = 0.001, max_steps: int = 5000,
                     tol: float = 1e-6) -> dict:
    """Minimize the Rosenbrock function f(x,y) = (1-x)^2 + 100*(y-x^2)^2.

    Returns dict with 'steps' and 'final_loss'.
    """
    x, y = x0, y0

    for step in range(1, max_steps + 1):
        # Rosenbrock gradient
        dx = -2.0 * (1.0 - x) + 200.0 * (y - x**2) * (-2.0 * x)
        dy = 200.0 * (y - x**2)

        loss = (1.0 - x)**2 + 100.0 * (y - x**2)**2

        if loss < tol:
            return {"steps": step, "final_loss": loss}

        x -= lr * dx
        y -= lr * dy

    final_loss = (1.0 - x)**2 + 100.0 * (y - x**2)**2
    return {"steps": max_steps, "final_loss": final_loss}


if __name__ == "__main__":
    result = gradient_descent()
    print(f"steps={result['steps']}, final_loss={result['final_loss']:.6e}")
