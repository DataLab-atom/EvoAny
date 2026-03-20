"""
TSP (Traveling Salesman Problem) - Optimization Target
"""

import random
import math


def calculate_distance(city1, city2):
    """Calculate Euclidean distance between two cities."""
    return math.sqrt((city1[0] - city2[0])**2 + (city1[1] - city2[1])**2)


def calculate_total_distance(route, cities):
    """Calculate total distance for a given route."""
    total = 0
    for i in range(len(route) - 1):
        total += calculate_distance(cities[route[i]], cities[route[i + 1]])
    # Return to start
    total += calculate_distance(cities[route[-1]], cities[route[0]])
    return total


def nearest_neighbor_from_start(cities, start):
    """Run nearest neighbor starting from a specific city."""
    n = len(cities)
    unvisited = set(range(n))
    unvisited.remove(start)
    route = [start]
    current = start
    
    while unvisited:
        # Find nearest unvisited city
        nearest = min(unvisited, key=lambda city: calculate_distance(cities[current], cities[city]))
        route.append(nearest)
        unvisited.remove(nearest)
        current = nearest
    
    return route


def solve_tsp_brute_force(cities):
    """
    Stratified nearest neighbor - try multiple starting points.
    """
    n = len(cities)
    if n == 0:
        return []
    
    # Try starting from multiple cities (stratification)
    best_route = None
    best_distance = float('inf')
    
    for start in range(min(5, n)):  # Try first 5 cities as starting points
        route = nearest_neighbor_from_start(cities, start)
        distance = calculate_total_distance(route, cities)
        if distance < best_distance:
            best_distance = distance
            best_route = route
    
    return best_route if best_route else [0]


def generate_cities(n=20, seed=42):
    """Generate random cities."""
    random.seed(seed)
    return [(random.random() * 100, random.random() * 100) for _ in range(n)]


def run_benchmark():
    """Main benchmark function."""
    cities = generate_cities(20, 42)
    route = solve_tsp_brute_force(cities)
    distance = calculate_total_distance(route, cities)
    print(f"{distance:.2f}")


if __name__ == "__main__":
    run_benchmark()
