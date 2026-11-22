"""Measure matched control points or repeated room labels between DWG sheets."""
import argparse
from collections import defaultdict
from itertools import combinations
import json
from pathlib import Path

import cv2
import numpy as np


def compare(points, tolerance):
    pairs = np.asarray(points, dtype=np.float64)
    if pairs.ndim != 3 or pairs.shape[1:] != (2, 2) or not np.isfinite(pairs).all():
        raise ValueError("Provide finite pairs of 2D points")
    source, target = pairs[:, 0], pairs[:, 1]
    offsets = target - source
    distances = np.linalg.norm(offsets, axis=1)
    matrix, inliers = None, None
    residuals = [None] * len(pairs)
    if len(pairs) >= 3 and all(np.linalg.matrix_rank(p - p.mean(axis=0)) == 2 for p in (source, target)):
        matrix, inliers = cv2.estimateAffinePartial2D(
            np.ascontiguousarray(source, dtype=np.float32),
            np.ascontiguousarray(target, dtype=np.float32),
            method=cv2.RANSAC,
            ransacReprojThreshold=tolerance,
        )
        if matrix is not None:
            fitted = cv2.transform(source.reshape(-1, 1, 2), matrix).reshape(-1, 2)
            residuals = np.linalg.norm(target - fitted, axis=1).tolist()
    return {
        "candidate_transform": None if matrix is None else matrix.tolist(),
        "points": [
            {
                "pair": index + 1,
                "offset": offset.tolist(),
                "distance": float(distance),
                "residual": residual,
                "inlier": None if inliers is None else bool(inliers[index, 0]),
            }
            for index, (offset, distance, residual) in enumerate(zip(offsets, distances, residuals))
        ],
    }


def compare_catalog(document, tolerance):
    labels = defaultdict(lambda: defaultdict(list))
    for label in document["rotulos"]:
        labels[label["codigo"].strip()][label["lamina"]].append(label["p"])
    groups = defaultdict(list)
    for code, sheets in sorted(labels.items()):
        unique = [(sheet, values[0]) for sheet, values in sorted(sheets.items()) if len(values) == 1]
        for (first, source), (second, target) in combinations(unique, 2):
            groups[first, second].append((code, [source, target]))

    files = {sheet["lamina"]: sheet["archivo"] for sheet in document["laminas"]}
    reports = []
    for (first, second), matches in sorted(groups.items()):
        codes, points = zip(*matches)
        comparison = compare(points, tolerance)
        for code, point in zip(codes, comparison["points"]):
            point["room_code"] = code
            point["needs_review"] = point["distance"] > tolerance
        reports.append({
            "from_source": files[first],
            "to_source": files[second],
            "matched_labels": len(matches),
            "over_tolerance": sum(point["needs_review"] for point in comparison["points"]),
            **comparison,
        })
    return {"units": "cm", "basis": "repeated_room_labels", "sheet_pairs": reports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("controls", type=Path, help="JSON of paired points or data/<floor>/laminas.json")
    parser.add_argument("--dwg-catalog", action="store_true", help="Match unique room codes across sheets")
    parser.add_argument("--tolerance", type=float, required=True, help="Maximum acceptable error in the supplied units")
    args = parser.parse_args()
    if not np.isfinite(args.tolerance) or args.tolerance <= 0:
        parser.error("--tolerance must be positive and finite")

    document = json.loads(args.controls.read_text(encoding="utf-8"))
    if args.dwg_catalog:
        result = compare_catalog(document, args.tolerance)
    else:
        try:
            result = compare(document["control_points"], args.tolerance)
        except ValueError as error:
            parser.error(str(error))
        if result["candidate_transform"] is None:
            parser.error("Provide at least three non-collinear pairs to estimate the transform")
        result.update({key: document.get(key) for key in ("from_source", "to_source", "units")})
    print(json.dumps({"status": "diagnostic_only", "tolerance": args.tolerance, **result}, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
