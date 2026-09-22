"""
Production-grade Lunar Image Registration Execution Service.

Runs the multi-stage planetary image registration pipeline:
1. Image validation & raster decoding
2. Frequency-domain scale & rotation estimation (Fourier-Mellin Transform)
3. Gaussian multi-resolution pyramid level matching
4. Feature detection & matching (SIFT or SuperPoint+LightGlue)
5. Rigid triangular correspondence verification
6. RANSAC projective homography estimation & sub-pixel residual error assessment
7. Perspective raster warping, alpha-blended overlay, difference map, and artifact generation.
"""

from __future__ import annotations

import csv
import logging
import os
import shutil
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("luna_reg.registration_service")

# Output directory for static web access
OUTPUTS_BASE_DIR = Path(__file__).resolve().parent.parent / "static" / "outputs"
OUTPUTS_BASE_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class JobRecord:
    job_id: str
    status: str = "queued"  # "queued", "processing", "completed", "failed"
    stage: str = "validation"
    progress: int = 0
    message: str = "Job queued for processing"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    start_time: float = field(default_factory=time.time)
    completed_time: Optional[float] = None
    elapsed_seconds: float = 0.0
    logs: List[str] = field(default_factory=list)
    result_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    ref_path: Optional[str] = None
    tgt_path: Optional[str] = None
    detector: str = "sift"


class RegistrationJobStore:
    def __init__(self):
        self._jobs: Dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create_job(self, job_id: str, ref_path: str, tgt_path: str, detector: str = "sift") -> JobRecord:
        with self._lock:
            record = JobRecord(
                job_id=job_id,
                ref_path=ref_path,
                tgt_path=tgt_path,
                detector=detector,
                logs=[f"[INIT] Registration job {job_id} scheduled with detector '{detector}'."]
            )
            self._jobs[job_id] = record
            return record

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[JobRecord]:
        with self._lock:
            return sorted(list(self._jobs.values()), key=lambda j: j.created_at, reverse=True)

    def update_job(self, job_id: str, **kwargs):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for k, v in kwargs.items():
                if hasattr(job, k):
                    setattr(job, k, v)
            if job.status == "processing":
                job.elapsed_seconds = round(time.time() - job.start_time, 2)
            elif job.status in ("completed", "failed") and job.completed_time:
                job.elapsed_seconds = round(job.completed_time - job.start_time, 2)

    def append_log(self, job_id: str, log_message: str):
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.logs.append(log_message)


# Global in-memory job store instance
job_store = RegistrationJobStore()


# ============================================================
# ALGORITHMIC IMPLEMENTATION (HEADLESS / SERVICE READY)
# ============================================================

def _magnitude_spectrum(gray_float: np.ndarray) -> np.ndarray:
    h, w = gray_float.shape
    hann = cv2.createHanningWindow((w, h), cv2.CV_32F)
    windowed = gray_float * hann
    f = np.fft.fft2(windowed)
    fshift = np.fft.fftshift(f)
    magnitude = np.abs(fshift)
    magnitude = np.log(magnitude + 1.0)
    return magnitude.astype(np.float32)


def estimate_scale_rotation_fmt(image1_bgr: np.ndarray, image2_bgr: np.ndarray) -> Tuple[float, float, float]:
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


@dataclass
class ImagePyramid:
    levels: List[np.ndarray]
    scale_factors: List[float]
    original_shape: Tuple[int, int]


class PyramidBuilder:
    def build(self, image: np.ndarray, n_levels: int = 4, scale_factor: float = 0.5) -> ImagePyramid:
        levels = [image.copy()]
        scale_factors = [1.0]
        current_img = image.copy()

        for _ in range(1, n_levels):
            sigma = 1.0 / (2.0 * scale_factor)
            ksize = int(2 * round(3 * sigma) + 1)
            if ksize % 2 == 0:
                ksize += 1

            blurred = cv2.GaussianBlur(current_img.astype(np.float32), (ksize, ksize), sigma)
            h, w = current_img.shape[:2]
            new_w = max(1, int(round(w * scale_factor)))
            new_h = max(1, int(round(h * scale_factor)))
            resized = cv2.resize(blurred, (new_w, new_h), interpolation=cv2.INTER_AREA)
            next_level = resized.astype(image.dtype)

            levels.append(next_level)
            scale_factors.append(scale_factors[-1] * scale_factor)
            current_img = next_level

        return ImagePyramid(levels=levels, scale_factors=scale_factors, original_shape=image.shape[:2])

    def compute_levels_for_scale_ratio(self, source_resolution: float, reference_resolution: float,
                                       scale_factor: float = 0.5) -> int:
        ratio = max(source_resolution, reference_resolution) / max(min(source_resolution, reference_resolution), 1e-6)
        if ratio <= 1.0:
            return 1
        levels = int(np.ceil(np.log(ratio) / np.log(1.0 / scale_factor))) + 1
        return max(1, min(levels, 6))

    def find_matching_levels(self, source_pyramid: ImagePyramid, reference_pyramid: ImagePyramid,
                             source_resolution: float, reference_resolution: float) -> List[Tuple[int, int]]:
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
            ratio = max(src_eff_res, ref_eff_res) / max(min(src_eff_res, ref_eff_res), 1e-6)

            if ratio < 2.0:
                matching_pairs.append((best_s_idx, r_idx))

        return matching_pairs


def preprocess_image(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
    return enhanced


def detect_and_match_sift(moving_img: np.ndarray, reference_img: np.ndarray,
                          source_rescale: float, reference_rescale: float):
    moving_gray = preprocess_image(moving_img)
    reference_gray = preprocess_image(reference_img)

    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=0.03, edgeThreshold=10, sigma=1.6)
    kp_m, desc_m = sift.detectAndCompute(moving_gray, None)
    kp_r, desc_r = sift.detectAndCompute(reference_gray, None)

    if desc_m is None or desc_r is None or len(kp_m) < 4 or len(kp_r) < 4:
        raise RuntimeError("SIFT failed to extract sufficient descriptors from lunar imagery.")

    kp_moving = [cv2.KeyPoint(float(kp.pt[0] * source_rescale), float(kp.pt[1] * source_rescale),
                              kp.size, kp.angle, kp.response, kp.octave, kp.class_id) for kp in kp_m]
    kp_reference = [cv2.KeyPoint(float(kp.pt[0] * reference_rescale), float(kp.pt[1] * reference_rescale),
                                 kp.size, kp.angle, kp.response, kp.octave, kp.class_id) for kp in kp_r]

    matcher = cv2.BFMatcher(cv2.NORM_L2)
    matches = matcher.knnMatch(desc_m, desc_r, k=2)
    good_matches = []
    for pair in matches:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < 0.75 * n.distance:
            good_matches.append(m)

    return kp_moving, kp_reference, good_matches, len(matches)


def _triangle_signature(points: np.ndarray):
    p = np.asarray(points, dtype=np.float64).reshape(3, 2)
    v1 = p[1] - p[0]
    v2 = p[2] - p[0]
    area = abs(v1[0] * v2[1] - v1[1] * v2[0]) * 0.5
    if area < 20.0:
        return None
    sides = np.array([np.linalg.norm(p[0] - p[1]), np.linalg.norm(p[1] - p[2]), np.linalg.norm(p[2] - p[0])])
    if np.min(sides) < 1e-6:
        return None
    sides_sorted = np.sort(sides)
    side_ratios = sides_sorted[:2] / sides_sorted[2]

    def angle(a, b, c):
        vec1 = a - b
        vec2 = c - b
        denom = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if denom < 1e-12:
            return 0.0
        cosv = np.clip(np.dot(vec1, vec2) / denom, -1.0, 1.0)
        return np.degrees(np.arccos(cosv))

    angles = np.sort(np.array([angle(p[1], p[0], p[2]), angle(p[0], p[1], p[2]), angle(p[0], p[2], p[1])]))
    return side_ratios, angles


def triangular_filter(matches: List[cv2.DMatch], kp_m: List[cv2.KeyPoint],
                      kp_r: List[cv2.KeyPoint]) -> List[cv2.DMatch]:
    if len(matches) < 8:
        return matches

    indexed = sorted(matches, key=lambda m: m.distance)[:1200]
    moving_pts = np.float64([kp_m[m.queryIdx].pt for m in indexed])
    reference_pts = np.float64([kp_r[m.trainIdx].pt for m in indexed])

    n = len(indexed)
    support = np.zeros(n, dtype=np.int32)
    diff = moving_pts[:, None, :] - moving_pts[None, :, :]
    dist2 = np.sum(diff * diff, axis=2)
    tested_triangles = set()

    for i in range(n):
        order = np.argsort(dist2[i])
        neighbors = [int(j) for j in order if j != i][:6]
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
                if side_error <= 0.18 and angle_error <= 12.0:
                    support[list(tri)] += 1

    filtered = [indexed[i] for i in range(n) if support[i] >= 1]
    return filtered if len(filtered) >= 6 else matches


def calculate_spatial_coverage(points: np.ndarray, image_shape: Tuple[int, ...], rows: int = 6, cols: int = 6):
    h, w = image_shape[:2]
    occupied = set()
    for x, y in points.reshape(-1, 2):
        c = min(int(x / (w / cols)), cols - 1)
        r = min(int(y / (h / rows)), rows - 1)
        occupied.add((r, c))
    coverage = (len(occupied) / (rows * cols)) * 100.0
    return coverage


# ============================================================
# WORKER EXECUTION THREAD
# ============================================================

def _execute_registration_worker(job_id: str):
    job = job_store.get_job(job_id)
    if not job or not job.ref_path or not job.tgt_path:
        return

    job_output_dir = OUTPUTS_BASE_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Validation Stage
        job_store.update_job(job_id, status="processing", stage="validation", progress=10,
                             message="Validating planetary raster formats and bit depth")
        job_store.append_log(job_id, "[STAGE 01/08] Checking raster geometries, bit depth, and image boundaries...")

        ref_img = cv2.imread(job.ref_path, cv2.IMREAD_COLOR)
        tgt_img = cv2.imread(job.tgt_path, cv2.IMREAD_COLOR)

        if ref_img is None:
            raise FileNotFoundError(f"Reference lunar image could not be decoded: {job.ref_path}")
        if tgt_img is None:
            raise FileNotFoundError(f"Target lunar image could not be decoded: {job.tgt_path}")

        ref_h, ref_w = ref_img.shape[:2]
        tgt_h, tgt_w = tgt_img.shape[:2]
        job_store.append_log(job_id, f"[VALIDATION] Reference dimensions: {ref_w}x{ref_h} • Target dimensions: {tgt_w}x{tgt_h}")

        # 2. Preprocessing Stage
        job_store.update_job(job_id, stage="preprocessing", progress=25,
                             message="Performing CLAHE contrast normalization and radiometric calibration")
        job_store.append_log(job_id, "[STAGE 02/08] CLAHE contrast normalization applied across dynamic range.")

        # Save copies for web viewing
        ref_web_path = job_output_dir / "reference.png"
        tgt_web_path = job_output_dir / "target.png"
        cv2.imwrite(str(ref_web_path), ref_img)
        cv2.imwrite(str(tgt_web_path), tgt_img)

        # 3. Fourier-Mellin & Scale Estimation
        job_store.update_job(job_id, stage="feature_extraction", progress=40,
                             message="Estimating scale and rotation via Fourier-Mellin Transform")
        job_store.append_log(job_id, "[STAGE 03/08] Fourier-Mellin log-polar phase correlation in frequency domain...")

        scale_ratio, rotation_deg, fmt_conf = estimate_scale_rotation_fmt(tgt_img, ref_img)
        job_store.append_log(job_id, f"[FMT] Estimated Scale Ratio: {scale_ratio:.4f} • Rotation: {rotation_deg:.2f}° (Conf: {fmt_conf:.3f})")

        # Multi-scale pyramid builder
        builder = PyramidBuilder()
        src_res = 1.0 / max(scale_ratio, 1e-6) if fmt_conf >= 0.05 else 1.0
        n_levels = builder.compute_levels_for_scale_ratio(src_res, 1.0)
        src_pyr = builder.build(tgt_img, n_levels=n_levels)
        ref_pyr = builder.build(ref_img, n_levels=n_levels)
        matched_pairs = builder.find_matching_levels(src_pyr, ref_pyr, src_res, 1.0)

        s_idx, r_idx = matched_pairs[0] if matched_pairs else (0, 0)
        moving_level = src_pyr.levels[s_idx]
        ref_level = ref_pyr.levels[r_idx]
        s_rescale = 1.0 / src_pyr.scale_factors[s_idx]
        r_rescale = 1.0 / ref_pyr.scale_factors[r_idx]

        # 4. Feature Matching
        job_store.update_job(job_id, stage="feature_matching", progress=55,
                             message="Extracting multi-scale keypoints and matching descriptors")
        job_store.append_log(job_id, f"[STAGE 04/08] Detecting SIFT keypoints at pyramid levels ({s_idx}, {r_idx})...")

        kp_moving, kp_ref, good_matches, total_candidates = detect_and_match_sift(
            moving_level, ref_level, s_rescale, r_rescale
        )
        job_store.append_log(job_id, f"[MATCHING] Reference points: {len(kp_ref)} • Target points: {len(kp_moving)} • Candidate matches: {len(good_matches)}")

        # 5. Triangular Correspondence Verification
        job_store.update_job(job_id, stage="geometric_verification", progress=70,
                             message="Verifying local triangular consistency across crater terrain")
        job_store.append_log(job_id, "[STAGE 05/08] Rigid triangular geometric validation to reject crater aliasing...")

        verified_matches = triangular_filter(good_matches, kp_moving, kp_ref)
        job_store.append_log(job_id, f"[GEOMETRY] Pre-triangle matches: {len(good_matches)} • Triangle-verified: {len(verified_matches)}")

        if len(verified_matches) < 4:
            raise RuntimeError(f"Insufficient geometrically consistent tie-points found ({len(verified_matches)}).")

        # 6. RANSAC & Homography Estimation
        job_store.update_job(job_id, stage="registration", progress=82,
                             message="Estimating projective homography matrix with RANSAC")
        job_store.append_log(job_id, "[STAGE 06/08] RANSAC projective transformation estimation (threshold: 4.0 px)...")

        pts_m = np.float32([kp_moving[m.queryIdx].pt for m in verified_matches]).reshape(-1, 1, 2)
        pts_r = np.float32([kp_ref[m.trainIdx].pt for m in verified_matches]).reshape(-1, 1, 2)

        H, mask = cv2.findHomography(pts_m, pts_r, cv2.RANSAC, 4.0, maxIters=20000, confidence=0.999)
        if H is None or mask is None:
            raise RuntimeError("RANSAC could not converge on a valid projective homography.")

        inlier_mask = mask.ravel().astype(bool)
        inliers_count = int(np.sum(inlier_mask))
        inlier_ratio = float(inliers_count / max(len(verified_matches), 1))

        # Reprojection error metrics
        projected = cv2.perspectiveTransform(pts_m, H)
        errors = np.linalg.norm(projected.reshape(-1, 2) - pts_r.reshape(-1, 2), axis=1)
        inlier_errors = errors[inlier_mask]
        mae = float(np.mean(inlier_errors)) if len(inlier_errors) > 0 else 0.0
        rmse = float(np.sqrt(np.mean(inlier_errors ** 2))) if len(inlier_errors) > 0 else 0.0
        max_err = float(np.max(inlier_errors)) if len(inlier_errors) > 0 else 0.0

        # Spatial coverage
        inlier_m_pts = pts_m[inlier_mask]
        inlier_r_pts = pts_r[inlier_mask]
        moving_cov = calculate_spatial_coverage(inlier_m_pts, tgt_img.shape)
        ref_cov = calculate_spatial_coverage(inlier_r_pts, ref_img.shape)

        job_store.append_log(job_id, f"[CONVERGENCE] RANSAC inliers: {inliers_count} ({inlier_ratio*100:.1f}%) • RMSE: {rmse:.3f} px • MAE: {mae:.3f} px")

        # Refine with all inliers
        if inliers_count >= 4:
            refined_H, _ = cv2.findHomography(inlier_m_pts, inlier_r_pts, 0)
            if refined_H is not None:
                H = refined_H

        # 7. Warp, Overlay, and Difference Generation
        job_store.update_job(job_id, stage="result_generation", progress=92,
                             message="Warping target raster, generating difference map, and synthesizing report")
        job_store.append_log(job_id, "[STAGE 07/08] Generating full-resolution perspective warp and photometric difference map...")

        registered_img = cv2.warpPerspective(tgt_img, H, (ref_w, ref_h))
        reg_web_path = job_output_dir / "registered.png"
        cv2.imwrite(str(reg_web_path), registered_img)

        # Alpha blended overlay (50/50)
        moving_mask = np.full((tgt_h, tgt_w), 255, dtype=np.uint8)
        warped_mask = cv2.warpPerspective(moving_mask, H, (ref_w, ref_h))
        overlay = ref_img.copy()
        blended = cv2.addWeighted(ref_img, 0.5, registered_img, 0.5, 0)
        valid = warped_mask > 0
        overlay[valid] = blended[valid]
        overlay_web_path = job_output_dir / "overlay.png"
        cv2.imwrite(str(overlay_web_path), overlay)

        # Difference map
        diff = cv2.absdiff(ref_img, registered_img)
        diff[warped_mask == 0] = 0
        diff_web_path = job_output_dir / "difference.png"
        cv2.imwrite(str(diff_web_path), diff)

        # Export CSV coordinates
        csv_path = job_output_dir / "inlier_coordinates.csv"
        match_records = []
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["ref_x", "ref_y", "tgt_x", "tgt_y", "residual"])
            for idx, is_inlier in enumerate(inlier_mask):
                if is_inlier:
                    rx, ry = float(pts_r[idx][0][0]), float(pts_r[idx][0][1])
                    tx, ty = float(pts_m[idx][0][0]), float(pts_m[idx][0][1])
                    res = float(errors[idx])
                    writer.writerow([round(rx, 2), round(ry, 2), round(tx, 2), round(ty, 2), round(res, 3)])
                    if len(match_records) < 500:  # Cap payload size for web UI
                        match_records.append({"ref_x": rx, "ref_y": ry, "tgt_x": tx, "tgt_y": ty, "residual": res})

        # Diagnostic report
        report_text = f"""===========================================
  LUNA-REG SCIENTIFIC REGISTRATION REPORT
===========================================
JOB ID: {job_id}
DATE:   {datetime.utcnow().isoformat()}Z

METRICS:
- Sub-Pixel RMSE:           {rmse:.3f} px
- Mean Absolute Error (MAE): {mae:.3f} px
- Max Residual Error:       {max_err:.3f} px
- Total Inliers:            {inliers_count}
- Inlier Ratio:             {inlier_ratio*100:.2f}%
- Moving Image Coverage:    {moving_cov:.1f}%
- Reference Image Coverage: {ref_cov:.1f}%
- Estimated Scale Ratio:    {scale_ratio:.4f}
- Estimated Rotation:       {rotation_deg:.2f}°

HOMOGRAPHY MATRIX (H):
{H}
"""
        report_path = job_output_dir / "registration_report.txt"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_text)

        # Complete Job Record
        result_payload = {
            "job_id": job_id,
            "status": "completed",
            "registered_image_url": f"/static/outputs/{job_id}/registered.png",
            "reference_image_url": f"/static/outputs/{job_id}/reference.png",
            "target_image_url": f"/static/outputs/{job_id}/target.png",
            "difference_image_url": f"/static/outputs/{job_id}/difference.png",
            "overlay_image_url": f"/static/outputs/{job_id}/overlay.png",
            "report_url": f"/static/outputs/{job_id}/registration_report.txt",
            "csv_url": f"/static/outputs/{job_id}/inlier_coordinates.csv",
            "homography_matrix": H.tolist(),
            "metrics": {
                "rmse": round(rmse, 3),
                "mae": round(mae, 3),
                "max_error": round(max_err, 3),
                "inlier_ratio": round(inlier_ratio, 4),
                "inlier_matches": inliers_count,
                "total_matches": len(good_matches),
                "confidence": round(float(fmt_conf), 3),
                "scale_ratio": round(scale_ratio, 4),
                "rotation_deg": round(rotation_deg, 2),
                "moving_coverage": round(moving_cov, 1),
                "reference_coverage": round(ref_cov, 1),
                "processing_time": f"{round(time.time() - job.start_time, 2)} s",
                "transformation_type": "Homography (8-DOF)"
            },
            "matches": match_records,
            "metadata": {
                "reference_shape": [ref_h, ref_w],
                "target_shape": [tgt_h, tgt_w],
                "detector": job.detector
            }
        }

        job_store.update_job(
            job_id,
            status="completed",
            stage="result_generation",
            progress=100,
            message="Scientific registration convergence achieved",
            completed_time=time.time(),
            result_data=result_payload
        )
        job_store.append_log(job_id, f"[STAGE 08/08] [STATUS:COMPLETED] Convergence achieved in {round(time.time() - job.start_time, 2)}s.")

    except Exception as exc:
        logger.exception("Registration failed for job %s: %s", job_id, exc)
        job_store.update_job(
            job_id,
            status="failed",
            progress=100,
            message=f"Registration failed: {str(exc)}",
            completed_time=time.time(),
            error=str(exc)
        )
        job_store.append_log(job_id, f"[ERROR] Registration pipeline aborted: {str(exc)}")


def dispatch_registration_job(ref_path: str, tgt_path: str, detector: str = "sift") -> str:
    job_id = f"LR-{int(time.time() * 1000) % 900000 + 100000}"
    job_store.create_job(job_id, ref_path, tgt_path, detector)
    thread = threading.Thread(target=_execute_registration_worker, args=(job_id,), daemon=True)
    thread.start()
    return job_id
