"""
LUNA-REG — Independent Scientific Processing Module Engine
Executes complete SIFT-based lunar satellite image registration pipeline:
- Scientific lunar raster loading (PNG, JPG, TIFF, and PDS .IMG decoding)
- Preprocessing (Grayscale, CLAHE contrast enhancement, GSD downsampling)
- SIFT keypoint detection & 128-D descriptor extraction
- BFMatcher (L2 distance) with KNN (k=2) matching
- Lowe's ratio test filtering
- RANSAC Homography estimation with matrix validation
- Inlier/outlier classification and spatial distribution analysis
- Perspective alignment and verification visualization generation
- Rigorous quality metrics calculation and structured output contract emission
"""

import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List, Union

import cv2
import numpy as np
from PIL import Image


class PDSImageReader:
    """
    Scientific reader for planetary lunar .IMG raster files (PDS3 / ISIS standard).
    Parses ASCII PDS label metadata to decode binary raster arrays without relying on cv2.imread.
    """

    @staticmethod
    def is_pds_file(filepath: Union[str, Path]) -> bool:
        """Check if file starts with standard PDS3 label header."""
        try:
            with open(filepath, "rb") as f:
                header = f.read(256).decode("latin1", errors="ignore")
                return "PDS_VERSION_ID" in header or "CCSD3ZF0000100000001" in header or "RECORD_BYTES" in header
        except Exception:
            return False

    @classmethod
    def read_pds_img(cls, filepath: Union[str, Path]) -> np.ndarray:
        """
        Parse PDS label and extract binary raster payload.
        Returns 2D uint8 grayscale numpy array.
        """
        filepath = Path(filepath)
        with open(filepath, "rb") as f:
            # Read first 64KB to parse label
            raw_header = f.read(65536).decode("latin1", errors="ignore")

        # Parse key PDS parameters
        lines = cls._parse_int(raw_header, r"LINES\s*=\s*(\d+)")
        line_samples = cls._parse_int(raw_header, r"LINE_SAMPLES\s*=\s*(\d+)")
        sample_bits = cls._parse_int(raw_header, r"SAMPLE_BITS\s*=\s*(\d+)", default=8)
        record_bytes = cls._parse_int(raw_header, r"RECORD_BYTES\s*=\s*(\d+)", default=line_samples or 1)
        
        # Determine image offset
        image_ptr_match = re.search(r"\^IMAGE\s*=\s*(\d+)", raw_header)
        if image_ptr_match:
            record_offset = int(image_ptr_match.group(1))
            byte_offset = (record_offset - 1) * record_bytes
        else:
            # Look for byte offset directly or END label
            end_match = re.search(r"\bEND\b", raw_header)
            if end_match:
                byte_offset = end_match.end()
                # PDS records are often padded to RECORD_BYTES boundary
                if record_bytes > 0:
                    byte_offset = ((byte_offset + record_bytes - 1) // record_bytes) * record_bytes
            else:
                byte_offset = 0

        # Determine numpy dtype from SAMPLE_TYPE and SAMPLE_BITS
        sample_type = ""
        st_match = re.search(r"SAMPLE_TYPE\s*=\s*([A-Za-z0-9_]+)", raw_header)
        if st_match:
            sample_type = st_match.group(1).upper()

        is_msb = "MSB" in sample_type or "SUN" in sample_type or "MAC" in sample_type
        if sample_bits == 8:
            dtype = np.uint8
        elif sample_bits == 16:
            dtype = np.dtype(">u2" if is_msb else "<u2")
        elif sample_bits == 32:
            if "REAL" in sample_type or "FLOAT" in sample_type:
                dtype = np.dtype(">f4" if is_msb else "<f4")
            else:
                dtype = np.dtype(">u4" if is_msb else "<u4")
        else:
            dtype = np.uint8

        # Read binary data from offset
        file_size = filepath.stat().st_size
        bytes_to_read = file_size - byte_offset

        with open(filepath, "rb") as f:
            f.seek(byte_offset)
            raw_bytes = f.read(bytes_to_read)

        arr = np.frombuffer(raw_bytes, dtype=dtype)

        # Reshape if dimensions are known
        if lines and line_samples and arr.size >= lines * line_samples:
            arr = arr[: lines * line_samples].reshape((lines, line_samples))
        else:
            # Attempt square root heuristic
            side = int(np.sqrt(arr.size))
            if side * side == arr.size and side > 32:
                arr = arr.reshape((side, side))
            elif line_samples and line_samples > 0 and arr.size % line_samples == 0:
                arr = arr.reshape((-1, line_samples))
            else:
                raise ValueError(f"Unable to determine raster geometry for PDS file {filepath.name} (size: {arr.size})")

        # Convert to float for normalized scaling
        arr_float = arr.astype(np.float32)

        # Mask invalid / special PDS no-data values if present (e.g. <= 0 or saturated)
        valid_mask = np.isfinite(arr_float)
        if np.any(valid_mask):
            p1, p99 = np.percentile(arr_float[valid_mask], (1.0, 99.0))
            if p99 > p1:
                norm = np.clip((arr_float - p1) / (p99 - p1) * 255.0, 0, 255)
            else:
                norm = np.zeros_like(arr_float)
        else:
            norm = np.zeros_like(arr_float)

        return norm.astype(np.uint8)

    @staticmethod
    def _parse_int(text: str, pattern: str, default: Optional[int] = None) -> Optional[int]:
        m = re.search(pattern, text, re.IGNORECASE)
        return int(m.group(1)) if m else default


class ProcessingEngine:
    """
    Core SIFT Registration Processing Engine.
    Executes image loading, preprocessing, SIFT detection, BFMatcher KNN,
    Lowe's ratio test, RANSAC homography, warping, and metric evaluations.
    """

    def __init__(self, artifacts_dir: Optional[Union[str, Path]] = None):
        self.artifacts_dir = Path(artifacts_dir) if artifacts_dir else Path("data/registrations")
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------------------
    # 1. Image Loading & Validation
    # -------------------------------------------------------------------------

    @classmethod
    def load_image(cls, file_or_path: Union[str, Path, np.ndarray, bytes]) -> np.ndarray:
        """
        Load an image file (PNG, JPG, JPEG, TIFF, TIF, IMG).
        Supports scientific PDS .IMG binary payloads.
        Returns BGR or Grayscale NumPy array.
        """
        if isinstance(file_or_path, np.ndarray):
            return file_or_path.copy()

        path = Path(file_or_path)
        if not path.is_file():
            raise FileNotFoundError(f"Image file not found: {path}")

        if path.stat().st_size == 0:
            raise ValueError(f"Image file is empty (0 bytes): {path.name}")

        ext = path.suffix.lower()

        # Handle scientific lunar .IMG files
        if ext == ".img":
            if PDSImageReader.is_pds_file(path):
                gray = PDSImageReader.read_pds_img(path)
                return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            # Try standard fallback if not PDS
            img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
            if img is not None:
                return img
            # Fallback to Pillow
            try:
                with Image.open(path) as pil_img:
                    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception as e:
                raise ValueError(f"Failed to decode scientific .IMG file '{path.name}': {e}")

        # Handle TIFF / GeoTIFF files
        if ext in [".tif", ".tiff"]:
            img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
            if img is None:
                try:
                    with Image.open(path) as pil_img:
                        img = np.array(pil_img)
                except Exception as e:
                    raise ValueError(f"Failed to read TIFF file '{path.name}': {e}")

            if img.dtype != np.uint8:
                # Normalize 16-bit or float TIFF to 8-bit
                img_f = img.astype(np.float32)
                p1, p99 = np.percentile(img_f, (0.5, 99.5))
                if p99 > p1:
                    img = np.clip((img_f - p1) / (p99 - p1) * 255.0, 0, 255).astype(np.uint8)
                else:
                    img = (img_f / (img_f.max() or 1.0) * 255.0).astype(np.uint8)

            if len(img.shape) == 2:
                return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            return img

        # Standard web formats (PNG, JPG, JPEG)
        img = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if img is None:
            # Fallback to Pillow
            try:
                with Image.open(path) as pil_img:
                    rgb = pil_img.convert("RGB")
                    return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
            except Exception as e:
                raise ValueError(f"Unable to read image '{path.name}': {e}")

        return img

    @classmethod
    def validate_image(cls, img: np.ndarray, name: str = "Image") -> Tuple[int, int, int]:
        """Validate dimensions, non-empty, and valid pixel values."""
        if img is None or not isinstance(img, np.ndarray):
            raise ValueError(f"{name} is invalid or could not be loaded into array memory.")
        if img.size == 0 or len(img.shape) < 2:
            raise ValueError(f"{name} has invalid empty shape: {img.shape}")

        h, w = img.shape[:2]
        if h < 16 or w < 16:
            raise ValueError(f"{name} dimensions ({w}x{h}) are too small for SIFT feature extraction (min 16x16 px).")

        channels = img.shape[2] if len(img.shape) > 2 else 1
        return w, h, channels

    # -------------------------------------------------------------------------
    # 2. Preprocessing
    # -------------------------------------------------------------------------

    @classmethod
    def preprocess_image(
        cls,
        img: np.ndarray,
        contrast_enhancement: bool = True,
        rescale_factor: float = 1.0,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Preprocess working copy:
        1. Keep original untouched
        2. Convert to single-channel Grayscale
        3. Optional resolution scaling (for GSD differences)
        4. Optional CLAHE contrast enhancement for low-illumination crater relief
        Returns: (preprocessed_gray, scaled_color_copy)
        """
        working = img.copy()

        # 1. Grayscale Conversion
        if len(working.shape) == 3 and working.shape[2] >= 3:
            gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
        elif len(working.shape) == 3 and working.shape[2] == 1:
            gray = working[:, :, 0]
        else:
            gray = working

        # Ensure uint8
        if gray.dtype != np.uint8:
            gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)

        # 2. Optional Resolution Rescaling
        if rescale_factor > 0 and rescale_factor != 1.0:
            h, w = gray.shape[:2]
            new_w = max(32, int(w * rescale_factor))
            new_h = max(32, int(h * rescale_factor))
            gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA if rescale_factor < 1.0 else cv2.INTER_LINEAR)
            working = cv2.resize(working, (new_w, new_h), interpolation=cv2.INTER_AREA if rescale_factor < 1.0 else cv2.INTER_LINEAR)

        # 3. Optional CLAHE Contrast Enhancement
        if contrast_enhancement:
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            gray = clahe.apply(gray)

        return gray, working

    # -------------------------------------------------------------------------
    # 3. SIFT Detection & Extraction
    # -------------------------------------------------------------------------

    @classmethod
    def detect_sift_features(
        cls,
        gray: np.ndarray,
        max_features: int = 2000,
    ) -> Tuple[List[cv2.KeyPoint], Optional[np.ndarray]]:
        """
        Detect SIFT keypoints and 128-D descriptors independently.
        Handles zero/insufficient features gracefully.
        """
        sift = cv2.SIFT_create(
            nfeatures=int(max_features),
            contrastThreshold=0.03,
            edgeThreshold=10.0,
            sigma=1.6,
        )
        keypoints, descriptors = sift.detectAndCompute(gray, None)

        if keypoints is None:
            keypoints = []
        return list(keypoints), descriptors

    # -------------------------------------------------------------------------
    # 4. BFMatcher KNN & Lowe's Ratio Test
    # -------------------------------------------------------------------------

    @classmethod
    def match_features_knn(
        cls,
        desc_mov: Optional[np.ndarray],
        desc_ref: Optional[np.ndarray],
        ratio_threshold: float = 0.75,
    ) -> Tuple[List[cv2.DMatch], int]:
        """
        Match moving features to reference using BFMatcher with L2 distance.
        Applies KNN with k=2 and Lowe's ratio test: m.distance < ratio_threshold * n.distance.
        Returns: (good_matches, total_candidate_matches)
        """
        if desc_mov is None or desc_ref is None:
            return [], 0
        if len(desc_mov) < 2 or len(desc_ref) < 2:
            return [], 0

        # BFMatcher with L2 distance and crossCheck=False (required for KNN)
        bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        knn_matches = bf.knnMatch(desc_mov, desc_ref, k=2)

        total_candidates = len(knn_matches)
        good_matches: List[cv2.DMatch] = []

        for pair in knn_matches:
            if len(pair) == 2:
                m, n = pair
                if m.distance < ratio_threshold * n.distance:
                    good_matches.append(m)

        return good_matches, total_candidates

    # -------------------------------------------------------------------------
    # 5. RANSAC Homography Estimation & Inlier Classification
    # -------------------------------------------------------------------------

    @classmethod
    def estimate_homography_ransac(
        cls,
        kp_mov: List[cv2.KeyPoint],
        kp_ref: List[cv2.KeyPoint],
        good_matches: List[cv2.DMatch],
        ransac_threshold: float = 5.0,
        scale_mov: float = 1.0,
        scale_ref: float = 1.0,
        ref_shape: Tuple[int, int] = (1000, 1000),
    ) -> Dict[str, Any]:
        """
        Estimate Homography transformation using RANSAC.
        Validates minimum correspondences (>= 4), matrix non-degeneracy,
        classifies inliers/outliers, and assesses spatial distribution.
        """
        if len(good_matches) < 4:
            raise ValueError(
                f"Insufficient good correspondences for Homography estimation: found {len(good_matches)}, minimum required is 4."
            )

        # Scale coordinates back to full original resolution space if downsampling was applied
        pts_mov = np.float32([kp_mov[m.queryIdx].pt for m in good_matches]) / scale_mov
        pts_ref = np.float32([kp_ref[m.trainIdx].pt for m in good_matches]) / scale_ref

        pts_mov_cv = pts_mov.reshape(-1, 1, 2)
        pts_ref_cv = pts_ref.reshape(-1, 1, 2)

        # Robust Homography Estimation via RANSAC
        H, inlier_mask = cv2.findHomography(
            pts_mov_cv,
            pts_ref_cv,
            method=cv2.RANSAC,
            ransacReprojThreshold=float(ransac_threshold),
            maxIters=5000,
            confidence=0.995,
        )

        if H is None or H.shape != (3, 3) or not np.all(np.isfinite(H)):
            raise ValueError("RANSAC Homography estimation failed: degenerate geometry or non-finite matrix.")

        # Check matrix non-degeneracy
        det = np.linalg.det(H)
        if abs(det) < 1e-7 or abs(det) > 1e7:
            raise ValueError(f"RANSAC Homography matrix is singular or highly distorted (det = {det:.2e}).")

        # Inlier / Outlier Classification
        mask_flat = inlier_mask.ravel().tolist() if inlier_mask is not None else [0] * len(good_matches)
        inlier_indices = [i for i, val in enumerate(mask_flat) if val == 1]
        outlier_indices = [i for i, val in enumerate(mask_flat) if val == 0]

        num_inliers = len(inlier_indices)
        num_outliers = len(outlier_indices)

        if num_inliers < 4:
            raise ValueError(
                f"RANSAC rejected too many outliers: only {num_inliers} inliers confirmed. Minimum 4 required for stable registration."
            )

        # Mean Reprojection Error Calculation on Inliers
        inlier_pts_mov = pts_mov[inlier_indices]
        inlier_pts_ref = pts_ref[inlier_indices]

        # Project moving inliers via H
        ones = np.ones((len(inlier_pts_mov), 1), dtype=np.float32)
        homog_pts = np.hstack([inlier_pts_mov, ones])
        projected = (H @ homog_pts.T).T
        projected_xy = projected[:, :2] / projected[:, 2:3]

        errors = np.linalg.norm(inlier_pts_ref - projected_xy, axis=1)
        mean_reproj_error = float(np.mean(errors))

        # Spatial Distribution Score (Dispersion across Reference Image)
        spatial_score = cls._calculate_spatial_distribution(inlier_pts_ref, ref_shape)

        return {
            "H": H,
            "inlier_mask": mask_flat,
            "num_inliers": num_inliers,
            "num_outliers": num_outliers,
            "inlier_ratio": float(num_inliers / len(good_matches)) if good_matches else 0.0,
            "mean_reprojection_error_px": round(mean_reproj_error, 3),
            "spatial_distribution_score": round(spatial_score, 3),
            "inlier_matches": [good_matches[i] for i in inlier_indices],
            "outlier_matches": [good_matches[i] for i in outlier_indices],
        }

    @staticmethod
    def _calculate_spatial_distribution(points: np.ndarray, ref_shape: Tuple[int, int]) -> float:
        """
        Assess whether matched inliers are well-distributed across the image plane
        rather than concentrated in a single tiny cluster.
        Returns a score in [0.0, 1.0].
        """
        if len(points) < 4:
            return 0.0

        ref_h, ref_w = ref_shape[:2]
        x_coords = points[:, 0]
        y_coords = points[:, 1]

        # Bounding box span
        min_x, max_x = np.min(x_coords), np.max(x_coords)
        min_y, max_y = np.min(y_coords), np.max(y_coords)

        span_x = (max_x - min_x) / (ref_w or 1)
        span_y = (max_y - min_y) / (ref_h or 1)
        bbox_ratio = min(1.0, float(span_x * span_y))

        # 4-quadrant occupancy check
        mid_x, mid_y = ref_w / 2, ref_h / 2
        q1 = np.any((x_coords >= mid_x) & (y_coords < mid_y))
        q2 = np.any((x_coords < mid_x) & (y_coords < mid_y))
        q3 = np.any((x_coords < mid_x) & (y_coords >= mid_y))
        q4 = np.any((x_coords >= mid_x) & (y_coords >= mid_y))
        quadrant_score = sum([q1, q2, q3, q4]) / 4.0

        score = 0.6 * bbox_ratio + 0.4 * quadrant_score
        return float(np.clip(score, 0.0, 1.0))

    # -------------------------------------------------------------------------
    # 6. Alignment & Verification Visualizations
    # -------------------------------------------------------------------------

    @classmethod
    def generate_visualizations(
        cls,
        img_ref_orig: np.ndarray,
        img_mov_orig: np.ndarray,
        kp_ref: List[cv2.KeyPoint],
        kp_mov: List[cv2.KeyPoint],
        good_matches: List[cv2.DMatch],
        inlier_mask: List[int],
        H: np.ndarray,
        job_dir: Path,
        scale_mov: float = 1.0,
        scale_ref: float = 1.0,
    ) -> Dict[str, str]:
        """
        Generate verification visualizations:
        - Registered/Aligned Image
        - Keypoint Visualization
        - Good Match Correspondence Lines
        - RANSAC Inlier/Outlier Classification
        - Checkerboard Overlay & Alpha Blend
        - Difference Map
        Returns dictionary of saved file paths relative to job_dir.
        """
        ref_h, ref_w = img_ref_orig.shape[:2]

        # 1. Warp Moving to Reference Coordinate System
        aligned_mov = cv2.warpPerspective(
            img_mov_orig,
            H,
            (ref_w, ref_h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )

        # 2. Keypoints Side-by-Side Visualization
        kp_vis_ref = cv2.drawKeypoints(
            img_ref_orig,
            kp_ref,
            None,
            color=(0, 215, 255),  # Champagne gold in BGR
            flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS,
        )
        kp_vis_mov = cv2.drawKeypoints(
            img_mov_orig,
            kp_mov,
            None,
            color=(0, 215, 255),
            flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS,
        )

        # Resize for equal height stack if necessary
        kh_ref, kw_ref = kp_vis_ref.shape[:2]
        kh_mov, kw_mov = kp_vis_mov.shape[:2]
        target_h = max(kh_ref, kh_mov)
        w_ref_res = cv2.resize(kp_vis_ref, (int(kw_ref * target_h / kh_ref), target_h))
        w_mov_res = cv2.resize(kp_vis_mov, (int(kw_mov * target_h / kh_mov), target_h))
        keypoints_img = np.hstack([w_ref_res, w_mov_res])

        # 3. Good Matches Visualization
        matches_img = cv2.drawMatches(
            img_mov_orig,
            kp_mov,
            img_ref_orig,
            kp_ref,
            good_matches,
            None,
            matchColor=(0, 200, 240),      # Gold match lines
            singlePointColor=(100, 100, 100),
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
        )

        # 4. RANSAC Inlier Visualization (Green inliers, Amber outliers)
        inlier_draw_mask = [int(val) for val in inlier_mask]
        inliers_img = cv2.drawMatches(
            img_mov_orig,
            kp_mov,
            img_ref_orig,
            kp_ref,
            good_matches,
            None,
            matchColor=(80, 220, 100),     # Green inlier lines
            singlePointColor=(60, 60, 60),
            matchesMask=inlier_draw_mask,
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
        )

        # 5. Checkerboard Overlay
        checkerboard_img = cls._create_checkerboard(img_ref_orig, aligned_mov, block_size=max(32, ref_w // 16))

        # 6. Difference Map on Valid Overlap Region
        gray_ref = cv2.cvtColor(img_ref_orig, cv2.COLOR_BGR2GRAY) if len(img_ref_orig.shape) == 3 else img_ref_orig
        gray_aln = cv2.cvtColor(aligned_mov, cv2.COLOR_BGR2GRAY) if len(aligned_mov.shape) == 3 else aligned_mov
        overlap_mask = (gray_aln > 0) & (gray_ref > 0)

        diff = cv2.absdiff(gray_ref, gray_aln)
        diff_colored = cv2.applyColorMap(diff, cv2.COLORMAP_VIRIDIS)
        # Zero out non-overlap areas
        diff_colored[~overlap_mask] = (15, 18, 22)

        # Save all generated visualization artifacts to job_dir
        artifacts = {
            "registered_image": "registered_target.png",
            "keypoints_image": "keypoints_vis.png",
            "matches_image": "matches_vis.png",
            "inliers_image": "inliers_vis.png",
            "overlay_image": "checkerboard_overlay.png",
            "difference_image": "difference_map.png",
        }

        cv2.imwrite(str(job_dir / artifacts["registered_image"]), aligned_mov)
        cv2.imwrite(str(job_dir / artifacts["keypoints_image"]), keypoints_img)
        cv2.imwrite(str(job_dir / artifacts["matches_image"]), matches_img)
        cv2.imwrite(str(job_dir / artifacts["inliers_image"]), inliers_img)
        cv2.imwrite(str(job_dir / artifacts["overlay_image"]), checkerboard_img)
        cv2.imwrite(str(job_dir / artifacts["difference_image"]), diff_colored)

        return artifacts

    @staticmethod
    def _create_checkerboard(img1: np.ndarray, img2: np.ndarray, block_size: int = 48) -> np.ndarray:
        """Create alternating checkerboard overlay to inspect alignment seams."""
        h, w = img1.shape[:2]
        out = img1.copy()
        
        y_indices, x_indices = np.indices((h, w))
        check_mask = ((x_indices // block_size) + (y_indices // block_size)) % 2 == 1
        
        if len(img1.shape) == 3:
            check_mask_3d = np.repeat(check_mask[:, :, np.newaxis], 3, axis=2)
            out[check_mask_3d] = img2[check_mask_3d]
        else:
            out[check_mask] = img2[check_mask]
            
        return out

    # -------------------------------------------------------------------------
    # 7. Main Registration Pipeline Runner
    # -------------------------------------------------------------------------

    def run_registration(
        self,
        ref_image_source: Union[str, Path, np.ndarray],
        mov_image_source: Union[str, Path, np.ndarray],
        settings: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute full SIFT registration pipeline.
        Returns standardized Output Contract dictionary.
        Never reports SUCCESS if processing failed.
        """
        start_time = time.time()
        job_id = job_id or f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        job_dir = self.artifacts_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Default Processing Settings
        cfg = {
            "feature_detector": "SIFT",
            "ratio_threshold": 0.75,
            "ransac_threshold": 5.0,
            "max_features": 2000,
            "contrast_enhancement": True,
            "rescale_factor": 1.0,
        }
        if settings:
            cfg.update(settings)

        try:
            # 1. Loading Images
            img_ref = self.load_image(ref_image_source)
            img_mov = self.load_image(mov_image_source)

            # 2. Validating Images
            ref_w, ref_h, _ = self.validate_image(img_ref, "Reference Image")
            mov_w, mov_h, _ = self.validate_image(img_mov, "Moving/Source Image")

            # 3. Preprocessing
            scale_factor = float(cfg.get("rescale_factor", 1.0))
            contrast_on = bool(cfg.get("contrast_enhancement", True))

            gray_ref, _ = self.preprocess_image(img_ref, contrast_enhancement=contrast_on, rescale_factor=scale_factor)
            gray_mov, _ = self.preprocess_image(img_mov, contrast_enhancement=contrast_on, rescale_factor=scale_factor)

            # 4 & 5. Detecting SIFT Features & Extracting Descriptors
            max_feats = int(cfg.get("max_features", 2000))
            kp_ref, desc_ref = self.detect_sift_features(gray_ref, max_features=max_feats)
            kp_mov, desc_mov = self.detect_sift_features(gray_mov, max_features=max_feats)

            if len(kp_ref) < 4:
                raise ValueError(f"Too few SIFT features detected in Reference image ({len(kp_ref)} found, min 4 required).")
            if len(kp_mov) < 4:
                raise ValueError(f"Too few SIFT features detected in Moving/Source image ({len(kp_mov)} found, min 4 required).")

            # 6 & 7. Matching Features & Applying Ratio Test
            ratio_thresh = float(cfg.get("ratio_threshold", 0.75))
            good_matches, total_candidates = self.match_features_knn(desc_mov, desc_ref, ratio_threshold=ratio_thresh)

            # 8 & 9. Estimating Transformation & RANSAC Inlier Detection
            ransac_thresh = float(cfg.get("ransac_threshold", 5.0))
            ransac_res = self.estimate_homography_ransac(
                kp_mov=kp_mov,
                kp_ref=kp_ref,
                good_matches=good_matches,
                ransac_threshold=ransac_thresh,
                scale_mov=scale_factor,
                scale_ref=scale_factor,
                ref_shape=(ref_h, ref_w),
            )

            # 10, 11 & 12. Aligning Image, Generating Results & Quality Metrics
            H = ransac_res["H"]
            artifacts = self.generate_visualizations(
                img_ref_orig=img_ref,
                img_mov_orig=img_mov,
                kp_ref=kp_ref,
                kp_mov=kp_mov,
                good_matches=good_matches,
                inlier_mask=ransac_res["inlier_mask"],
                H=H,
                job_dir=job_dir,
                scale_mov=scale_factor,
                scale_ref=scale_factor,
            )

            elapsed = round(time.time() - start_time, 3)

            # Structured Output Contract
            return {
                "job_id": job_id,
                "status": "SUCCESS",
                "registered_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['registered_image']}",
                "keypoints_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['keypoints_image']}",
                "matches_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['matches_image']}",
                "inliers_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['inliers_image']}",
                "overlay_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['overlay_image']}",
                "difference_image": f"/api/v1/registration/artifacts/{job_id}/{artifacts['difference_image']}",
                "metrics": {
                    "ref_keypoints": len(kp_ref),
                    "moving_keypoints": len(kp_mov),
                    "candidate_matches": total_candidates,
                    "good_matches": len(good_matches),
                    "inliers": ransac_res["num_inliers"],
                    "outliers": ransac_res["num_outliers"],
                    "inlier_ratio": ransac_res["inlier_ratio"],
                    "mean_reprojection_error_px": ransac_res["mean_reprojection_error_px"],
                    "spatial_distribution_score": ransac_res["spatial_distribution_score"],
                    "processing_time_seconds": elapsed,
                    "reference_dimensions": {"width": ref_w, "height": ref_h},
                    "moving_dimensions": {"width": mov_w, "height": mov_h},
                },
                "transformation": {
                    "type": "Homography",
                    "matrix": H.tolist(),
                },
                "error": None,
            }

        except Exception as exc:
            elapsed = round(time.time() - start_time, 3)
            return {
                "job_id": job_id,
                "status": "FAILED",
                "registered_image": None,
                "keypoints_image": None,
                "matches_image": None,
                "inliers_image": None,
                "overlay_image": None,
                "difference_image": None,
                "metrics": {
                    "processing_time_seconds": elapsed,
                },
                "transformation": None,
                "error": str(exc),
            }
