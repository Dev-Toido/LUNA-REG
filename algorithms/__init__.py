"""
Algorithm Registry for LUNA-REG.

Provides discoverable access to all canonical implementations.
"""

# Feature Extraction
from .feature_extraction.sift.sift import detect_sift
from .feature_extraction.superpoint.superpoint import detect_superpoint, cv2_to_tensor, feats_to_cv2_keypoints
from .feature_extraction.orb.orb import detect_orb
from .feature_extraction.rift2.rift2 import detect_rift2

# Matching
from .matching.bf.bf_matching import match_sift, match_orb
from .matching.lightglue.lightglue_matching import match_lightglue
from .matching.ecc.ecc_matching import ecc_register
from .matching.optical_flow.optical_flow import register_optical_flow
from .matching.phase_correlation.phase_correlation import register_phase_correlation

# Outlier Removal
from .outlier_removal.ransac import run_ransac
from .outlier_removal.magsac import run_magsac

# Correspondence
from .correspondence.mutual_matching import apply_mutual_matching
from .correspondence.spatial_filtering import triangular_correspondence_filter

# Preprocessing
from .preprocessing.intensity.intensity import clahe_representation, scharr_representation, phase_orientation_representation
from .preprocessing.pyramid import PyramidBuilder
from .preprocessing.fmt import estimate_scale_rotation_fmt

# Quality
from .quality.reprojection_error import calculate_metrics, reprojection_error
from .quality.spatial_coverage import calculate_spatial_coverage, draw_coverage_map, spatial_coverage

__all__ = [
    'detect_sift',
    'detect_superpoint',
    'cv2_to_tensor',
    'feats_to_cv2_keypoints',
    'detect_orb',
    'detect_rift2',
    
    'match_sift',
    'match_orb',
    'match_lightglue',
    'ecc_register',
    'register_optical_flow',
    'register_phase_correlation',
    
    'run_ransac',
    'run_magsac',
    
    'apply_mutual_matching',
    'triangular_correspondence_filter',
    
    'clahe_representation',
    'scharr_representation',
    'phase_orientation_representation',
    'PyramidBuilder',
    'estimate_scale_rotation_fmt',
    
    'calculate_metrics',
    'reprojection_error',
    'calculate_spatial_coverage',
    'draw_coverage_map',
    'spatial_coverage',
]
