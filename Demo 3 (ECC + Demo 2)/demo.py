# """
# Hybrid image registration: SIFT + FLANN + Cross-Check + MAGSAC (robust
# homography) -> used as the initial guess for ECC refinement.

# Why hybrid, and what problem this solves
# -----------------------------------------
# 1. Pure SIFT+RANSAC (see full_registration_pipeline.py) sometimes gives very
#    few inliers (5-6 out of hundreds of matches) on lunar/planetary images.
#    Causes fixed here:
#      - Default SIFT contrast threshold is too strict for low-contrast
#        craters -> lowered here so more real keypoints are detected.
#      - One-directional ratio-test matching lets through one-sided "best
#        guess" matches that aren't actually mutual -> fixed with symmetric
#        (cross-check) matching: a match only survives if kp1->kp2 AND
#        kp2->kp1 agree on each other as the best match.
#      - Plain cv2.RANSAC is a weaker/older robust estimator -> replaced with
#        cv2.USAC_MAGSAC, which recovers a larger, more accurate inlier set
#        from the same matches.

# 2. Pure ECC (see ecc_registration.py) fails to converge ("Iterations do
#    not converge") when the two images start out far apart in
#    rotation/scale/translation, because ECC only does *local* refinement
#    from wherever you initialize it.
#    Fix: instead of starting ECC from the identity matrix, we start it from
#    the homography SIFT+MAGSAC already found. ECC then only has to do a
#    small local refinement, which converges reliably and gives sub-pixel
#    accuracy that pure feature-matching can't.

# Pipeline
# --------
#   1. SIFT keypoint detection (contrast threshold tuned down for lunar/low-
#      contrast imagery)                              -> keypoints1.jpg, keypoints2.jpg
#   2. FLANN matching + Lowe ratio test, BOTH directions
#   3. Cross-check: keep only mutual matches            -> all_good_matches.jpg
#   4. MAGSAC robust homography estimation              -> inlier_matches.jpg
#   5. ECC refinement seeded with the MAGSAC homography -> refined, sub-pixel
#   6. Warp + fuse (blend, checkerboard, difference map) -> registered.jpg etc.
#   7. Full summary: total keypoints, total matches, good matches, inlier
#      count/ratio (SIFT stage) AND final ECC correlation coefficient

# Usage:
#     python hybrid_registration.py image1.png image2.png
#     python hybrid_registration.py image1.png image2.png --ratio 0.8 --ransac-threshold 8
# """

import argparse
import os
import sys
from datetime import datetime

import cv2
import numpy as np


# --------------------------------------------------------------------------
# Stage 1-4: SIFT + FLANN + cross-check + MAGSAC
# --------------------------------------------------------------------------

def detect_features(gray, n_features=8000, use_clahe=True):
    """SIFT with a lowered contrast threshold, tuned for low-contrast /
    low-texture imagery (craters, regolith, shadows) where the default
    threshold throws away too many real keypoints."""
    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    sift = cv2.SIFT_create(
        nfeatures=n_features,
        contrastThreshold=0.02,   # default is 0.04; lower = more keypoints kept
        edgeThreshold=15,         # default is 10; higher = keep more edge-like features
    )
    keypoints, descriptors = sift.detectAndCompute(gray, None)
    return keypoints, descriptors


def cross_check_match(des1, des2, ratio=0.75):
    """
    Symmetric matching: match des1->des2 and des2->des1 separately (each
    with Lowe's ratio test), then keep only pairs that agree in both
    directions. This throws out one-sided "best guess" matches and is the
    main fix for very low inlier counts on repetitive/low-texture images.
    """
    index_params = dict(algorithm=1, trees=5)  # FLANN KD-tree, for SIFT (float) descriptors
    search_params = dict(checks=100)
    flann = cv2.FlannBasedMatcher(index_params, search_params)

    knn_12 = flann.knnMatch(des1, des2, k=2)
    knn_21 = flann.knnMatch(des2, des1, k=2)

    good_12 = {}
    for pair in knn_12:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < ratio * n.distance:
            good_12[m.queryIdx] = m.trainIdx

    good_21 = {}
    for pair in knn_21:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < ratio * n.distance:
            good_21[m.queryIdx] = m.trainIdx

    # Keep only mutual matches: kp1[i] -> kp2[j] AND kp2[j] -> kp1[i]
    mutual_matches = []
    for query_idx, train_idx in good_12.items():
        if good_21.get(train_idx) == query_idx:
            mutual_matches.append(cv2.DMatch(query_idx, train_idx, 0))

    total_raw = len(knn_12)
    return total_raw, mutual_matches


def estimate_homography_magsac(kp1, kp2, good_matches, ransac_threshold=6.0):
    """MAGSAC++ is a more modern, more accurate robust estimator than plain
    RANSAC -- it typically recovers a larger and more correct inlier set
    from the same input matches, which is exactly the '5-6 inliers out of
    many matches' problem this fixes."""
    pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(
        pts1, pts2, cv2.USAC_MAGSAC, ransac_threshold,
        maxIters=10000, confidence=0.999,
    )
    return H, mask


# --------------------------------------------------------------------------
# Stage 5: ECC refinement seeded with the SIFT homography
# --------------------------------------------------------------------------

def ecc_refine(image1, image2, initial_homography, n_iterations=5000, eps=1e-6, use_clahe=True):
    """
    Refine an already-roughly-correct homography with ECC. Because we start
    close to the true alignment (instead of identity), ECC converges
    reliably here even on images where pure ECC (from scratch) fails.
    """
    gray1 = cv2.cvtColor(image1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(image2, cv2.COLOR_BGR2GRAY)

    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray1 = clahe.apply(gray1)
        gray2 = clahe.apply(gray2)

    h, w = gray2.shape
    warp_matrix = initial_homography.astype(np.float32).copy()

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, n_iterations, eps)

    try:
        cc, refined_warp = cv2.findTransformECC(
            gray2, gray1, warp_matrix, cv2.MOTION_HOMOGRAPHY, criteria, None, 5
        )
        return cc, refined_warp, True
    except cv2.error:
        # ECC refinement failed to improve further -- fall back to the
        # SIFT/MAGSAC homography as-is, which is still a valid registration.
        return None, initial_homography, False


# --------------------------------------------------------------------------
# Fusion / visualization helpers
# --------------------------------------------------------------------------

def fuse_images(registered, reference, alpha=0.5, tile=40):
    h, w = reference.shape[:2]
    registered_resized = cv2.resize(registered, (w, h))

    blend = cv2.addWeighted(registered_resized, alpha, reference, 1 - alpha, 0)

    checkerboard = reference.copy()
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                checkerboard[y:y + tile, x:x + tile] = registered_resized[y:y + tile, x:x + tile]

    return blend, checkerboard


def difference_map(registered, reference):
    h, w = reference.shape[:2]
    registered_resized = cv2.resize(registered, (w, h))
    gray_r = cv2.cvtColor(registered_resized, cv2.COLOR_BGR2GRAY)
    gray_ref = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gray_r, gray_ref)
    return cv2.applyColorMap(diff, cv2.COLORMAP_JET)


# --------------------------------------------------------------------------
# Full pipeline
# --------------------------------------------------------------------------

def run_hybrid_registration(
    image1,
    image2,
    ratio=0.75,
    min_matches=4,
    n_features=8000,
    ransac_threshold=6.0,
    use_clahe=True,
    do_ecc_refine=True,
):
    gray1 = cv2.cvtColor(image1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(image2, cv2.COLOR_BGR2GRAY)

    # 1. Feature detection
    kp1, des1 = detect_features(gray1, n_features, use_clahe)
    kp2, des2 = detect_features(gray2, n_features, use_clahe)

    if des1 is None or des2 is None:
        raise RuntimeError("No features detected in one or both images.")

    kp1_vis = cv2.drawKeypoints(image1, kp1, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    kp2_vis = cv2.drawKeypoints(image2, kp2, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)

    # 2-3. FLANN matching + ratio test + cross-check (mutual matches only)
    total_raw_matches, good_matches = cross_check_match(des1, des2, ratio)

    if len(good_matches) < min_matches:
        raise RuntimeError(
            f"Not enough good matches after cross-check ({len(good_matches)} < {min_matches}). "
            f"Try raising --ratio (e.g. 0.85) or --n-features."
        )

    all_good_vis = cv2.drawMatches(
        image1, kp1, image2, kp2, good_matches, None,
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
    )

    # 4. MAGSAC robust homography
    H, mask = estimate_homography_magsac(kp1, kp2, good_matches, ransac_threshold)
    if H is None:
        raise RuntimeError("Homography estimation failed even with MAGSAC.")

    mask = mask.ravel()
    inlier_matches = [m for i, m in enumerate(good_matches) if mask[i]]
    outlier_matches = [m for i, m in enumerate(good_matches) if not mask[i]]
    inlier_count = len(inlier_matches)
    inlier_ratio = (inlier_count / len(good_matches)) * 100

    inlier_vis = cv2.drawMatches(
        image1, kp1, image2, kp2, inlier_matches, None,
        matchColor=(0, 255, 0),
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
    )

    # 5. ECC refinement, seeded with the MAGSAC homography
    ecc_cc, final_H, ecc_converged = (None, H, False)
    if do_ecc_refine:
        ecc_cc, final_H, ecc_converged = ecc_refine(image1, image2, H, use_clahe=use_clahe)

    # 6. Warp + fuse
    h, w = image2.shape[:2]
    registered = cv2.warpPerspective(image1, final_H, (w, h))
    blend, checkerboard = fuse_images(registered, image2)
    diff = difference_map(registered, image2)

    return {
        "keypoints1_count": len(kp1), "keypoints2_count": len(kp2),
        "keypoints1_vis": kp1_vis, "keypoints2_vis": kp2_vis,
        "raw_matches_count": total_raw_matches,
        "good_matches_count": len(good_matches),
        "good_matches_vis": all_good_vis,
        "sift_homography": H,
        "inlier_count": inlier_count,
        "outlier_count": len(outlier_matches),
        "inlier_ratio": inlier_ratio,
        "inlier_vis": inlier_vis,
        "ecc_converged": ecc_converged,
        "ecc_correlation": ecc_cc,
        "final_homography": final_H,
        "registered": registered,
        "fused_blend": blend,
        "fused_checkerboard": checkerboard,
        "difference_map": diff,
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Hybrid SIFT+MAGSAC+ECC registration")
    parser.add_argument("image1", help="Moving image (gets warped/aligned)")
    parser.add_argument("image2", help="Fixed/reference image")
    parser.add_argument("--out", default=None, help="Output directory")
    parser.add_argument("--ratio", type=float, default=0.75, help="Lowe's ratio test threshold (try 0.8-0.85 for lunar images)")
    parser.add_argument("--n-features", type=int, default=8000, help="Max SIFT keypoints")
    parser.add_argument("--ransac-threshold", type=float, default=6.0, help="MAGSAC reprojection threshold (px)")
    parser.add_argument("--no-clahe", action="store_true", help="Disable CLAHE contrast enhancement")
    parser.add_argument("--no-ecc", action="store_true", help="Skip ECC refinement, use SIFT/MAGSAC homography only")
    args = parser.parse_args()

    image1 = cv2.imread(args.image1)
    image2 = cv2.imread(args.image2)

    if image1 is None:
        print(f"Error: could not read {args.image1}")
        sys.exit(1)
    if image2 is None:
        print(f"Error: could not read {args.image2}")
        sys.exit(1)

    try:
        result = run_hybrid_registration(
            image1, image2,
            ratio=args.ratio,
            n_features=args.n_features,
            ransac_threshold=args.ransac_threshold,
            use_clahe=not args.no_clahe,
            do_ecc_refine=not args.no_ecc,
        )
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.out:
        run_folder = args.out
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_folder = os.path.join(script_dir, "outputs", f"hybrid_run_{timestamp}")
    os.makedirs(run_folder, exist_ok=True)

    cv2.imwrite(os.path.join(run_folder, "keypoints1.jpg"), result["keypoints1_vis"])
    cv2.imwrite(os.path.join(run_folder, "keypoints2.jpg"), result["keypoints2_vis"])
    cv2.imwrite(os.path.join(run_folder, "all_good_matches.jpg"), result["good_matches_vis"])
    cv2.imwrite(os.path.join(run_folder, "inlier_matches.jpg"), result["inlier_vis"])
    cv2.imwrite(os.path.join(run_folder, "registered.jpg"), result["registered"])
    cv2.imwrite(os.path.join(run_folder, "fused_blend.jpg"), result["fused_blend"])
    cv2.imwrite(os.path.join(run_folder, "fused_checkerboard.jpg"), result["fused_checkerboard"])
    cv2.imwrite(os.path.join(run_folder, "difference_map.jpg"), result["difference_map"])

    ecc_line = (
        f"ECC refinement            : converged, correlation = {result['ecc_correlation']:.6f} (1.0 = perfect)"
        if result["ecc_converged"]
        else "ECC refinement            : skipped/did not improve -- using SIFT/MAGSAC homography as-is"
    )

    summary_lines = [
        "HYBRID (SIFT + MAGSAC + ECC) REGISTRATION SUMMARY",
        "=" * 55,
        f"Keypoints in image1 (moving)     : {result['keypoints1_count']}",
        f"Keypoints in image2 (fixed)      : {result['keypoints2_count']}",
        f"Total raw match candidates       : {result['raw_matches_count']}",
        f"Good matches (ratio+cross-check) : {result['good_matches_count']}",
        f"MAGSAC inliers                   : {result['inlier_count']}",
        f"MAGSAC outliers rejected         : {result['outlier_count']}",
        f"Inlier ratio                     : {result['inlier_ratio']:.2f}%",
        ecc_line,
        "",
        "Final homography (SIFT homography refined by ECC if converged):",
        str(result["final_homography"]),
    ]
    summary_text = "\n".join(summary_lines)
    print(summary_text)

    with open(os.path.join(run_folder, "summary.txt"), "w") as f:
        f.write(summary_text)

    print(f"\nAll outputs saved to: {run_folder}")
    print("  - keypoints1.jpg / keypoints2.jpg   (SIFT keypoints, lowered contrast threshold)")
    print("  - all_good_matches.jpg              (cross-checked, mutual matches)")
    print("  - inlier_matches.jpg                (MAGSAC inliers, green)")
    print("  - registered.jpg                    (final aligned image, ECC-refined)")
    print("  - fused_blend.jpg / fused_checkerboard.jpg")
    print("  - difference_map.jpg                (bright = mismatch, dark = good alignment)")
    print("  - summary.txt")


if __name__ == "__main__":
    main()