import argparse
import os
from typing import Any, Dict, List, Tuple


def evaluate_task(task_dir: str) -> Dict[str, Any]:
    from config import eval_func, get_dev, load_data, norm_score
    from evo_func import solve

    data_dir = os.path.join(task_dir, "data")
    if not os.path.isdir(data_dir):
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    case_files = sorted(
        [name for name in os.listdir(data_dir) if name.endswith(".txt")],
        key=lambda x: (len(x), x),
    )
    if not case_files:
        raise RuntimeError(f"No .txt case files found in: {data_dir}")

    raw_results: Dict[str, Tuple[List[Any], str]] = {}
    for case_file in case_files:
        case_path = os.path.join(data_dir, case_file)
        instances = load_data(case_path)
        scores: List[Any] = []
        error_message = ""

        for idx, instance in enumerate(instances):
            try:
                solution = solve(**instance)
                schedule = solution["schedule"]
                score = eval_func(**instance, schedule=schedule)
                scores.append(score)
            except Exception as exc:
                scores.append(None)
                if not error_message:
                    error_message = f"instance {idx}: {exc}"

        raw_results[case_file] = (scores, error_message)

    normalized = norm_score(raw_results)
    dev_split = get_dev()
    dev_only = {}
    test_only = {}
    for case_file, (scores, err) in normalized.items():
        dev_indices = set(dev_split.get(case_file, []))
        dev_scores = [scores[i] for i in sorted(dev_indices) if i < len(scores)]
        test_scores = [scores[i] for i in range(len(scores)) if i not in dev_indices]
        dev_only[case_file] = (dev_scores, err)
        test_only[case_file] = (test_scores, err)

    def avg(results: Dict[str, Tuple[List[Any], str]]) -> float:
        values: List[float] = []
        for scores, _ in results.values():
            for v in scores:
                if isinstance(v, (int, float)):
                    values.append(float(v))
        return sum(values) / len(values) if values else 0.0

    return {
        "raw_results": raw_results,
        "norm_results": normalized,
        "dev_results": dev_only,
        "test_results": test_only,
        "score": avg(normalized),
        "dev_score": avg(dev_only),
        "test_score": avg(test_only),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate extracted Aircraft_landing task")
    parser.add_argument(
        "--task_dir",
        default=os.path.dirname(os.path.abspath(__file__)),
        help="Path to extracted Aircraft_landing directory",
    )
    args = parser.parse_args()

    results = evaluate_task(args.task_dir)

    print("====== Raw Penalty by Case ======")
    for case_file, (scores, err) in results["raw_results"].items():
        if err:
            print(f"{case_file}: {scores}  [ERROR] {err}")
        else:
            print(f"{case_file}: {scores}")

    print("\n====== Normalized Score ======")
    print(f"score      : {results['score']:.6f}")
    print(f"dev_score  : {results['dev_score']:.6f}")
    print(f"test_score : {results['test_score']:.6f}")


if __name__ == "__main__":
    main()
