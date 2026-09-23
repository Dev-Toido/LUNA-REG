# """
# Full image registration pipeline: SIFT + BFMatcher + Ratio Test + RANSAC
# Homography + Warping + Fusion.

# This single script runs the complete standard feature-based registration
# pipeline and saves EVERY intermediate output so you can inspect each stage:

#   1. SIFT keypoint detection on both images        -> keypoints1.jpg, keypoints2.jpg
#   2. BFMatcher (k=2) raw matching                   -> printed count
#   3. Lowe's ratio test filtering                    -> all_good_matches.jpg
#   4. RANSAC homography estimation                   -> inlier_matches.jpg
#   5. Warp image1 into image2's frame                -> registered.jpg
#   6. Fuse registered image with reference image     -> fused_blend.jpg, fused_checkerboard.jpg
#   7. A text/console summary of every number          -> summary.txt

# Usage:
#     python full_registration_pipeline.py image1.jpg image2.jpg [--out OUTPUT_DIR]

# image1 = "moving" image (the one that gets warped/aligned)
# image2 = "fixed"  image (the reference frame everything is aligned to)
# """

import argparse
import os
import sys
from datetime import datetime

import cv2
import numpy as np


# --------------------------------------------------------------------------
# Core pipeline
# --------------------------------------------------------------------------

def detect_features(gray, n_features=8000, use_clahe=True):
    """Run CLAHE contrast enhancement (optional) + SIFT detection."""
    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    sift = cv2.SIFT_create(nfeatures=n_features)
    keypoints, descriptors = sift.detectAndCompute(gray, None)
    return keypoints, descriptors


def match_features(des1, des2, ratio=0.7):
    """BFMatcher with k=2 nearest neighbors + Lowe's ratio test."""
    bf = cv2.BFMatcher()
    knn_matches = bf.knnMatch(des1, des2, k=2)

    good_matches = []
    for pair in knn_matches:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < ratio * n.distance:
            good_matches.append(m)

    return knn_matches, good_matches


def estimate_homography(kp1, kp2, good_matches, ransac_threshold=6.0):
    """RANSAC homography estimation between matched keypoints."""
    pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(pts1, pts2, cv2.RANSAC, ransac_threshold)
    return H, mask


def fuse_images(registered, reference, alpha=0.5):
    """
    Two fusion styles, both useful for visually judging alignment quality:

      1. Alpha blend      - simple weighted overlay, easy to eyeball ghosting
      2. Checkerboard mix - alternates tiles from each image, makes any
                             misalignment along tile edges immediately visible
    """
    h, w = reference.shape[:2]
    registered_resized = cv2.resize(registered, (w, h))

    # 1. Alpha blend
    blend = cv2.addWeighted(registered_resized, alpha, reference, 1 - alpha, 0)

    # 2. Checkerboard fusion
    tile = 40
    checkerboard = reference.copy()
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                checkerboard[y:y + tile, x:x + tile] = registered_resized[y:y + tile, x:x + tile]

    return blend, checkerboard


def run_registration(
    image1,
    image2,
    ratio=0.7,
    min_matches=4,
    n_features=8000,
    ransac_threshold=6.0,
    use_clahe=True,
):
    gray1 = cv2.cvtColor(image1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(image2, cv2.COLOR_BGR2GRAY)

    # 1. Feature detection
    kp1, des1 = detect_features(gray1, n_features, use_clahe)
    kp2, des2 = detect_features(gray2, n_features, use_clahe)

    if des1 is None or des2 is None:
        raise RuntimeError("No features detected in one or both images.")

    kp1_vis = cv2.drawKeypoints(
        image1, kp1, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )
    kp2_vis = cv2.drawKeypoints(
        image2, kp2, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS
    )

    # 2 + 3. BFMatcher + ratio test
    knn_matches, good_matches = match_features(des1, des2, ratio)

    if len(good_matches) < min_matches:
        raise RuntimeError(
            f"Not enough good matches ({len(good_matches)} < {min_matches})."
        )

    all_good_vis = cv2.drawMatches(
        image1, kp1, image2, kp2, good_matches, None,
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
    )

    # 4. RANSAC homography
    H, mask = estimate_homography(kp1, kp2, good_matches, ransac_threshold)
    if H is None:
        raise RuntimeError("Homography estimation failed.")

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

    # 5. Warp image1 -> image2 frame
    height, width = image2.shape[:2]
    registered = cv2.warpPerspective(image1, H, (width, height))

    # 6. Fusion
    blend, checkerboard = fuse_images(registered, image2)

    return {
        "keypoints1": kp1, "keypoints2": kp2,
        "keypoints1_count": len(kp1), "keypoints2_count": len(kp2),
        "keypoints1_vis": kp1_vis, "keypoints2_vis": kp2_vis,
        "raw_matches_count": len(knn_matches),
        "good_matches_count": len(good_matches),
        "good_matches_vis": all_good_vis,
        "homography": H,
        "inlier_count": inlier_count,
        "outlier_count": len(outlier_matches),
        "inlier_ratio": inlier_ratio,
        "inlier_vis": inlier_vis,
        "registered": registered,
        "fused_blend": blend,
        "fused_checkerboard": checkerboard,
    }


# --------------------------------------------------------------------------
# CLI entry point
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Full SIFT+RANSAC registration pipeline")
    parser.add_argument("image1", help="Moving image (gets warped/aligned)")
    parser.add_argument("image2", help="Fixed/reference image")
    parser.add_argument("--out", default=None, help="Output directory")
    parser.add_argument("--ratio", type=float, default=0.7, help="Lowe's ratio test threshold")
    parser.add_argument("--n-features", type=int, default=8000, help="Max SIFT keypoints")
    parser.add_argument("--ransac-threshold", type=float, default=6.0, help="RANSAC reprojection threshold (px)")
    parser.add_argument("--no-clahe", action="store_true", help="Disable CLAHE contrast enhancement")
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
        result = run_registration(
            image1, image2,
            ratio=args.ratio,
            n_features=args.n_features,
            ransac_threshold=args.ransac_threshold,
            use_clahe=not args.no_clahe,
        )
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Output folder
    if args.out:
        run_folder = args.out
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_folder = os.path.join(script_dir, "outputs", f"run_{timestamp}")
    os.makedirs(run_folder, exist_ok=True)

    # Save every stage
    cv2.imwrite(os.path.join(run_folder, "keypoints1.jpg"), result["keypoints1_vis"])
    cv2.imwrite(os.path.join(run_folder, "keypoints2.jpg"), result["keypoints2_vis"])
    cv2.imwrite(os.path.join(run_folder, "all_good_matches.jpg"), result["good_matches_vis"])
    cv2.imwrite(os.path.join(run_folder, "inlier_matches.jpg"), result["inlier_vis"])
    cv2.imwrite(os.path.join(run_folder, "registered.jpg"), result["registered"])
    cv2.imwrite(os.path.join(run_folder, "fused_blend.jpg"), result["fused_blend"])
    cv2.imwrite(os.path.join(run_folder, "fused_checkerboard.jpg"), result["fused_checkerboard"])

    # Summary
    summary_lines = [
        "IMAGE REGISTRATION SUMMARY",
        "=" * 40,
        f"Keypoints in image1 (moving) : {result['keypoints1_count']}",
        f"Keypoints in image2 (fixed)  : {result['keypoints2_count']}",
        f"Raw KNN match pairs          : {result['raw_matches_count']}",
        f"Good matches (ratio test)    : {result['good_matches_count']}",
        f"RANSAC inliers               : {result['inlier_count']}",
        f"RANSAC outliers rejected     : {result['outlier_count']}",
        f"Inlier ratio                 : {result['inlier_ratio']:.2f}%",
        "",
        "Homography matrix:",
        str(result["homography"]),
    ]
    summary_text = "\n".join(summary_lines)
    print(summary_text)

    with open(os.path.join(run_folder, "summary.txt"), "w") as f:
        f.write(summary_text)

    print(f"\nAll outputs saved to: {run_folder}")
    print("  - keypoints1.jpg           (SIFT keypoints on image1)")
    print("  - keypoints2.jpg           (SIFT keypoints on image2)")
    print("  - all_good_matches.jpg     (matches passing ratio test)")
    print("  - inlier_matches.jpg       (matches passing RANSAC, green)")
    print("  - registered.jpg           (image1 warped onto image2's frame)")
    print("  - fused_blend.jpg          (alpha-blended overlay)")
    print("  - fused_checkerboard.jpg   (checkerboard overlay)")
    print("  - summary.txt              (all stats above)")


if __name__ == "__main__":
    main()