import cv2
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple

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
