"""
LUNA-REG — Scientific Processing Module Automated Engine Tests.
Verifies:
- Scientific PDS .IMG reader and raster decoding
- Image loading (PNG, JPG, TIFF, scientific .IMG)
- Preprocessing (Grayscale, CLAHE contrast enhancement, GSD resolution downsampling)
- SIFT keypoint detection and 128-D descriptor extraction
- BFMatcher with L2 distance, KNN (k=2), and Lowe's ratio test
- RANSAC Homography estimation, reprojection error, inlier ratio, spatial distribution score
- Verification visualizations generation (6 visual artifacts)
- End-to-end registration pipeline execution and Output Contract verification
- Graceful error handling (insufficient correspondences, degenerate geometry, empty images)
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from core.processing_engine import PDSImageReader, ProcessingEngine


class TestProcessingEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.test_dir = Path(tempfile.mkdtemp(prefix="lunareg_proc_test_"))
        cls.engine = ProcessingEngine(artifacts_dir=cls.test_dir / "registrations")

        # Create a synthetic PDS3 .IMG file
        cls.pds_file = cls.test_dir / "synthetic_lunar.img"
        cls._create_synthetic_pds_img(cls.pds_file, lines=64, line_samples=64)

        # Create a synthetic TIFF file (16-bit)
        cls.tiff_file = cls.test_dir / "synthetic_lunar.tif"
        arr16 = np.random.randint(1000, 50000, (64, 64), dtype=np.uint16)
        cv2.imwrite(str(cls.tiff_file), arr16)

    @classmethod
    def tearDownClass(cls):
        if cls.test_dir.exists():
            shutil.rmtree(cls.test_dir, ignore_errors=True)

    @staticmethod
    def _create_synthetic_pds_img(filepath: Path, lines: int = 64, line_samples: int = 64):
        """Generate a valid PDS3 standard formatted binary raster file."""
        record_bytes = line_samples
        label_text = (
            "PDS_VERSION_ID                = PDS3\r\n"
            f"RECORD_BYTES                  = {record_bytes}\r\n"
            f"FILE_RECORDS                  = {lines + 4}\r\n"
            "^IMAGE                        = 5\r\n"
            "OBJECT                        = IMAGE\r\n"
            f"  LINES                       = {lines}\r\n"
            f"  LINE_SAMPLES                = {line_samples}\r\n"
            "  SAMPLE_BITS                 = 8\r\n"
            "  SAMPLE_TYPE                 = MSB_INTEGER\r\n"
            "END_OBJECT                    = IMAGE\r\n"
            "END\r\n"
        )
        label_bytes = label_text.encode("latin1")
        header_size = 4 * record_bytes  # Offset to record 5
        padded_header = label_bytes.ljust(header_size, b" ")

        # Synthetic gradient raster data
        y, x = np.mgrid[0:lines, 0:line_samples]
        data = ((x + y) % 256).astype(np.uint8).tobytes()

        with open(filepath, "wb") as f:
            f.write(padded_header + data)

    # -------------------------------------------------------------------------
    # 1. PDS Image Reader Tests
    # -------------------------------------------------------------------------

    def test_pds_file_identification(self):
        """Verify that PDSImageReader accurately detects PDS3 headers."""
        self.assertTrue(PDSImageReader.is_pds_file(self.pds_file))
        self.assertFalse(PDSImageReader.is_pds_file(self.tiff_file))

    def test_pds_img_raster_decoding(self):
        """Verify decoding of binary raster bytes into 2D uint8 numpy array."""
        raster = PDSImageReader.read_pds_img(self.pds_file)
        self.assertEqual(raster.shape, (64, 64))
        self.assertEqual(raster.dtype, np.uint8)
        self.assertGreater(raster.max(), 0)

    # -------------------------------------------------------------------------
    # 2. Image Loading & Validation Tests
    # -------------------------------------------------------------------------

    def test_load_png_jpg_tiff_and_img(self):
        """Verify loading diverse formats through ProcessingEngine."""
        # 1. JPG asset
        img_jpg = self.engine.load_image("assets/lunar_low_sun.jpg")
        self.assertIsInstance(img_jpg, np.ndarray)
        self.assertEqual(len(img_jpg.shape), 3)

        # 2. TIFF
        img_tiff = self.engine.load_image(self.tiff_file)
        self.assertEqual(img_tiff.dtype, np.uint8)

        # 3. PDS .IMG
        img_pds = self.engine.load_image(self.pds_file)
        self.assertEqual(img_pds.dtype, np.uint8)

    def test_validate_image_boundaries(self):
        """Verify dimensional and empty array validation checks."""
        valid_arr = np.zeros((100, 100, 3), dtype=np.uint8)
        w, h, c = self.engine.validate_image(valid_arr)
        self.assertEqual((w, h, c), (100, 100, 3))

        # Too small (<16x16)
        small_arr = np.zeros((12, 12), dtype=np.uint8)
        with self.assertRaises(ValueError):
            self.engine.validate_image(small_arr)

        # Empty array
        empty_arr = np.array([])
        with self.assertRaises(ValueError):
            self.engine.validate_image(empty_arr)

    # -------------------------------------------------------------------------
    # 3. Preprocessing Tests
    # -------------------------------------------------------------------------

    def test_preprocess_image_grayscale_clahe_and_rescaling(self):
        """Verify preprocessing pipeline keeps original and produces valid gray."""
        color = np.ones((100, 100, 3), dtype=np.uint8) * 128
        gray, scaled = self.engine.preprocess_image(
            color,
            contrast_enhancement=True,
            rescale_factor=0.5
        )
        self.assertEqual(len(gray.shape), 2)
        self.assertEqual(gray.shape, (50, 50))
        self.assertEqual(gray.dtype, np.uint8)

    # -------------------------------------------------------------------------
    # 4. SIFT Keypoint & Descriptor Tests
    # -------------------------------------------------------------------------

    def test_detect_sift_features(self):
        """Verify SIFT feature detection and 128-D descriptor extraction."""
        img = self.engine.load_image("assets/lunar_low_sun.jpg")
        gray, _ = self.engine.preprocess_image(img)
        kp, desc = self.engine.detect_sift_features(gray, max_features=500)

        self.assertGreater(len(kp), 10)
        self.assertIsNotNone(desc)
        self.assertEqual(desc.shape[1], 128)
        self.assertEqual(len(kp), len(desc))

    # -------------------------------------------------------------------------
    # 5. BFMatcher KNN & Lowe's Ratio Test
    # -------------------------------------------------------------------------

    def test_match_features_knn_and_ratio_test(self):
        """Verify KNN matching and Lowe ratio filtering."""
        img = self.engine.load_image("assets/lunar_low_sun.jpg")
        gray, _ = self.engine.preprocess_image(img)
        kp, desc = self.engine.detect_sift_features(gray, max_features=300)

        good_matches, total = self.engine.match_features_knn(desc, desc, ratio_threshold=0.75)
        self.assertGreater(len(good_matches), 0)
        self.assertLessEqual(len(good_matches), total)

    # -------------------------------------------------------------------------
    # 6. RANSAC Homography & Metrics Tests
    # -------------------------------------------------------------------------

    def test_estimate_homography_ransac_success(self):
        """Verify robust Homography estimation with metrics calculation."""
        # Create synthetic points transformed by known affine matrix
        pts_mov_raw = [
            cv2.KeyPoint(20, 20, 1),
            cv2.KeyPoint(100, 20, 1),
            cv2.KeyPoint(100, 100, 1),
            cv2.KeyPoint(20, 100, 1),
            cv2.KeyPoint(50, 50, 1),
            cv2.KeyPoint(70, 80, 1),
        ]
        # Shift reference points by +10 in X and +5 in Y
        pts_ref_raw = [
            cv2.KeyPoint(30, 25, 1),
            cv2.KeyPoint(110, 25, 1),
            cv2.KeyPoint(110, 105, 1),
            cv2.KeyPoint(30, 105, 1),
            cv2.KeyPoint(60, 55, 1),
            cv2.KeyPoint(80, 85, 1),
        ]
        good_matches = [cv2.DMatch(i, i, 0.1) for i in range(len(pts_mov_raw))]

        res = self.engine.estimate_homography_ransac(
            kp_mov=pts_mov_raw,
            kp_ref=pts_ref_raw,
            good_matches=good_matches,
            ransac_threshold=3.0,
            ref_shape=(200, 200),
        )

        self.assertIn("H", res)
        self.assertEqual(res["H"].shape, (3, 3))
        self.assertEqual(res["num_inliers"], 6)
        self.assertEqual(res["inlier_ratio"], 1.0)
        self.assertLess(res["mean_reprojection_error_px"], 0.5)
        self.assertGreater(res["spatial_distribution_score"], 0.0)

    def test_estimate_homography_insufficient_matches_raises_error(self):
        """Verify error is raised when fewer than 4 correspondences exist."""
        kp = [cv2.KeyPoint(10, 10, 1)]
        matches = [cv2.DMatch(0, 0, 0.1)]
        with self.assertRaises(ValueError) as ctx:
            self.engine.estimate_homography_ransac(kp, kp, matches)
        self.assertIn("Insufficient good correspondences", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 7. Verification Visualizations Generation
    # -------------------------------------------------------------------------

    def test_generate_visualizations_creates_all_6_artifacts(self):
        """Verify generation of all 6 verification artifact files."""
        img = np.zeros((120, 120, 3), dtype=np.uint8)
        img[20:60, 20:60] = 255
        kp = [
            cv2.KeyPoint(20, 20, 1),
            cv2.KeyPoint(50, 20, 1),
            cv2.KeyPoint(50, 50, 1),
            cv2.KeyPoint(20, 50, 1),
        ]
        matches = [cv2.DMatch(i, i, 0.1) for i in range(4)]
        mask = [1, 1, 1, 1]
        H = np.eye(3, dtype=np.float32)

        job_dir = self.test_dir / "test_vis_job"
        job_dir.mkdir(parents=True, exist_ok=True)

        artifacts = self.engine.generate_visualizations(
            img_ref_orig=img,
            img_mov_orig=img,
            kp_ref=kp,
            kp_mov=kp,
            good_matches=matches,
            inlier_mask=mask,
            H=H,
            job_dir=job_dir,
        )

        expected_keys = [
            "registered_image",
            "keypoints_image",
            "matches_image",
            "inliers_image",
            "overlay_image",
            "difference_image",
        ]
        for key in expected_keys:
            self.assertIn(key, artifacts)
            filepath = job_dir / artifacts[key]
            self.assertTrue(filepath.is_file(), f"Missing artifact file: {filepath}")
            self.assertGreater(filepath.stat().st_size, 0)

    # -------------------------------------------------------------------------
    # 8. Full End-to-End Pipeline & Output Contract Verification
    # -------------------------------------------------------------------------

    def test_run_registration_full_pipeline_success(self):
        """Verify full 12-step SIFT registration pipeline returning valid Output Contract."""
        res = self.engine.run_registration(
            ref_image_source="assets/lunar_low_sun.jpg",
            mov_image_source="assets/lunar_low_sun.jpg",
            settings={
                "ratio_threshold": 0.75,
                "ransac_threshold": 5.0,
                "max_features": 1000,
            }
        )

        self.assertEqual(res["status"], "SUCCESS")
        self.assertIsNotNone(res["job_id"])
        self.assertIsNone(res["error"])

        # Check all 6 visual artifact endpoints
        for k in ["registered_image", "keypoints_image", "matches_image", "inliers_image", "overlay_image", "difference_image"]:
            self.assertIsNotNone(res[k])
            self.assertTrue(res[k].startswith("/api/v1/registration/artifacts/"))

        # Check Quality Metrics
        m = res["metrics"]
        self.assertGreater(m["ref_keypoints"], 0)
        self.assertGreater(m["moving_keypoints"], 0)
        self.assertGreater(m["inliers"], 4)
        self.assertGreaterEqual(m["inlier_ratio"], 0.0)
        self.assertGreaterEqual(m["spatial_distribution_score"], 0.0)
        self.assertGreater(m["processing_time_seconds"], 0.0)

        # Check Homography Matrix
        self.assertEqual(res["transformation"]["type"], "Homography")
        matrix = res["transformation"]["matrix"]
        self.assertEqual(len(matrix), 3)
        self.assertEqual(len(matrix[0]), 3)

    def test_run_registration_failure_handling(self):
        """Verify that featureless/blank images fail gracefully with FAILED status and error."""
        blank_file1 = self.test_dir / "blank1.png"
        blank_file2 = self.test_dir / "blank2.png"
        cv2.imwrite(str(blank_file1), np.zeros((100, 100), dtype=np.uint8))
        cv2.imwrite(str(blank_file2), np.zeros((100, 100), dtype=np.uint8))

        res = self.engine.run_registration(blank_file1, blank_file2)
        self.assertEqual(res["status"], "FAILED")
        self.assertIsNone(res["registered_image"])
        self.assertIsNotNone(res["error"])


if __name__ == "__main__":
    unittest.main()
