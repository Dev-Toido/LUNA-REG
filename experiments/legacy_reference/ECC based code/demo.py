# """
# ECC-based image registration (Enhanced Correlation Coefficient).

# Unlike SIFT/BFMatcher (feature/keypoint-based), this method works directly
# on pixel intensities and iteratively optimizes a transform to maximize
# correlation between the two images. This tends to work better on:

#   - Lunar/planetary surfaces (repetitive crater texture confuses SIFT)
#   - Images with illumination/shadow differences between captures
#   - Low-contrast, low-texture images

# Downsides vs SIFT: needs images to already be roughly aligned/overlapping
# (no huge rotation or scale difference), and is slower since it's an
# iterative optimization rather than a one-shot geometric solve.

# Pipeline:
#   1. Convert both images to grayscale + optional CLAHE contrast boost
#   2. Build an image pyramid (coarse-to-fine) to handle larger misalignment
#   3. Run cv2.findTransformECC at each pyramid level, refining the warp
#   4. Warp image1 onto image2's frame using the final transform
#   5. Fuse (blend + checkerboard) registered and reference image
#   6. Save every stage + a summary of the correlation score achieved

# Usage:
#     python ecc_registration.py image1.png image2.png
#     python ecc_registration.py image1.png image2.png --motion affine
# """

import argparse
import os
import sys
from datetime import datetime

import cv2
import numpy as np


MOTION_TYPES = {
    "translation": cv2.MOTION_TRANSLATION,
    "euclidean": cv2.MOTION_EUCLIDEAN,   # rotation + translation
    "affine": cv2.MOTION_AFFINE,         # rotation + translation + scale + shear
    "homography": cv2.MOTION_HOMOGRAPHY, # full perspective (needs more overlap/less noise)
}


def preprocess(gray, use_clahe=True):
    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
    return gray


def build_pyramid(img, levels):
    """Coarse-to-fine pyramid: index 0 = smallest/coarsest, last = full res."""
    pyramid = [img]
    for _ in range(levels - 1):
        pyramid.append(cv2.pyrDown(pyramid[-1]))
    return pyramid[::-1]  # coarsest first


def ecc_register(
    image1,
    image2,
    motion_type="homography",
    pyramid_levels=4,
    n_iterations=5000,
    termination_eps=1e-8,
    use_clahe=True,
):
    # """
    # Align image1 (moving) onto image2 (fixed) using ECC, coarse-to-fine.

    # motion_type       : "translation" | "euclidean" | "affine" | "homography"
    #                      Start with "affine" if unsure; "homography" needs
    #                      good initial overlap and clean data.
    # pyramid_levels    : more levels = handles larger initial misalignment,
    #                      but slower. 3-5 is typical.
    # n_iterations      : max ECC iterations per pyramid level.
    # termination_eps   : ECC convergence threshold; smaller = more precise
    #                      but slower.
    # """
    gray1_full = preprocess(cv2.cvtColor(image1, cv2.COLOR_BGR2GRAY), use_clahe)
    gray2_full = preprocess(cv2.cvtColor(image2, cv2.COLOR_BGR2GRAY), use_clahe)

    # Resize moving image to match reference size if they differ
    if gray1_full.shape != gray2_full.shape:
        gray1_full = cv2.resize(gray1_full, (gray2_full.shape[1], gray2_full.shape[0]))

    cv_motion = MOTION_TYPES[motion_type]

    # Initialize warp matrix
    if cv_motion == cv2.MOTION_HOMOGRAPHY:
        warp_matrix = np.eye(3, 3, dtype=np.float32)
    else:
        warp_matrix = np.eye(2, 3, dtype=np.float32)

    pyr1 = build_pyramid(gray1_full, pyramid_levels)
    pyr2 = build_pyramid(gray2_full, pyramid_levels)

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, n_iterations, termination_eps)

    final_cc = None
    for level, (g1, g2) in enumerate(zip(pyr1, pyr2)):
        # Scale translation components of warp_matrix for this pyramid level
        if level > 0:
            warp_matrix[0, 2] *= 2
            warp_matrix[1, 2] *= 2

        try:
            cc, warp_matrix = cv2.findTransformECC(
                g2, g1, warp_matrix, cv_motion, criteria, None, 5
            )
            final_cc = cc
        except cv2.error as e:
            raise RuntimeError(
                f"ECC failed to converge at pyramid level {level}: {e}\n"
                f"Try: fewer pyramid levels, a simpler motion_type "
                f"(e.g. 'affine' or 'euclidean'), or looser termination_eps."
            )

    # Apply final warp at full resolution
    h, w = gray2_full.shape
    if cv_motion == cv2.MOTION_HOMOGRAPHY:
        registered = cv2.warpPerspective(
            image1, warp_matrix, (w, h),
            flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
        )
    else:
        registered = cv2.warpAffine(
            image1, warp_matrix, (w, h),
            flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
        )

    return {
        "registered": registered,
        "warp_matrix": warp_matrix,
        "correlation_coefficient": final_cc,
        "motion_type": motion_type,
    }


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
    """Absolute difference image — bright areas = misalignment/mismatch."""
    h, w = reference.shape[:2]
    registered_resized = cv2.resize(registered, (w, h))
    gray_r = cv2.cvtColor(registered_resized, cv2.COLOR_BGR2GRAY)
    gray_ref = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gray_r, gray_ref)
    diff_color = cv2.applyColorMap(diff, cv2.COLORMAP_JET)
    return diff_color


def main():
    parser = argparse.ArgumentParser(description="ECC-based (intensity) image registration")
    parser.add_argument("image1", help="Moving image (gets warped/aligned)")
    parser.add_argument("image2", help="Fixed/reference image")
    parser.add_argument("--out", default=None, help="Output directory")
    parser.add_argument(
        "--motion", choices=list(MOTION_TYPES.keys()), default="homography",
        help="Transform model (default: homography). Try 'affine' or "
             "'euclidean' first if homography fails to converge.",
    )
    parser.add_argument("--pyramid-levels", type=int, default=4)
    parser.add_argument("--iterations", type=int, default=5000)
    parser.add_argument("--eps", type=float, default=1e-8)
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
        result = ecc_register(
            image1, image2,
            motion_type=args.motion,
            pyramid_levels=args.pyramid_levels,
            n_iterations=args.iterations,
            termination_eps=args.eps,
            use_clahe=not args.no_clahe,
        )
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)

    registered = result["registered"]
    blend, checkerboard = fuse_images(registered, image2)
    diff = difference_map(registered, image2)

    # Output folder
    if args.out:
        run_folder = args.out
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_folder = os.path.join(script_dir, "outputs", f"ecc_run_{timestamp}")
    os.makedirs(run_folder, exist_ok=True)

    cv2.imwrite(os.path.join(run_folder, "registered.jpg"), registered)
    cv2.imwrite(os.path.join(run_folder, "fused_blend.jpg"), blend)
    cv2.imwrite(os.path.join(run_folder, "fused_checkerboard.jpg"), checkerboard)
    cv2.imwrite(os.path.join(run_folder, "difference_map.jpg"), diff)

    summary_lines = [
        "ECC IMAGE REGISTRATION SUMMARY",
        "=" * 40,
        f"Motion model              : {result['motion_type']}",
        f"Final correlation coeff.  : {result['correlation_coefficient']:.6f}  (1.0 = perfect match)",
        "",
        "Warp matrix:",
        str(result["warp_matrix"]),
    ]
    summary_text = "\n".join(summary_lines)
    print(summary_text)

    with open(os.path.join(run_folder, "summary.txt"), "w") as f:
        f.write(summary_text)

    print(f"\nAll outputs saved to: {run_folder}")
    print("  - registered.jpg           (image1 warped onto image2's frame)")
    print("  - fused_blend.jpg          (alpha-blended overlay)")
    print("  - fused_checkerboard.jpg   (checkerboard overlay)")
    print("  - difference_map.jpg       (bright = mismatch, dark = good alignment)")
    print("  - summary.txt              (correlation score + warp matrix)")


if __name__ == "__main__":
    main()