def solve(**kwargs):
    num_planes = kwargs["num_planes"]
    num_runways = kwargs["num_runways"]
    planes = kwargs["planes"]
    separation = kwargs["separation"]

    indices = list(range(num_planes))

    def penalty(plane, t):
        target = plane["target"]
        if t < target:
            return (target - t) * plane["penalty_early"]
        if t > target:
            return (t - target) * plane["penalty_late"]
        return 0.0

    def lower_bound_on_runway(plane_idx, runway_history):
        lb = planes[plane_idx]["earliest"]
        for prev_idx, prev_time in runway_history:
            req = prev_time + separation[prev_idx][plane_idx]
            if req > lb:
                lb = req
        return lb

    def try_build(order_mode="latest", runway_mode="min_lb", landing_mode="lb"):
        if order_mode == "latest":
            order = sorted(
                indices,
                key=lambda i: (
                    planes[i]["latest"],
                    planes[i]["target"],
                    planes[i]["earliest"],
                ),
            )
        elif order_mode == "target":
            order = sorted(
                indices,
                key=lambda i: (
                    planes[i]["target"],
                    planes[i]["latest"],
                    planes[i]["earliest"],
                ),
            )
        elif order_mode == "slack":
            order = sorted(
                indices,
                key=lambda i: (
                    planes[i]["latest"] - planes[i]["earliest"],
                    planes[i]["latest"],
                    planes[i]["target"],
                ),
            )
        else:
            order = sorted(
                indices,
                key=lambda i: (
                    planes[i]["earliest"],
                    planes[i]["latest"],
                    planes[i]["target"],
                ),
            )

        runway_histories = [[] for _ in range(num_runways)]
        schedule = {}

        for plane_idx in order:
            plane = planes[plane_idx]
            latest = plane["latest"]
            target = plane["target"]
            candidates = []

            for r in range(num_runways):
                lb = lower_bound_on_runway(plane_idx, runway_histories[r])
                if lb > latest:
                    continue

                if landing_mode == "target_clip":
                    t = max(lb, min(target, latest))
                else:
                    t = lb

                candidates.append((r, t, lb, penalty(plane, t)))

            if not candidates:
                return None

            if runway_mode == "min_penalty":
                candidates.sort(key=lambda x: (x[3], x[2], x[0]))
            else:
                candidates.sort(key=lambda x: (x[2], x[3], x[0]))

            best_r, best_t, _, _ = candidates[0]
            runway_histories[best_r].append((plane_idx, best_t))
            schedule[plane_idx + 1] = {"landing_time": best_t, "runway": best_r + 1}

        return schedule

    attempts = [
        ("latest", "min_lb", "lb"),
        ("slack", "min_lb", "lb"),
        ("target", "min_lb", "lb"),
        ("target", "min_penalty", "target_clip"),
        ("earliest", "min_lb", "lb"),
    ]

    for order_mode, runway_mode, landing_mode in attempts:
        schedule = try_build(
            order_mode=order_mode,
            runway_mode=runway_mode,
            landing_mode=landing_mode,
        )
        if schedule is not None and len(schedule) == num_planes:
            return {"schedule": schedule}

    fallback = {}
    for i, plane in enumerate(planes, start=1):
        fallback[i] = {"landing_time": plane["target"], "runway": 1}

    return {"schedule": fallback}
