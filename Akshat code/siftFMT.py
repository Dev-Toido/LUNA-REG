# """
# Unified lunar image registration script.

# Combines:
#   - Your original SIFT + BFMatcher + RANSAC script
#   - The FMT (Fourier-Mellin Transform) + Pyramid + SuperPoint + LightGlue script

# into ONE script with a single switch (FEATURE_METHOD below) to choose which
# feature detector/matcher backend runs. Everything else -- Fourier-Mellin
# scale/rotation estimation, pyramid-based resolution matching, triangle
# verification, RANSAC, spatial coverage, reprojection error, warping,
# overlay, difference map, and the final report -- is SHARED and runs
# identically regardless of which method you pick.

# FEATURE_METHOD = "sift"
#     Uses SIFT + BFMatcher + Lowe's ratio test (your original script).
#     No torch/GPU required. Faster to set up, works everywhere.

# FEATURE_METHOD = "superpoint_lightglue"
#     Uses SuperPoint (learned keypoints) + LightGlue (learned matcher).
#     Requires: pip install torch  and
#               pip install git+https://github.com/cvg/LightGlue.git
#     Generally more robust to illumination differences and repetitive
#     lunar terrain, per the earlier discussion.

# Usage:
#     python unified_registration.py
#     (file picker dialogs prompt for the reference and moving image)
# """

import cv2
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple
import tkinter as tk
from tkinter import filedialog


# ============================================================
# CONFIGURATION
# ============================================================

FEATURE_METHOD = "sift"   # "sift"  or  "superpoint_lightglue"

# --- SIFT settings (used only if FEATURE_METHOD == "sift") ---
SIFT_FEATURES = 15000
LOWE_RATIO = 0.75

# --- SuperPoint / LightGlue settings (used only if FEATURE_METHOD == "superpoint_lightglue") ---
MAX_KEYPOINTS = 4096
MIN_MATCH_CONFIDENCE = 0.0

# --- Fourier-Mellin automatic scale/rotation estimate ---
FMT_MIN_CONFIDENCE = 0.05
FALLBACK_SOURCE_RESOLUTION_M = 1.0
FALLBACK_REFERENCE_RESOLUTION_M = 1.0

# --- Pyramid ---
PYRAMID_SCALE_FACTOR = 0.5
PYRAMID_MAX_LEVELS_CAP = 6

# --- RANSAC ---
RANSAC_THRESHOLD = 4.0
RANSAC_CONFIDENCE = 0.999
RANSAC_MAX_ITERS = 20000

MIN_MATCHES = 10
MIN_INLIERS = 8

# --- Triangle verification ---
TRIANGLE_K_NEIGHBORS = 6
TRIANGLE_MIN_SUPPORT = 1
TRIANGLE_MAX_SIDE_RATIO_ERROR = 0.18
TRIANGLE_MAX_ANGLE_ERROR_DEG = 12.0
TRIANGLE_MIN_AREA = 20.0
TRIANGLE_MAX_CANDIDATES = 1200

GRID_ROWS = 6
GRID_COLS = 6

MAX_DISPLAY_WIDTH = 1400
MAX_DISPLAY_HEIGHT = 850

OUTPUT_DIR = Path("unified_registration_output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# SELECT / LOAD IMAGE
# ============================================================

def select_image(title):
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title=title,
        filetypes=[("Image Files", "*.png *.jpg *.jpeg *.tif *.tiff"), ("All Files", "*.*")],
    )
    root.destroy()
    if not path:
        raise RuntimeError(f"No image selected: {title}")
    return path


def load_image(path):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not load image:\n{path}")
    return image


# ============================================================
# FOURIER-MELLIN TRANSFORM -- automatic scale + rotation estimate
# (works identically regardless of FEATURE_METHOD, pure OpenCV/NumPy)
# ============================================================

def _magnitude_spectrum(gray_float):
    h, w = gray_float.shape
    hann = cv2.createHanningWindow((w, h), cv2.CV_32F)
    windowed = gray_float * hann
    f = np.fft.fft2(windowed)
    fshift = np.fft.fftshift(f)
    magnitude = np.abs(fshift)
    magnitude = np.log(magnitude + 1.0)
    return magnitude.astype(np.float32)


def estimate_scale_rotation_fmt(image1_bgr, image2_bgr):
    gray1 = cv2.cvtColor(image1_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray2 = cv2.cvtColor(image2_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

    h = min(gray1.shape[0], gray2.shape[0])
    w = min(gray1.shape[1], gray2.shape[1])
    gray1 = cv2.resize(gray1, (w, h))
    gray2 = cv2.resize(gray2, (w, h))

    mag1 = _magnitude_spectrum(gray1)
    mag2 = _magnitude_spectrum(gray2)

    center = (w / 2.0, h / 2.0)
    max_radius = min(w, h) / 2.0
    M = min(w, h)

    polar1 = cv2.warpPolar(mag1, (M, M), center, max_radius, cv2.WARP_POLAR_LOG + cv2.INTER_LINEAR)
    polar2 = cv2.warpPolar(mag2, (M, M), center, max_radius, cv2.WARP_POLAR_LOG + cv2.INTER_LINEAR)

    hann_polar = cv2.createHanningWindow((M, M), cv2.CV_32F)
    (dx, dy), response = cv2.phaseCorrelate(polar1 * hann_polar, polar2 * hann_polar)

    log_base = np.log(max_radius) / M
    scale_ratio = float(np.exp(dx * log_base))
    rotation_deg = float(dy * 360.0 / M)

    return scale_ratio, rotation_deg, float(response)


# ============================================================
# PYRAMID BUILDER  (shared, works for both methods)
# ============================================================

@dataclass
class ImagePyramid:
    levels: List[np.ndarray]
    scale_factors: List[float]
    original_shape: Tuple[int, int]


class PyramidBuilder:
    def build(self, image, n_levels=4, scale_factor=0.5) -> ImagePyramid:
        levels = [image.copy()]
        scale_factors = [1.0]
        current_img = image.copy()

        for i in range(1, n_levels):
            sigma = 1.0 / (2.0 * scale_factor)
            ksize = int(2 * round(3 * sigma) + 1)
            if ksize % 2 == 0:
                ksize += 1

            if current_img.ndim == 2:
                blurred = cv2.GaussianBlur(current_img.astype(np.float32), (ksize, ksize), sigma)
                h, w = current_img.shape
                new_w = max(1, int(round(w * scale_factor)))
                new_h = max(1, int(round(h * scale_factor)))
                resized = cv2.resize(blurred, (new_w, new_h), interpolation=cv2.INTER_AREA)
                next_level = resized.astype(image.dtype)
            else:
                blurred = cv2.GaussianBlur(current_img.astype(np.float32), (ksize, ksize), sigma)
                h, w, b = current_img.shape
                new_w = max(1, int(round(w * scale_factor)))
                new_h = max(1, int(round(h * scale_factor)))
                resized = cv2.resize(blurred, (new_w, new_h), interpolation=cv2.INTER_AREA)
                if resized.ndim == 2:
                    resized = np.expand_dims(resized, axis=-1)
                next_level = resized.astype(image.dtype)

            levels.append(next_level)
            scale_factors.append(scale_factors[-1] * scale_factor)
            current_img = next_level

        return ImagePyramid(levels=levels, scale_factors=scale_factors, original_shape=image.shape)

    def compute_levels_for_scale_ratio(self, source_resolution, reference_resolution, scale_factor=0.5) -> int:
        ratio = max(source_resolution, reference_resolution) / min(source_resolution, reference_resolution)
        if ratio <= 1.0:
            return 1
        levels = int(np.ceil(np.log(ratio) / np.log(1.0 / scale_factor))) + 1
        return max(1, levels)

    def find_matching_levels(self, source_pyramid, reference_pyramid,
                              source_resolution, reference_resolution) -> List[Tuple[int, int]]:
        matching_pairs = []
        for r_idx, r_factor in enumerate(reference_pyramid.scale_factors):
            ref_eff_res = reference_resolution / r_factor
            best_s_idx = 0
            min_diff = float("inf")
            for s_idx, s_factor in enumerate(source_pyramid.scale_factors):
                src_eff_res = source_resolution / s_factor
                diff = abs(src_eff_res - ref_eff_res)
                if diff < min_diff:
                    min_diff = diff
                    best_s_idx = s_idx

            src_eff_res = source_resolution / source_pyramid.scale_factors[best_s_idx]
            ratio = max(src_eff_res, ref_eff_res) / min(src_eff_res, ref_eff_res)

            if ratio < 2.0:
                matching_pairs.append((best_s_idx, r_idx))

        return matching_pairs


# ============================================================
# SIFT BACKEND  (used when FEATURE_METHOD == "sift")
# ============================================================

def preprocess_image_sift(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
    return enhanced


def detect_sift(image_gray):
    sift = cv2.SIFT_create(nfeatures=SIFT_FEATURES, contrastThreshold=0.03, edgeThreshold=10, sigma=1.6)
    keypoints, descriptors = sift.detectAndCompute(image_gray, None)
    return keypoints, descriptors


def match_sift(descriptors_moving, descriptors_reference):
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    matches = matcher.knnMatch(descriptors_moving, descriptors_reference, k=2)
    good_matches = []
    for pair in matches:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < LOWE_RATIO * n.distance:
            good_matches.append(m)
    return matches, good_matches


def run_sift_backend(moving_level_img, reference_level_img, source_rescale, reference_rescale):
    moving_gray = preprocess_image_sift(moving_level_img)
    reference_gray = preprocess_image_sift(reference_level_img)

    kp_m, desc_m = detect_sift(moving_gray)
    kp_r, desc_r = detect_sift(reference_gray)

    if desc_m is None or desc_r is None:
        raise RuntimeError("SIFT could not generate descriptors.")

    # Rescale keypoints from pyramid-level space to FULL resolution space
    kp_moving = [cv2.KeyPoint(float(kp.pt[0] * source_rescale), float(kp.pt[1] * source_rescale),
                               kp.size, kp.angle, kp.response, kp.octave, kp.class_id) for kp in kp_m]
    kp_reference = [cv2.KeyPoint(float(kp.pt[0] * reference_rescale), float(kp.pt[1] * reference_rescale),
                                  kp.size, kp.angle, kp.response, kp.octave, kp.class_id) for kp in kp_r]

    all_matches, good_matches = match_sift(desc_m, desc_r)
    total_candidates = len(all_matches)

    return kp_moving, kp_reference, good_matches, total_candidates


# ============================================================
# SUPERPOINT + LIGHTGLUE BACKEND  (used when FEATURE_METHOD == "superpoint_lightglue")
# Imports are LAZY (only loaded if this method is selected), so you don't
# need torch/lightglue installed at all when using FEATURE_METHOD = "sift".
# ============================================================

_sp_lg_models = {"extractor": None, "matcher": None, "device": None}


def _load_superpoint_lightglue():
    try:
        import torch
        from lightglue import LightGlue, SuperPoint
    except ImportError as e:
        raise RuntimeError(
            "FEATURE_METHOD is 'superpoint_lightglue' but torch/lightglue are not installed.\n"
            "Run: pip install torch\n"
            "     pip install git+https://github.com/cvg/LightGlue.git\n"
            f"(Original error: {e})"
        )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    extractor = SuperPoint(max_num_keypoints=MAX_KEYPOINTS).eval().to(device)
    matcher = LightGlue(features="superpoint").eval().to(device)
    _sp_lg_models["extractor"] = extractor
    _sp_lg_models["matcher"] = matcher
    _sp_lg_models["device"] = device
    return extractor, matcher, device


def _cv2_to_tensor(image_bgr, device):
    import torch
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_rgb).permute(2, 0, 1)
    return tensor.to(device)


def _detect_superpoint(extractor, image_bgr, device):
    import torch
    tensor = _cv2_to_tensor(image_bgr, device)
    with torch.no_grad():
        feats = extractor.extract(tensor)
    return feats


def _feats_to_cv2_keypoints(feats, rescale=1.0):
    kps = feats["keypoints"][0].cpu().numpy()
    scores = feats["keypoint_scores"][0].cpu().numpy()
    return [cv2.KeyPoint(float(x * rescale), float(y * rescale), size=6, response=float(s))
            for (x, y), s in zip(kps, scores)]


def _match_lightglue(matcher, feats_moving, feats_reference):
    import torch
    from lightglue.utils import rbd
    with torch.no_grad():
        result = matcher({"image0": feats_moving, "image1": feats_reference})
    _, _, result = [rbd(x) for x in [feats_moving, feats_reference, result]]
    match_indices = result["matches"].cpu().numpy()
    match_scores = result["scores"].cpu().numpy()

    good_matches = []
    for (i, j), score in zip(match_indices, match_scores):
        if score < MIN_MATCH_CONFIDENCE:
            continue
        good_matches.append(cv2.DMatch(_queryIdx=int(i), _trainIdx=int(j), _imgIdx=0, _distance=float(1.0 - score)))

    return len(match_indices), good_matches


def run_superpoint_lightglue_backend(moving_level_img, reference_level_img, source_rescale, reference_rescale):
    extractor = _sp_lg_models["extractor"]
    matcher = _sp_lg_models["matcher"]
    device = _sp_lg_models["device"]
    if extractor is None:
        extractor, matcher, device = _load_superpoint_lightglue()

    feats_reference = _detect_superpoint(extractor, reference_level_img, device)
    feats_moving = _detect_superpoint(extractor, moving_level_img, device)

    kp_reference = _feats_to_cv2_keypoints(feats_reference, rescale=reference_rescale)
    kp_moving = _feats_to_cv2_keypoints(feats_moving, rescale=source_rescale)

    total_candidates, good_matches = _match_lightglue(matcher, feats_moving, feats_reference)

    return kp_moving, kp_reference, good_matches, total_candidates


# ============================================================
# SHARED: matches -> coordinates
# ============================================================

def get_match_points(matches, kp_moving, kp_reference):
    source_points = np.float32([kp_moving[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    reference_points = np.float32([kp_reference[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    return source_points, reference_points


# ============================================================
# SHARED: TRIANGLE VERIFICATION
# ============================================================

def _triangle_signature(points):
    p = np.asarray(points, dtype=np.float64).reshape(3, 2)
    v1 = p[1] - p[0]
    v2 = p[2] - p[0]
    area = abs(v1[0] * v2[1] - v1[1] * v2[0]) * 0.5
    if area < TRIANGLE_MIN_AREA:
        return None
    sides = np.array([np.linalg.norm(p[0] - p[1]), np.linalg.norm(p[1] - p[2]), np.linalg.norm(p[2] - p[0])])
    if np.min(sides) < 1e-6:
        return None
    sides_sorted = np.sort(sides)
    side_ratios = sides_sorted[:2] / sides_sorted[2]

    def angle(a, b, c):
        v1 = a - b
        v2 = c - b
        denom = np.linalg.norm(v1) * np.linalg.norm(v2)
        if denom < 1e-12:
            return 0.0
        cosv = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
        return np.degrees(np.arccos(cosv))

    angles = np.sort(np.array([angle(p[1], p[0], p[2]), angle(p[0], p[1], p[2]), angle(p[0], p[2], p[1])]))
    return side_ratios, angles


def triangular_correspondence_filter(matches, kp_moving, kp_reference):
    if len(matches) < 6:
        return matches, np.ones(len(matches), dtype=np.int32)

    indexed = sorted(enumerate(matches), key=lambda item: item[1].distance)
    indexed = indexed[:TRIANGLE_MAX_CANDIDATES]
    original_indices = [item[0] for item in indexed]
    working_matches = [item[1] for item in indexed]

    moving_pts = np.float64([kp_moving[m.queryIdx].pt for m in working_matches])
    reference_pts = np.float64([kp_reference[m.trainIdx].pt for m in working_matches])

    n = len(working_matches)
    support = np.zeros(n, dtype=np.int32)
    diff = moving_pts[:, None, :] - moving_pts[None, :, :]
    dist2 = np.sum(diff * diff, axis=2)
    tested_triangles = set()

    for i in range(n):
        order = np.argsort(dist2[i])
        neighbors = [int(j) for j in order if j != i][:TRIANGLE_K_NEIGHBORS]
        for a in range(len(neighbors)):
            for b in range(a + 1, len(neighbors)):
                j, k = neighbors[a], neighbors[b]
                tri = tuple(sorted((i, j, k)))
                if tri in tested_triangles:
                    continue
                tested_triangles.add(tri)
                sig_m = _triangle_signature(moving_pts[list(tri)])
                sig_r = _triangle_signature(reference_pts[list(tri)])
                if sig_m is None or sig_r is None:
                    continue
                ratios_m, angles_m = sig_m
                ratios_r, angles_r = sig_r
                side_error = float(np.max(np.abs(ratios_m - ratios_r)))
                angle_error = float(np.max(np.abs(angles_m - angles_r)))
                if side_error <= TRIANGLE_MAX_SIDE_RATIO_ERROR and angle_error <= TRIANGLE_MAX_ANGLE_ERROR_DEG:
                    support[list(tri)] += 1

    keep_local = support >= TRIANGLE_MIN_SUPPORT
    filtered_matches = [working_matches[i] for i in range(n) if keep_local[i]]

    if len(filtered_matches) < MIN_MATCHES:
        print("Triangle verification retained too few matches; falling back to pre-triangle matches.")
        return matches, np.zeros(len(matches), dtype=np.int32)

    full_support = np.zeros(len(matches), dtype=np.int32)
    for local_i, original_i in enumerate(original_indices):
        full_support[original_i] = support[local_i]

    return filtered_matches, full_support


# ============================================================
# SHARED: RANSAC / INLIERS / REPROJECTION ERROR / COVERAGE
# ============================================================

def estimate_homography(source_points, reference_points):
    H, mask = cv2.findHomography(source_points, reference_points, cv2.RANSAC,
                                  RANSAC_THRESHOLD, maxIters=RANSAC_MAX_ITERS, confidence=RANSAC_CONFIDENCE)
    return H, mask


def extract_inliers(matches, mask):
    mask = mask.ravel().astype(bool)
    inlier_matches = [m for m, valid in zip(matches, mask) if valid]
    return inlier_matches, mask


def calculate_reprojection_error(source_points, reference_points, H, mask):
    projected_points = cv2.perspectiveTransform(source_points, H)
    errors = np.linalg.norm(projected_points.reshape(-1, 2) - reference_points.reshape(-1, 2), axis=1)
    inlier_errors = errors[mask]
    if len(inlier_errors) == 0:
        return float("inf"), float("inf"), float("inf"), errors
    return float(np.mean(inlier_errors)), float(np.median(inlier_errors)), float(np.max(inlier_errors)), errors


def calculate_spatial_coverage(points, image_shape):
    height, width = image_shape[:2]
    occupied_cells = set()
    for x, y in points.reshape(-1, 2):
        col = min(int(x / (width / GRID_COLS)), GRID_COLS - 1)
        row = min(int(y / (height / GRID_ROWS)), GRID_ROWS - 1)
        occupied_cells.add((row, col))
    coverage = (len(occupied_cells) / (GRID_ROWS * GRID_COLS)) * 100.0
    return coverage, occupied_cells


def draw_coverage_map(image, occupied_cells):
    output = image.copy()
    height, width = output.shape[:2]
    cell_width, cell_height = width / GRID_COLS, height / GRID_ROWS
    for row in range(1, GRID_ROWS):
        y = int(row * cell_height)
        cv2.line(output, (0, y), (width, y), (255, 255, 255), 2)
    for col in range(1, GRID_COLS):
        x = int(col * cell_width)
        cv2.line(output, (x, 0), (x, height), (255, 255, 255), 2)
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            x, y = int(col * cell_width), int(row * cell_height)
            text = "INLIER" if (row, col) in occupied_cells else "-"
            cv2.putText(output, text, (x + 10, y + 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return output


def resize_for_display(image):
    height, width = image.shape[:2]
    scale = min(MAX_DISPLAY_WIDTH / width, MAX_DISPLAY_HEIGHT / height, 1.0)
    if scale >= 1.0:
        return image
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


# ============================================================
# MAIN PROGRAM
# ============================================================

print("\n===========================================")
print(f"  UNIFIED REGISTRATION  (method = {FEATURE_METHOD})")
print("===========================================")

print("\n[1] Select REFERENCE image...")
reference_path = select_image("Select Reference Image")
print("Reference:", reference_path)

print("\n[2] Select MOVING image...")
moving_path = select_image("Select Moving Image")
print("Moving:", moving_path)

reference_full = load_image(reference_path)
moving_full = load_image(moving_path)
print("\nReference shape:", reference_full.shape)
print("Moving shape:", moving_full.shape)

# --- Fourier-Mellin: automatic scale + rotation estimate ---
print("\n[3] Estimating scale/rotation with Fourier-Mellin Transform...")
scale_ratio, rotation_deg, fmt_confidence = estimate_scale_rotation_fmt(moving_full, reference_full)
print(f"FMT estimated scale ratio (moving relative to reference): {scale_ratio:.4f}")
print(f"FMT estimated rotation: {rotation_deg:.2f} degrees")
print(f"FMT phase-correlation confidence: {fmt_confidence:.4f}")

if fmt_confidence < FMT_MIN_CONFIDENCE:
    print("FMT confidence too low -- falling back to manual/default resolution values.")
    source_resolution = FALLBACK_SOURCE_RESOLUTION_M
    reference_resolution = FALLBACK_REFERENCE_RESOLUTION_M
else:
    reference_resolution = 1.0
    source_resolution = 1.0 / max(scale_ratio, 1e-6)

print(f"Using resolutions -> source: {source_resolution:.4f}, reference: {reference_resolution:.4f}")

# --- Build pyramids ---
print("\n[4] Building pyramids and finding matching resolution levels...")
builder = PyramidBuilder()

n_levels = builder.compute_levels_for_scale_ratio(source_resolution, reference_resolution, PYRAMID_SCALE_FACTOR)
n_levels = min(n_levels, PYRAMID_MAX_LEVELS_CAP)
print(f"Resolution ratio implies {n_levels} pyramid level(s) (capped at {PYRAMID_MAX_LEVELS_CAP}).")

source_pyramid = builder.build(moving_full, n_levels=n_levels, scale_factor=PYRAMID_SCALE_FACTOR)
reference_pyramid = builder.build(reference_full, n_levels=n_levels, scale_factor=PYRAMID_SCALE_FACTOR)

matching_pairs = builder.find_matching_levels(source_pyramid, reference_pyramid, source_resolution, reference_resolution)

if matching_pairs:
    source_level_idx, reference_level_idx = matching_pairs[0]
    print(f"Using matched pyramid levels -> source level {source_level_idx}, reference level {reference_level_idx}")
else:
    source_level_idx, reference_level_idx = 0, 0
    print("No matching levels found within 2x ratio; falling back to full resolution (level 0) for both.")

moving_level_img = source_pyramid.levels[source_level_idx]
reference_level_img = reference_pyramid.levels[reference_level_idx]

source_rescale = 1.0 / source_pyramid.scale_factors[source_level_idx]
reference_rescale = 1.0 / reference_pyramid.scale_factors[reference_level_idx]
print(f"Source level scale factor: {source_pyramid.scale_factors[source_level_idx]:.4f} (rescale x{source_rescale:.2f})")
print(f"Reference level scale factor: {reference_pyramid.scale_factors[reference_level_idx]:.4f} (rescale x{reference_rescale:.2f})")

# --- Feature detection + matching (SIFT or SuperPoint+LightGlue) ---
print(f"\n[5] Detecting + matching features using '{FEATURE_METHOD}'...")

if FEATURE_METHOD == "sift":
    kp_moving, kp_reference, good_matches, total_candidates = run_sift_backend(
        moving_level_img, reference_level_img, source_rescale, reference_rescale
    )
elif FEATURE_METHOD == "superpoint_lightglue":
    kp_moving, kp_reference, good_matches, total_candidates = run_superpoint_lightglue_backend(
        moving_level_img, reference_level_img, source_rescale, reference_rescale
    )
else:
    raise ValueError(f"Unknown FEATURE_METHOD: {FEATURE_METHOD!r} (use 'sift' or 'superpoint_lightglue')")

print("Reference keypoints:", len(kp_reference))
print("Moving keypoints:", len(kp_moving))
print("Total candidate matches:", total_candidates)
print("Good matches:", len(good_matches))

if len(good_matches) < MIN_MATCHES:
    raise RuntimeError("Registration rejected: not enough reliable matches.")

reference_keypoints_image = cv2.drawKeypoints(reference_full, kp_reference, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
moving_keypoints_image = cv2.drawKeypoints(moving_full, kp_moving, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
cv2.imwrite(str(OUTPUT_DIR / "03_reference_keypoints.png"), reference_keypoints_image)
cv2.imwrite(str(OUTPUT_DIR / "04_moving_keypoints.png"), moving_keypoints_image)

correspondence_image = cv2.drawMatches(moving_full, kp_moving, reference_full, kp_reference, good_matches, None,
                                        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cv2.imwrite(str(OUTPUT_DIR / "05_correspondences.png"), correspondence_image)

# --- Triangle verification ---
print("\n[5B] Verifying local triangular geometry...")
triangle_matches, triangle_support = triangular_correspondence_filter(good_matches, kp_moving, kp_reference)
print("Matches before triangle verification:", len(good_matches))
print("Matches after triangle verification:", len(triangle_matches))
good_matches = triangle_matches

triangle_correspondence_image = cv2.drawMatches(moving_full, kp_moving, reference_full, kp_reference, good_matches, None,
                                                 flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cv2.imwrite(str(OUTPUT_DIR / "05a_triangle_verified_correspondences.png"), triangle_correspondence_image)

# --- RANSAC ---
source_points, reference_points = get_match_points(good_matches, kp_moving, kp_reference)
print("\n[6] Running RANSAC...")
H, ransac_mask = estimate_homography(source_points, reference_points)
if H is None or ransac_mask is None:
    raise RuntimeError("RANSAC could not estimate homography.")

inlier_matches, inlier_mask = extract_inliers(good_matches, ransac_mask)
inlier_count = len(inlier_matches)
print("RANSAC inliers:", inlier_count)
if inlier_count < MIN_INLIERS:
    raise RuntimeError(f"Registration rejected: only {inlier_count} RANSAC inliers.")

inlier_ratio = (inlier_count / len(good_matches)) * 100.0
print(f"Inlier ratio: {inlier_ratio:.2f}%")

mean_error, median_error, max_error, reprojection_errors = calculate_reprojection_error(
    source_points, reference_points, H, inlier_mask
)
print(f"Mean reprojection error: {mean_error:.3f} px")
print(f"Median reprojection error: {median_error:.3f} px")
print(f"Maximum reprojection error: {max_error:.3f} px")

inlier_source_points = source_points[inlier_mask]
inlier_reference_points = reference_points[inlier_mask]

moving_coverage, moving_cells = calculate_spatial_coverage(inlier_source_points, moving_full.shape)
reference_coverage, reference_cells = calculate_spatial_coverage(inlier_reference_points, reference_full.shape)
print(f"Moving inlier coverage: {moving_coverage:.2f}%")
print(f"Reference inlier coverage: {reference_coverage:.2f}%")

ransac_inlier_image = cv2.drawMatches(moving_full, kp_moving, reference_full, kp_reference, inlier_matches, None,
                                       flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cv2.imwrite(str(OUTPUT_DIR / "06_ransac_inliers.png"), ransac_inlier_image)

moving_coverage_image = draw_coverage_map(moving_full, moving_cells)
reference_coverage_image = draw_coverage_map(reference_full, reference_cells)
cv2.imwrite(str(OUTPUT_DIR / "07_moving_inlier_coverage.png"), moving_coverage_image)
cv2.imwrite(str(OUTPUT_DIR / "08_reference_inlier_coverage.png"), reference_coverage_image)

if inlier_count >= 4:
    refined_H, _ = cv2.findHomography(inlier_source_points, inlier_reference_points, 0)
    if refined_H is not None:
        H = refined_H

# --- Warp + overlay + difference ---
print("\n[7] Registering image (full resolution)...")
height, width = reference_full.shape[:2]
registered = cv2.warpPerspective(moving_full, H, (width, height))
cv2.imwrite(str(OUTPUT_DIR / "09_registered.png"), registered)

moving_mask = np.full(moving_full.shape[:2], 255, dtype=np.uint8)
warped_mask = cv2.warpPerspective(moving_mask, H, (width, height))

overlay = reference_full.copy()
blended = cv2.addWeighted(reference_full, 0.5, registered, 0.5, 0)
valid_pixels = warped_mask > 0
overlay[valid_pixels] = blended[valid_pixels]
cv2.imwrite(str(OUTPUT_DIR / "10_overlay.png"), overlay)

difference = cv2.absdiff(reference_full, registered)
difference[warped_mask == 0] = 0
cv2.imwrite(str(OUTPUT_DIR / "11_registration_difference.png"), difference)

np.savetxt(OUTPUT_DIR / "homography_matrix.txt", H, fmt="%.10f")

coordinates = np.hstack((inlier_source_points.reshape(-1, 2), inlier_reference_points.reshape(-1, 2)))
np.savetxt(OUTPUT_DIR / "inlier_coordinates.csv", coordinates, delimiter=",",
           header="moving_x,moving_y,reference_x,reference_y", comments="", fmt="%.3f")

report = f"""
===========================================
  UNIFIED REGISTRATION REPORT  (method = {FEATURE_METHOD})
===========================================

REFERENCE IMAGE
{reference_path}

MOVING IMAGE
{moving_path}

-------------------------------------------
FOURIER-MELLIN SCALE/ROTATION ESTIMATE
-------------------------------------------

Estimated scale ratio (moving/reference) : {scale_ratio:.4f}
Estimated rotation                       : {rotation_deg:.2f} degrees
Phase-correlation confidence             : {fmt_confidence:.4f}

-------------------------------------------
PYRAMID / SCALE MATCHING
-------------------------------------------

Source resolution used        : {source_resolution:.4f}
Reference resolution used     : {reference_resolution:.4f}
Pyramid levels built          : {n_levels}
Matched source level          : {source_level_idx} (scale {source_pyramid.scale_factors[source_level_idx]:.4f})
Matched reference level       : {reference_level_idx} (scale {reference_pyramid.scale_factors[reference_level_idx]:.4f})

-------------------------------------------
FEATURE DETECTION + MATCHING ({FEATURE_METHOD})
-------------------------------------------

Reference Keypoints : {len(kp_reference)}
Moving Keypoints    : {len(kp_moving)}
Total Candidate Matches : {total_candidates}
Triangle Verified   : {len(good_matches)}

-------------------------------------------
RANSAC
-------------------------------------------

RANSAC Inliers      : {inlier_count}
Inlier Ratio        : {inlier_ratio:.2f} %

-------------------------------------------
SPATIAL DISTRIBUTION
-------------------------------------------

Moving Coverage     : {moving_coverage:.2f} %
Reference Coverage  : {reference_coverage:.2f} %

-------------------------------------------
REGISTRATION ERROR (full-resolution pixels)
-------------------------------------------

Mean Error          : {mean_error:.3f} px
Median Error        : {median_error:.3f} px
Maximum Error       : {max_error:.3f} px

-------------------------------------------
HOMOGRAPHY (full-resolution coordinate space)
-------------------------------------------

{H}

===========================================
"""

print(report)
with open(OUTPUT_DIR / "registration_report.txt", "w", encoding="utf-8") as file:
    file.write(report)

cv2.imshow("Correspondences", resize_for_display(correspondence_image))
cv2.imshow("Triangle Verified Correspondences", resize_for_display(triangle_correspondence_image))
cv2.imshow("RANSAC Inliers", resize_for_display(ransac_inlier_image))
cv2.imshow("Reference Inlier Coverage", resize_for_display(reference_coverage_image))
cv2.imshow("Registered Image", resize_for_display(registered))
cv2.imshow("Overlay", resize_for_display(overlay))
cv2.waitKey(0)
cv2.destroyAllWindows()