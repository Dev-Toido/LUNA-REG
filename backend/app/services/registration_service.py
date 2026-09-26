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
import sys
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

# LUNA-REG Core Modules (core-code/ package)
core_code_dir = Path(__file__).resolve().parent.parent.parent.parent / "core-code"
if str(core_code_dir) not in sys.path:
    sys.path.insert(0, str(core_code_dir))

try:
    import input as core_input
    import processing as core_proc
    import output as core_output
except ImportError as err:
    logger.warning("Could not import core-code modules: %s", err)
    core_input = None
    core_proc = None
    core_output = None


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

    def log_cb(msg):
        job_store.append_log(job_id, str(msg))

    def progress_cb(stage, pct, msg=""):
        job_store.update_job(job_id, stage=stage, progress=pct, message=msg)

    try:
        import json
        detector_choice = (job.detector or "sift").lower()
        if detector_choice == "sift":
            feature_method = "SIFT"
        elif detector_choice == "rootsift":
            feature_method = "ROOTSIFT"
        elif detector_choice == "rift2":
            feature_method = "RIFT2"
        else:
            feature_method = "AUTO"

        if core_input is not None and hasattr(core_input, "run_core_registration"):
            # Execute unified core-code pipeline: input.py -> processing.py -> output.py
            core_res = core_input.run_core_registration(
                image1_path=job.ref_path,
                image2_path=job.tgt_path,
                feature_method=feature_method,
                output_dir=str(job_output_dir),
                progress_callback=progress_cb,
                log_callback=log_cb,
            )

            result = core_res["result"]
            H = np.array(core_res["homography_matrix"]) if core_res["homography_matrix"] is not None else None
            inliers_count = int(core_res.get("inliers", 0))
            inlier_ratio = float(core_res.get("inlier_ratio", 0.0))
            rmse = float(core_res.get("rmse", 0.0))
            mean_err = float(core_res.get("mean_error", 0.0))
            max_err = float(core_res.get("max_error", 0.0))
            cov = float(core_res.get("spatial_coverage", 0.0))
            fmt_info = core_res.get("scale_info", {}).get("fmt", {})

            # Match records from generated CSV for UI visualization
            match_records = []
            inlier_csv = job_output_dir / "inlier_points.csv"
            if inlier_csv.exists():
                with open(inlier_csv, "r", encoding="utf-8") as f_inlier:
                    reader = csv.DictReader(f_inlier)
                    for row in reader:
                        if len(match_records) >= 500:
                            break
                        try:
                            match_records.append({
                                "ref_x": float(row.get("reference_x_px", 0)),
                                "ref_y": float(row.get("reference_y_px", 0)),
                                "tgt_x": float(row.get("moving_x_px", 0)),
                                "tgt_y": float(row.get("moving_y_px", 0)),
                                "residual": float(row.get("reprojection_error_px", 0) or 0),
                            })
                        except Exception:
                            pass

            result_payload = {
                "job_id": job_id,
                "status": "completed",
                "registered_image_url": f"/static/outputs/{job_id}/registered.png",
                "reference_image_url": f"/static/outputs/{job_id}/reference.png",
                "target_image_url": f"/static/outputs/{job_id}/target.png",
                "difference_image_url": f"/static/outputs/{job_id}/difference.png",
                "overlay_image_url": f"/static/outputs/{job_id}/overlay.png",
                "report_url": f"/static/outputs/{job_id}/final_report.json",
                "csv_url": f"/static/outputs/{job_id}/inlier_points.csv",
                "homography_matrix": core_res["homography_matrix"],
                "metrics": {
                    "rmse": round(rmse, 3),
                    "mae": round(mean_err, 3),
                    "max_error": round(max_err, 3),
                    "inlier_ratio": round(inlier_ratio / 100.0 if inlier_ratio > 1.0 else inlier_ratio, 4),
                    "inlier_matches": inliers_count,
                    "confidence": round(float(fmt_info.get("confidence", 1.0)), 3),
                    "scale_ratio": round(float(fmt_info.get("estimated_scale_ratio", 1.0)), 4),
                    "rotation_deg": round(float(fmt_info.get("estimated_rotation_deg", 0.0)), 2),
                    "moving_coverage": round(cov, 1),
                    "reference_coverage": round(cov, 1),
                    "processing_time": f"{round(time.time() - job.start_time, 2)} s",
                    "transformation_type": "Homography (8-DOF)",
                    "quality_pass": core_res["accepted"],
                },
                "matches": match_records,
                "metadata": {
                    "selected_branch": core_res.get("selected_branch", feature_method),
                    "detector": job.detector
                }
            }

            with open(job_output_dir / "registration_metrics.json", "w", encoding="utf-8") as f_json:
                json.dump(result_payload, f_json, indent=2)

            job_store.update_job(
                job_id,
                status="completed",
                stage="result_generation",
                progress=100,
                message="Scientific registration convergence achieved via core-code",
                completed_time=time.time(),
                result_data=result_payload
            )
            job_store.append_log(job_id, f"[STATUS:COMPLETED] Convergence achieved via core-code in {round(time.time() - job.start_time, 2)}s.")
        else:
            raise RuntimeError("core-code package could not be initialized.")

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
