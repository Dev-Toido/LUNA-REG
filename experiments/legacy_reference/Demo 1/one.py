
import cv2
import numpy as np

# ---------------------------------------------------------------------------
# 1. FEATURE-BASED REGISTRATION (ORB + RANSAC)
# ---------------------------------------------------------------------------
def register_orb(fixed, moving, max_features=2000, good_match_ratio=0.75):
    """
    Feature-based registration using ORB descriptors + BFMatcher + RANSAC.
    Fast, free (no patents), good default choice for rigid/affine alignment.
    """
    gray_fixed = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY) if fixed.ndim == 3 else fixed
    gray_moving = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY) if moving.ndim == 3 else moving

    orb = cv2.ORB_create(max_features)
    kp1, des1 = orb.detectAndCompute(gray_fixed, None)
    kp2, des2 = orb.detectAndCompute(gray_moving, None)

    if des1 is None or des2 is None:
        raise ValueError("Not enough features detected in one of the images.")

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(des2, des1, k=2)  # moving -> fixed

    # Lowe's ratio test
    good = [m for m, n in matches if m.distance < good_match_ratio * n.distance]

    if len(good) < 4:
        raise ValueError("Not enough good matches to compute homography.")

    src_pts = np.float32([kp2[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp1[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, ransacReprojThreshold=5.0)

    h, w = fixed.shape[:2]
    registered = cv2.warpPerspective(moving, H, (w, h))

    return registered, H


# # ---------------------------------------------------------------------------
# # 2. FEATURE-BASED REGISTRATION (SIFT + RANSAC) - more accurate, a bit slower
# # ---------------------------------------------------------------------------
def register_sift(fixed, moving, good_match_ratio=0.7):
    """
    SIFT-based registration. More robust to scale/rotation than ORB,
    patent has expired so it's free to use in modern OpenCV (>=4.4).
    """
    gray_fixed = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY) if fixed.ndim == 3 else fixed
    gray_moving = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY) if moving.ndim == 3 else moving

    sift = cv2.SIFT_create()
    kp1, des1 = sift.detectAndCompute(gray_fixed, None)
    kp2, des2 = sift.detectAndCompute(gray_moving, None)

    flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=50))
    matches = flann.knnMatch(des2, des1, k=2)

    good = [m for m, n in matches if m.distance < good_match_ratio * n.distance]
    if len(good) < 4:
        raise ValueError("Not enough good matches to compute homography.")

    src_pts = np.float32([kp2[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp1[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

    h, w = fixed.shape[:2]
    registered = cv2.warpPerspective(moving, H, (w, h))

    return registered, H


# ---------------------------------------------------------------------------
# 3. INTENSITY-BASED REGISTRATION (ECC - Enhanced Correlation Coefficient)
# ---------------------------------------------------------------------------
def register_ecc(fixed, moving, warp_mode=cv2.MOTION_AFFINE,
                  n_iterations=5000, termination_eps=1e-8):
    """
    Intensity-based registration using ECC maximization.
    Good when images lack distinct features but are similar in structure
    (e.g., near-identical frames, illumination changes).
    warp_mode options: MOTION_TRANSLATION, MOTION_EUCLIDEAN,
                        MOTION_AFFINE, MOTION_HOMOGRAPHY
    """
    gray_fixed = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY) if fixed.ndim == 3 else fixed
    gray_moving = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY) if moving.ndim == 3 else moving

    if warp_mode == cv2.MOTION_HOMOGRAPHY:
        warp_matrix = np.eye(3, 3, dtype=np.float32)
    else:
        warp_matrix = np.eye(2, 3, dtype=np.float32)

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
                n_iterations, termination_eps)

    _, warp_matrix = cv2.findTransformECC(
        gray_fixed, gray_moving, warp_matrix, warp_mode, criteria
    )

    h, w = fixed.shape[:2]
    if warp_mode == cv2.MOTION_HOMOGRAPHY:
        registered = cv2.warpPerspective(moving, warp_matrix, (w, h),
                                          flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
    else:
        registered = cv2.warpAffine(moving, warp_matrix, (w, h),
                                     flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)

    return registered, warp_matrix


# ---------------------------------------------------------------------------
# 4. PHASE CORRELATION (fast, for pure translation)
# ---------------------------------------------------------------------------
def register_phase_correlation(fixed, moving):
    """
    Fourier-based phase correlation. Very fast, robust to noise,
    but only estimates translation (dx, dy) - no rotation/scale.
    """
    gray_fixed = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY) if fixed.ndim == 3 else fixed
    gray_moving = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY) if moving.ndim == 3 else moving

    gray_fixed = np.float32(gray_fixed)
    gray_moving = np.float32(gray_moving)

    (dx, dy), response = cv2.phaseCorrelate(gray_fixed, gray_moving)

    h, w = fixed.shape[:2]
    M = np.float32([[1, 0, -dx], [0, 1, -dy]])
    registered = cv2.warpAffine(moving, M, (w, h))

    return registered, (dx, dy, response)


# ---------------------------------------------------------------------------
# 5. OPTICAL FLOW (Lucas-Kanade) - for small/local deformations
# ---------------------------------------------------------------------------
def register_optical_flow(fixed, moving):
    """
    Dense optical flow (Farneback) based registration.
    Useful for small, locally varying displacements (non-rigid-ish).
    """
    gray_fixed = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY) if fixed.ndim == 3 else fixed
    gray_moving = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY) if moving.ndim == 3 else moving

    flow = cv2.calcOpticalFlowFarneback(
        gray_fixed, gray_moving, None,
        pyr_scale=0.5, levels=3, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2, flags=0
    )

    h, w = fixed.shape[:2]
    flow_map = np.column_stack((np.tile(np.arange(w), h), np.repeat(np.arange(h), w)))
    flow_map = flow_map.reshape(h, w, 2).astype(np.float32)
    flow_map += flow

    registered = cv2.remap(moving, flow_map[..., 0], flow_map[..., 1], cv2.INTER_LINEAR)
    return registered, flow


# ---------------------------------------------------------------------------
# Example usage
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    fixed_img = cv2.imread("Screenshot 2026-09-17 131255.png")
    moving_img = cv2.imread("Screenshot 2026-09-17 131312.png")

    if fixed_img is None or moving_img is None:
        print("Place 'Screenshot 2026-09-17 131255.png' and 'Screenshot 2026-09-17 131312.png' in this folder to test.")
    else:
        # Pick whichever suits your images:
        registered, H = register_orb(fixed_img, moving_img)
        cv2.imwrite("registered_orb.jpg", registered)
        print("ORB+RANSAC homography:\n", H)

        registered_ecc, warp = register_ecc(fixed_img, moving_img)
        cv2.imwrite("registered_ecc.jpg", registered_ecc)
        print("ECC warp matrix:\n", warp)