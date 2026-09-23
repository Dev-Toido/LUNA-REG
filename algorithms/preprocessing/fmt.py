import cv2
import numpy as np

def _magnitude_spectrum(gray_float):
    """Windowed FFT magnitude spectrum, log-scaled, shifted to center."""
    h, w = gray_float.shape
    hann = cv2.createHanningWindow((w, h), cv2.CV_32F)
    windowed = gray_float * hann

    f = np.fft.fft2(windowed)
    fshift = np.fft.fftshift(f)
    magnitude = np.abs(fshift)
    magnitude = np.log(magnitude + 1.0)
    return magnitude.astype(np.float32)

def estimate_scale_rotation_fmt(image1_bgr, image2_bgr):
    """
    Estimate the scale ratio and rotation angle of image1 relative to
    image2, purely from their frequency-domain content -- no manual
    resolution input needed.

    Returns: (scale_ratio, rotation_deg, confidence)
      scale_ratio > 1 means image1 is effectively "zoomed in" relative to
      image2 (i.e. image1 covers less ground per pixel -- higher
      resolution / more detail per pixel than image2).
    """
    gray1 = cv2.cvtColor(image1_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray2 = cv2.cvtColor(image2_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # Match sizes so the two magnitude spectra are directly comparable
    h = min(gray1.shape[0], gray2.shape[0])
    w = min(gray1.shape[1], gray2.shape[1])
    gray1 = cv2.resize(gray1, (w, h))
    gray2 = cv2.resize(gray2, (w, h))

    mag1 = _magnitude_spectrum(gray1)
    mag2 = _magnitude_spectrum(gray2)

    center = (w / 2.0, h / 2.0)
    max_radius = min(w, h) / 2.0
    M = min(w, h)  # output log-polar image size

    polar1 = cv2.warpPolar(mag1, (M, M), center, max_radius, cv2.WARP_POLAR_LOG + cv2.INTER_LINEAR)
    polar2 = cv2.warpPolar(mag2, (M, M), center, max_radius, cv2.WARP_POLAR_LOG + cv2.INTER_LINEAR)

    hann_polar = cv2.createHanningWindow((M, M), cv2.CV_32F)
    (dx, dy), response = cv2.phaseCorrelate(polar1 * hann_polar, polar2 * hann_polar)

    # dx (horizontal shift in log-polar space) -> scale ratio
    log_base = np.log(max_radius) / M
    scale_ratio = float(np.exp(dx * log_base))

    # dy (vertical shift in log-polar space) -> rotation angle
    rotation_deg = float(dy * 360.0 / M)

    return scale_ratio, rotation_deg, float(response)
