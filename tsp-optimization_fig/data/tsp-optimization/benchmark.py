import time
import sys
import random
import math
sys.path.insert(0, '.')

from tsp import generate_cities, solve_tsp_brute_force, calculate_total_distance

# Benchmark: solve TSP for 8 cities (brute force is feasible but slow)
# 8! = 40,320 permutations - takes a few seconds
# This is a real optimization target - we want to find faster algorithms
cities = generate_cities(8, 42)

start = time.perf_counter()
route = solve_tsp_brute_force(cities)
distance = calculate_total_distance(route, cities)
elapsed = (time.perf_counter() - start) * 1000  # ms

# Output: lower is better (minimize time)
print(f"{elapsed:.2f}")
