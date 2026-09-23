import cv2
import numpy as np

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
