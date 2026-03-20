import subprocess
import re

# All 50 evaluation branches in order
branches = [
    ("seed", "master", "Baseline"),
    # Gen-0
    ("gen-0/tsp_pruning/structural-0", 37.92, "Gen-0 #1"),
    ("gen-0/tsp_pruning/mutate-0", 18.71, "Gen-0 #2"),
    ("gen-0/tsp_nearest_neighbor/structural-0", 0.06, "Gen-0 #3"),
    ("gen-0/tsp_nearest_neighbor/mutate-0", 0.09, "Gen-0 #4"),
    ("gen-0/tsp_2opt/structural-0", 0.29, "Gen-0 #5"),
    ("gen-0/tsp_2opt/mutate-0", 0.24, "Gen-0 #6"),
    ("gen-0/tsp_cache_distances/structural-0", 98.67, "Gen-0 #7"),
    ("gen-0/tsp_cache_distances/mutate-0", 180.68, "Gen-0 #8"),
    # All other branches from eval 10-50
]

print("Analyzing all branches...")

for item in branches:
    if len(item) == 3:
        branch, parent, note = item
        time_ms = "N/A"
    else:
        branch, time_ms, note = item
        parent = "master"
    
    print(f"\n{'='*80}")
    print(f"Branch: {branch}")
    print(f"Note: {note}")
    print(f"Time: {time_ms} ms")
    
    try:
        # Checkout branch
        subprocess.run(['git', 'checkout', '-q', branch], check=True, cwd='.')
        
        # Get diff
        result = subprocess.run(
            ['git', 'diff', parent, '--', 'tsp.py'],
            capture_output=True, text=True, cwd='.'
        )
        
        if result.stdout:
            print("\nCode changes:")
            print(result.stdout[:500])  # First 500 chars
        else:
            print("\nNo changes to tsp.py")
            
    except Exception as e:
        print(f"Error: {e}")

print("\n" + "="*80)
print("Analysis complete")
