import cv2

def match_sift(descriptors_moving, descriptors_reference, lowe_ratio=0.75):
    """
    Standard BFMatcher for SIFT with Lowe's ratio test.
    """
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    matches = matcher.knnMatch(descriptors_moving, descriptors_reference, k=2)

    good_matches = []
    for pair in matches:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < lowe_ratio * n.distance:
            good_matches.append(m)

    return matches, good_matches

def match_orb(des1, des2, ratio=0.75):
    """
    BFMatcher with Hamming distance -- this is the metric ORB's binary descriptors require.
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
