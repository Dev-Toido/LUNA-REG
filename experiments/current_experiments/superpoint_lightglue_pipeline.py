import cv2
import numpy as np
import torch
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from lightglue import LightGlue, SuperPoint
from algorithms import (
    detect_superpoint, cv2_to_tensor, feats_to_cv2_keypoints,
    match_lightglue,
    triangular_correspondence_filter, run_ransac,
    reprojection_error, spatial_coverage, draw_coverage_map
)

# Configuration
MAX_KEYPOINTS = 4096
MIN_MATCH_CONFIDENCE = 0.0
RANSAC_THRESHOLD = 4.0
RANSAC_CONFIDENCE = 0.999
RANSAC_MAX_ITERS = 20000
MIN_MATCHES = 10
MIN_INLIERS = 8
TRIANGLE_MAX_CANDIDATES = 1200
GRID_ROWS = 6
GRID_COLS = 6
MAX_DISPLAY_WIDTH = 1400
MAX_DISPLAY_HEIGHT = 850
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

OUTPUT_DIR = Path("lightglue_output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def select_image(title):
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(title=title, filetypes=[("Image Files", "*.png *.jpg *.jpeg *.tif *.tiff"), ("All Files", "*.*")])
    root.destroy()
    if not path: raise RuntimeError(f"No image selected: {title}")
    return path

def load_image(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None: raise FileNotFoundError(f"Could not load {path}")
    return img

def resize_for_display(image):
    h, w = image.shape[:2]
    scale = min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1.0)
    if scale >= 1.0: return image
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

def main():
    print("===========================================")
    print("     SUPERPOINT + LIGHTGLUE REGISTRATION")
    print("===========================================")
    print(f"Device: {DEVICE}")
    
    reference_path = select_image("Select Reference Image")
    moving_path = select_image("Select Moving Image")
    
    reference = load_image(reference_path)
    moving = load_image(moving_path)
    
    # Models
    extractor = SuperPoint(max_num_keypoints=MAX_KEYPOINTS).eval().to(DEVICE)
    matcher = LightGlue(features="superpoint").eval().to(DEVICE)
    
    # Feature Detection
    feats_ref = detect_superpoint(extractor, reference)
    feats_mov = detect_superpoint(extractor, moving)
    
    kp_ref = feats_to_cv2_keypoints(feats_ref)
    kp_mov = feats_to_cv2_keypoints(feats_mov)
    
    # Matching
    total_candidates, good_matches = match_lightglue(matcher, feats_mov, feats_ref, MIN_MATCH_CONFIDENCE)
    if len(good_matches) < MIN_MATCHES: raise RuntimeError("Not enough LightGlue matches.")
    
    # Triangular Verification
    triangle_matches, _ = triangular_correspondence_filter(good_matches, kp_mov, kp_ref)
    good_matches = triangle_matches
    
    # RANSAC
    src_pts = np.float32([kp_mov[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp_ref[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    
    H, ransac_mask = run_ransac(src_pts, dst_pts, RANSAC_THRESHOLD, RANSAC_CONFIDENCE, RANSAC_MAX_ITERS)
    if H is None: raise RuntimeError("RANSAC failed.")
    
    inlier_mask = ransac_mask.ravel().astype(bool)
    inliers = np.sum(inlier_mask)
    if inliers < MIN_INLIERS: raise RuntimeError("Too few RANSAC inliers.")
    
    inlier_ratio = (inliers / len(good_matches)) * 100.0
    
    mean_err, median_err, max_err = reprojection_error(src_pts, dst_pts, H, ransac_mask)
    
    inlier_src = src_pts[inlier_mask]
    inlier_dst = dst_pts[inlier_mask]
    
    moving_cov = spatial_coverage(inlier_src, moving.shape)
    ref_cov = spatial_coverage(inlier_dst, reference.shape)
    
    # Refine H
    if inliers >= 4:
        refined_H, _ = cv2.findHomography(inlier_src, inlier_dst, 0)
        if refined_H is not None: H = refined_H
        
    h, w = reference.shape[:2]
    registered = cv2.warpPerspective(moving, H, (w, h))
    
    # Output
    cv2.imwrite(str(OUTPUT_DIR / "09_registered.png"), registered)
    
    print(f"Inliers: {inliers}, Ratio: {inlier_ratio:.2f}%")
    print(f"Mean Reproj Error: {mean_err:.3f} px")
    print("Done! See output directory for results.")

if __name__ == '__main__':
    main()