import cv2
import numpy as np

def calculate_reprojection_error(source_points, reference_points, H, mask):
    """
    Calculate mean, median, and max reprojection error.
    """
    if H is None or mask is None:
        return float("inf"), float("inf"), float("inf"), []
        
    projected_points = cv2.perspectiveTransform(source_points, H)

    errors = np.linalg.norm(
        projected_points.reshape(-1, 2) - reference_points.reshape(-1, 2),
        axis=1
    )

    inlier_errors = errors[mask.ravel().astype(bool)]

    if len(inlier_errors) == 0:
        return float("inf"), float("inf"), float("inf"), errors

    mean_error = float(np.mean(inlier_errors))
    median_error = float(np.median(inlier_errors))
    max_error = float(np.max(inlier_errors))

    return mean_error, median_error, max_error, errors
