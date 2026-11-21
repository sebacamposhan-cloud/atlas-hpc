"""Report matched control-point deviations without changing any sources."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("controls", type=Path, help="JSON with control_points, as in calibrate-sheets.py")
    parser.add_argument("--tolerance", type=float, required=True, help="Maximum acceptable error in the supplied units")
    args = parser.parse_args()
    if not np.isfinite(args.tolerance) or args.tolerance <= 0:
        parser.error("--tolerance must be positive and finite")

    document = json.loads(args.controls.read_text(encoding="utf-8"))
    pairs = np.asarray(document["control_points"], dtype=np.float64)
    if pairs.ndim != 3 or pairs.shape[1:] != (2, 2) or len(pairs) < 3 or not np.isfinite(pairs).all():
        parser.error("Provide at least three finite pairs of points")
    source, target = pairs[:, 0], pairs[:, 1]
    if any(np.linalg.matrix_rank(points - points.mean(axis=0)) < 2 for points in (source, target)):
        parser.error("Control points on each sheet must span two dimensions")

    matrix, inliers = cv2.estimateAffinePartial2D(
        np.ascontiguousarray(source, dtype=np.float32),
        np.ascontiguousarray(target, dtype=np.float32),
        method=cv2.RANSAC,
        ransacReprojThreshold=args.tolerance,
    )
    if matrix is None:
        parser.error("Could not estimate a similarity transform")
    offsets = target - source
    fitted = cv2.transform(source.reshape(-1, 1, 2), matrix).reshape(-1, 2)
    errors = np.linalg.norm(target - fitted, axis=1)
    print(json.dumps({
        "from_source": document.get("from_source"),
        "to_source": document.get("to_source"),
        "units": document.get("units"),
        "tolerance": args.tolerance,
        "status": "diagnostic_only",
        "candidate_transform": matrix.tolist(),
        "points": [
            {
                "pair": index + 1,
                "offset": offset.tolist(),
                "distance": float(np.linalg.norm(offset)),
                "residual": float(error),
                "inlier": bool(inlier),
            }
            for index, (offset, error, inlier) in enumerate(zip(offsets, errors, inliers.ravel()))
        ],
    }, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
