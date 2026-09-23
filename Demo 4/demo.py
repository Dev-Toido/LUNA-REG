# """
# ORB-based image registration: ORB + BFMatcher (Hamming) + Ratio Test +
# RANSAC Homography + Warping + Fusion.

# Why ORB instead of SIFT
# -----------------------
# - ORB is free/patent-unencumbered, much faster than SIFT (binary descriptors
#   + Hamming distance instead of float descriptors + L2 distance).
# - ORB keypoints are based on FAST corners + BRIEF-style binary descriptors,
#   which respond differently to crater rims/shadow edges than SIFT's
#   gradient-histogram descriptors -- worth trying as an alternative when
#   SIFT's output doesn't visually look right on your images.
# - Works the same way, same pipeline shape, on any 2D image -- normal
#   photos as well as lunar/planetary surface images. (Note: this is still
#   2D image registration; true 3D/volumetric or point-cloud registration
#   needs a different toolchain like Open3D/ICP or ANTsPy, as discussed
#   earlier.)

# Pipeline
# --------
#   1. ORB keypoint + descriptor detection on both images   -> keypoints1.jpg, keypoints2.jpg
#   2. BFMatcher with Hamming distance (correct metric for ORB's binary
#      descriptors -- NOT the L2 BFMatcher used for SIFT)
#   3. Lowe's ratio test on the k=2 matches                  -> all_good_matches.jpg
#   4. RANSAC homography estimation                          -> inlier_matches.jpg
#   5. Warp image1 onto image2's frame                       -> registered.jpg
#   6. Fuse (blend, checkerboard, difference map)            -> fused_*.jpg, difference_map.jpg
#   7. Full summary: total keypoints, total raw matches, good matches,
#      inlier count, inlier ratio, outliers rejected           -> summary.txt

# Usage:
#     python orb_registration.py image1.jpg image2.jpg
#     python orb_registration.py image1.jpg image2.jpg --n-features 20000 --ratio 0.8
# """

import argparse
import os
import sys
from datetime import datetime

import cv2
import numpy as np


def detect_features(gray, n_features=5000, use_clahe=True):
    """CLAHE contrast boost (helps low-contrast lunar/planetary imagery)
    followed by ORB keypoint + descriptor detection."""
    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    orb = cv2.ORB_create(
        nfeatures=n_features,
        scaleFactor=1.2,     # pyramid scale step; lower (e.g. 1.1) = more scale levels, slower, finer
        nlevels=8,           # number of pyramid levels for scale invariance
        edgeThreshold=15,    # border pixels ignored; lower if features near edges are being missed
        fastThreshold=10,    # FAST corner detection sensitivity; lower = more keypoints on low-contrast images
    )
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    return keypoints, descriptors


def match_features(des1, des2, ratio=0.75):
    """
    BFMatcher with Hamming distance -- this is the metric ORB's binary
    descriptors require (crossCheck must be False here since we need k=2
    neighbors per query for the ratio test).
    """
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
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
    pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(pts1, pts2, cv2.RANSAC, ransac_threshold, maxIters=5000, confidence=0.995)
    return H, mask


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


def run_orb_registration(
    image1,
    image2,
    ratio=0.75,
    min_matches=4,
    n_features=5000,
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

    kp1_vis = cv2.drawKeypoints(image1, kp1, None, color=(0, 255, 0), flags=0)
    kp2_vis = cv2.drawKeypoints(image2, kp2, None, color=(0, 255, 0), flags=0)

    # 2-3. BFMatcher (Hamming) + ratio test
    knn_matches, good_matches = match_features(des1, des2, ratio)

    if len(good_matches) < min_matches:
        raise RuntimeError(
            f"Not enough good matches ({len(good_matches)} < {min_matches}). "
            f"Try raising --ratio (e.g. 0.8-0.85), --n-features, or lowering the "
            f"ORB fastThreshold in the code."
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
    h, w = image2.shape[:2]
    registered = cv2.warpPerspective(image1, H, (w, h))

    # 6. Fusion
    blend, checkerboard = fuse_images(registered, image2)
    diff = difference_map(registered, image2)

    return {
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
        "difference_map": diff,
    }


def main():
    parser = argparse.ArgumentParser(description="ORB+RANSAC image registration (2D and lunar/planetary imagery)")
    parser.add_argument("image1", help="Moving image (gets warped/aligned)")
    parser.add_argument("image2", help="Fixed/reference image")
    parser.add_argument("--out", default=None, help="Output directory")
    parser.add_argument("--ratio", type=float, default=0.75, help="Lowe's ratio test threshold")
    parser.add_argument("--n-features", type=int, default=5000, help="Max ORB keypoints (raise for lunar/low-texture images, e.g. 15000-20000)")
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
        result = run_orb_registration(
            image1, image2,
            ratio=args.ratio,
            n_features=args.n_features,
            ransac_threshold=args.ransac_threshold,
            use_clahe=not args.no_clahe,
        )
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.out:
        run_folder = args.out
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_folder = os.path.join(script_dir, "outputs", f"orb_run_{timestamp}")
    os.makedirs(run_folder, exist_ok=True)

    cv2.imwrite(os.path.join(run_folder, "keypoints1.jpg"), result["keypoints1_vis"])
    cv2.imwrite(os.path.join(run_folder, "keypoints2.jpg"), result["keypoints2_vis"])
    cv2.imwrite(os.path.join(run_folder, "all_good_matches.jpg"), result["good_matches_vis"])
    cv2.imwrite(os.path.join(run_folder, "inlier_matches.jpg"), result["inlier_vis"])
    cv2.imwrite(os.path.join(run_folder, "registered.jpg"), result["registered"])
    cv2.imwrite(os.path.join(run_folder, "fused_blend.jpg"), result["fused_blend"])
    cv2.imwrite(os.path.join(run_folder, "fused_checkerboard.jpg"), result["fused_checkerboard"])
    cv2.imwrite(os.path.join(run_folder, "difference_map.jpg"), result["difference_map"])

    summary_lines = [
        "ORB IMAGE REGISTRATION SUMMARY",
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
    print("  - keypoints1.jpg / keypoints2.jpg   (ORB keypoints)")
    print("  - all_good_matches.jpg              (matches passing ratio test)")
    print("  - inlier_matches.jpg                (matches passing RANSAC, green)")
    print("  - registered.jpg                    (image1 warped onto image2's frame)")
    print("  - fused_blend.jpg / fused_checkerboard.jpg")
    print("  - difference_map.jpg                (bright = mismatch, dark = good alignment)")
    print("  - summary.txt")


if __name__ == "__main__":
    main()