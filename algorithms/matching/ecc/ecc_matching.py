import cv2
import numpy as np

MOTION_TYPES = {
    "translation": cv2.MOTION_TRANSLATION,
    "euclidean": cv2.MOTION_EUCLIDEAN,   # rotation + translation
    "affine": cv2.MOTION_AFFINE,         # rotation + translation + scale + shear
    "homography": cv2.MOTION_HOMOGRAPHY, # full perspective
}

def build_pyramid(img, levels):
    """Coarse-to-fine pyramid: index 0 = smallest/coarsest, last = full res."""
    pyramid = [img]
    for _ in range(levels - 1):
        pyramid.append(cv2.pyrDown(pyramid[-1]))
    return pyramid[::-1]  # coarsest first

def ecc_register(
    gray1_full,
    gray2_full,
    motion_type="homography",
    pyramid_levels=4,
    n_iterations=5000,
    termination_eps=1e-8,
):
    """
    Align image1 (moving) onto image2 (fixed) using ECC, coarse-to-fine.
    gray1_full and gray2_full should be single-channel images, optionally preprocessed (e.g. CLAHE).
    """
    if gray1_full.shape != gray2_full.shape:
        gray1_full = cv2.resize(gray1_full, (gray2_full.shape[1], gray2_full.shape[0]))

    cv_motion = MOTION_TYPES[motion_type]

    if cv_motion == cv2.MOTION_HOMOGRAPHY:
        warp_matrix = np.eye(3, 3, dtype=np.float32)
    else:
        warp_matrix = np.eye(2, 3, dtype=np.float32)

    pyr1 = build_pyramid(gray1_full, pyramid_levels)
    pyr2 = build_pyramid(gray2_full, pyramid_levels)

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, n_iterations, termination_eps)

    final_cc = None
    for level, (g1, g2) in enumerate(zip(pyr1, pyr2)):
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

    return warp_matrix, final_cc
