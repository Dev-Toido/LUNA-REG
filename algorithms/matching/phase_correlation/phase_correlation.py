import cv2
import numpy as np

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

    return registered, M, (dx, dy, response)
