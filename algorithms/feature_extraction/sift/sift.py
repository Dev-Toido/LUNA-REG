import cv2

def detect_sift(image, nfeatures=15000, contrastThreshold=0.03, edgeThreshold=10, sigma=1.6):
    """
    Extract SIFT features from an image.
    
    Args:
        image: The input image (should be grayscale or will be processed internally by OpenCV).
        nfeatures: Number of features to retain.
        contrastThreshold: Contrast threshold for keypoint detection.
        edgeThreshold: Edge threshold for keypoint detection.
        sigma: Sigma of the Gaussian applied to the input image.
        
    Returns:
        keypoints, descriptors
    """
    sift = cv2.SIFT_create(
        nfeatures=nfeatures,
        contrastThreshold=contrastThreshold,
        edgeThreshold=edgeThreshold,
        sigma=sigma
    )

    keypoints, descriptors = sift.detectAndCompute(image, None)
    return keypoints, descriptors
