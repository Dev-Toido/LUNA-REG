import cv2

def estimate_homography(source_points, reference_points, ransac_threshold=4.0, confidence=0.999, max_iters=20000):
    """
    Estimate homography using RANSAC.
    """
    H, mask = cv2.findHomography(
        source_points,
        reference_points,
        cv2.RANSAC,
        ransac_threshold,
        maxIters=max_iters,
        confidence=confidence
    )
    return H, mask

def extract_inliers(matches, mask):
    """
    Filter matches based on the inlier mask.
    """
    if mask is None:
        return [], None
        
    mask = mask.ravel().astype(bool)
    inlier_matches = [
        match for match, valid in zip(matches, mask) if valid
    ]
    return inlier_matches, mask
