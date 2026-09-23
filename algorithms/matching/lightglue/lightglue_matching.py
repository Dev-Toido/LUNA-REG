import cv2
import torch
from lightglue.utils import rbd

def match_lightglue(matcher, feats_moving, feats_reference, min_match_confidence=0.0):
    """
    LightGlue performs a learned, globally-optimal assignment.
    """
    with torch.no_grad():
        result = matcher({"image0": feats_moving, "image1": feats_reference})

    feats_moving_r, feats_reference_r, result = [
        rbd(x) for x in [feats_moving, feats_reference, result]
    ]

    match_indices = result["matches"].cpu().numpy()   # (M, 2) -> [idx_in_moving, idx_in_reference]
    match_scores = result["scores"].cpu().numpy()      # (M,) confidence per match, higher = better

    good_matches = []
    for (i, j), score in zip(match_indices, match_scores):
        if score < min_match_confidence:
            continue
        # distance = 1 - confidence, so downstream code keeps working unchanged
        good_matches.append(cv2.DMatch(_queryIdx=int(i), _trainIdx=int(j),
                                        _imgIdx=0, _distance=float(1.0 - score)))

    return len(match_indices), good_matches
