import cv2
import numpy as np

def grayscale(image):
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

def clahe_representation(image):
    gray = grayscale(image)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    out = clahe.apply(gray)
    return cv2.GaussianBlur(out, (3, 3), 0)

def scharr_representation(image):
    """
    Illumination-robust structural representation:
    CLAHE -> Scharr gx/gy -> gradient magnitude.
    """
    base = clahe_representation(image)
    gx = cv2.Scharr(base, cv2.CV_32F, 1, 0)
    gy = cv2.Scharr(base, cv2.CV_32F, 0, 1)
    mag = cv2.magnitude(gx, gy)
    mag = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX)
    return mag.astype(np.uint8)

def phase_orientation_representation(image):
    """
    A bank of Gabor filters approximates local phase/orientation structure.
    For each pixel we retain the orientation with the strongest magnitude.
    This reduces dependence on absolute brightness.
    """
    gray = clahe_representation(image).astype(np.float32) / 255.0

    orientations = 8
    responses = []

    for i in range(orientations):
        theta = i * np.pi / orientations
        kernel = cv2.getGaborKernel(
            (31, 31),
            sigma=4.5,
            theta=theta,
            lambd=10.0,
            gamma=0.5,
            psi=np.pi / 2,
            ktype=cv2.CV_32F
        )
        response = cv2.filter2D(gray, cv2.CV_32F, kernel)
        responses.append(np.abs(response))

    stack = np.stack(responses, axis=0)
    max_response = np.max(stack, axis=0)
    orientation_index = np.argmax(stack, axis=0).astype(np.float32)

    ori = orientation_index / max(1, orientations - 1)
    strength = cv2.normalize(max_response, None, 0.0, 1.0, cv2.NORM_MINMAX)
    combined = 0.65 * ori + 0.35 * strength
    return np.clip(combined * 255.0, 0, 255).astype(np.uint8)
