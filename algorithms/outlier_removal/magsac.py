import cv2

def run_magsac(source_points, reference_points, ransac_threshold=4.0, confidence=0.999, max_iters=20000):
    """
    OpenCV's USAC_MAGSAC implements the MAGSAC++ robust estimation approach.
    """
    H, mask = cv2.findHomography(
        source_points,
        reference_points,
        cv2.USAC_MAGSAC,
        ransac_threshold,
        maxIters=max_iters,
        confidence=confidence
    )
    return H, mask
