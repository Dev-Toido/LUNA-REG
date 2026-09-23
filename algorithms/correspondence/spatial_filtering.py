import numpy as np

def _triangle_signature(points, min_area=20.0):
    """
    Return scale-independent triangle geometry:
    sorted normalized side lengths + sorted internal angles.
    """
    p = np.asarray(points, dtype=np.float64).reshape(3, 2)

    v1 = p[1] - p[0]
    v2 = p[2] - p[0]

    area = abs(v1[0] * v2[1] - v1[1] * v2[0]) * 0.5

    if area < min_area:
        return None

    sides = np.array([
        np.linalg.norm(p[0] - p[1]),
        np.linalg.norm(p[1] - p[2]),
        np.linalg.norm(p[2] - p[0])
    ], dtype=np.float64)

    if np.min(sides) < 1e-6:
        return None

    sides_sorted = np.sort(sides)
    side_ratios = sides_sorted[:2] / sides_sorted[2]

    def angle(a, b, c):
        v1 = a - b
        v2 = c - b
        denom = np.linalg.norm(v1) * np.linalg.norm(v2)
        if denom < 1e-12:
            return 0.0
        cosv = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
        return np.degrees(np.arccos(cosv))

    angles = np.sort(np.array([
        angle(p[1], p[0], p[2]),
        angle(p[0], p[1], p[2]),
        angle(p[0], p[2], p[1])
    ], dtype=np.float64))

    return side_ratios, angles

def triangular_correspondence_filter(
    matches, kp_moving, kp_reference,
    k_neighbors=6, min_support=1, 
    max_side_ratio_error=0.18, max_angle_error_deg=12.0,
    min_area=20.0, max_candidates=1200, min_matches=10
):
    """
    Validate correspondences using local triangle geometry (TAT/RUCO style).
    """
    if len(matches) < 6:
        return matches, np.ones(len(matches), dtype=np.int32)

    # Sort matches by distance (lower is better) if 'distance' attribute exists
    if hasattr(matches[0], 'distance'):
        indexed = sorted(enumerate(matches), key=lambda item: item[1].distance)
    else:
        # If no distance (like LightGlue output when confidence is already applied), just take first N
        indexed = list(enumerate(matches))
        
    indexed = indexed[:max_candidates]

    original_indices = [item[0] for item in indexed]
    working_matches = [item[1] for item in indexed]

    moving_pts = np.float64([kp_moving[m.queryIdx].pt for m in working_matches])
    reference_pts = np.float64([kp_reference[m.trainIdx].pt for m in working_matches])

    n = len(working_matches)
    support = np.zeros(n, dtype=np.int32)

    diff = moving_pts[:, None, :] - moving_pts[None, :, :]
    dist2 = np.sum(diff * diff, axis=2)

    tested_triangles = set()

    for i in range(n):
        order = np.argsort(dist2[i])
        neighbors = [int(j) for j in order if j != i][:k_neighbors]

        for a in range(len(neighbors)):
            for b in range(a + 1, len(neighbors)):
                j = neighbors[a]
                k = neighbors[b]

                tri = tuple(sorted((i, j, k)))
                if tri in tested_triangles:
                    continue

                tested_triangles.add(tri)

                sig_m = _triangle_signature(moving_pts[list(tri)], min_area)
                sig_r = _triangle_signature(reference_pts[list(tri)], min_area)

                if sig_m is None or sig_r is None:
                    continue

                ratios_m, angles_m = sig_m
                ratios_r, angles_r = sig_r

                side_error = float(np.max(np.abs(ratios_m - ratios_r)))
                angle_error = float(np.max(np.abs(angles_m - angles_r)))

                if side_error <= max_side_ratio_error and angle_error <= max_angle_error_deg:
                    support[list(tri)] += 1

    keep_local = support >= min_support
    filtered_matches = [working_matches[i] for i in range(n) if keep_local[i]]

    if len(filtered_matches) < min_matches:
        print("Triangle verification retained too few matches; falling back to original matches.")
        return matches, np.zeros(len(matches), dtype=np.int32)

    full_support = np.zeros(len(matches), dtype=np.int32)
    for local_i, original_i in enumerate(original_indices):
        full_support[original_i] = support[local_i]

    return filtered_matches, full_support
