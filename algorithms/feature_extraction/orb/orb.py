import cv2

def detect_orb(image, n_features=5000, scaleFactor=1.2, nlevels=8, edgeThreshold=15, fastThreshold=10):
    """
    ORB keypoint and descriptor detection.
    """
    orb = cv2.ORB_create(
        nfeatures=n_features,
        scaleFactor=scaleFactor,
        nlevels=nlevels,
        edgeThreshold=edgeThreshold,
        fastThreshold=fastThreshold,
    )
    keypoints, descriptors = orb.detectAndCompute(image, None)
    return keypoints, descriptors
