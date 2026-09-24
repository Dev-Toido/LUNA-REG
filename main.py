"""
LUNA-REG V6.2
Main controller.
"""

from pathlib import Path

from input import (
    MATCHING_MODE,
    get_config,
    select_images,
)
from image_processing import (
    load_image,
    process_images,
)
from output import save_results


def print_summary(result):
    print("\n" + "=" * 70)
    print("LUNA-REG V6.2 RESULT")
    print("=" * 70)

    print(
        f"Mode                       : "
        f"{result.get('mode', MATCHING_MODE)}"
    )

    print(
        f"SIFT keypoints             : "
        f"{result.get('target_keypoints_sift', 0)} / "
        f"{result.get('reference_keypoints_sift', 0)}"
    )

    print(
        f"RIFT2 keypoints            : "
        f"{result.get('target_keypoints_rift2', 0)} / "
        f"{result.get('reference_keypoints_rift2', 0)}"
    )

    print(
        f"SIFT candidate matches     : "
        f"{result.get('sift_candidate_matches', 0)}"
    )

    print(
        f"RIFT2 candidate matches    : "
        f"{result.get('rift2_candidate_matches', 0)}"
    )

    print(
        f"SIFT accepted matches      : "
        f"{result.get('sift_matches', 0)}"
    )

    print(
        f"RIFT2 accepted matches     : "
        f"{result.get('rift2_matches', 0)}"
    )

    print(
        f"Fused correspondences      : "
        f"{result.get('fused_matches', 0)}"
    )

    print(
        f"RIFT2 added (hybrid)       : "
        f"{result.get('hybrid_added_rift', 0)}"
    )

    print(
        f"RIFT2 rejected by gate    : "
        f"{result.get('hybrid_rejected_rift', 0)}"
    )

    if result.get("mode") == "HYBRID":
        print(
            f"Hybrid kept               : "
            f"{result.get('hybrid_kept', False)}"
        )

    print(
        f"SIFT baseline geometry    : "
        f"{result.get('sift_baseline_geometry', 'N/A')}"
    )

    print(
        f"Duplicates removed         : "
        f"{result.get('duplicate_matches_removed', 0)}"
    )

    print(
        f"SIFT inliers               : "
        f"{result.get('sift_inliers', 0)}"
    )

    print(
        f"RIFT2 inliers              : "
        f"{result.get('rift2_inliers', 0)}"
    )

    print(
        f"RIFT2 independent geometry: "
        f"{result.get('rift2_independent_geometry', 'N/A')}"
    )

    print(
        f"RIFT2 independent inliers : "
        f"{result.get('rift2_independent_inliers', 0)}"
    )

    print(
        f"RIFT2 independent ratio   : "
        f"{result.get('rift2_independent_inlier_ratio', 0.0):.2f}%"
    )

    rift_err = result.get(
        'rift2_independent_mean_error',
        float('inf')
    )
    print(
        f"RIFT2 independent error   : "
        f"{rift_err:.4f} px"
        if rift_err != float('inf')
        else "RIFT2 independent error   : inf"
    )

    print(
        f"RIFT2 independently valid : "
        f"{result.get('rift2_independent_valid', False)}"
    )

    print(
        f"Selected geometry          : "
        f"{result.get('selected_geometry', 'N/A')}"
    )

    print(
        f"Final inliers              : "
        f"{result.get('final_inliers', 0)}"
    )

    print(
        f"Inlier ratio               : "
        f"{result.get('final_inlier_ratio', 0.0):.2f}%"
    )

    print(
        f"Mean reprojection error    : "
        f"{result.get('mean_reprojection_error', float('inf')):.4f} px"
    )

    print(
        f"Median reprojection error  : "
        f"{result.get('median_reprojection_error', float('inf')):.4f} px"
    )

    print(
        f"Max reprojection error     : "
        f"{result.get('max_reprojection_error', float('inf')):.4f} px"
    )

    validation = result.get(
        "validation",
        {},
    )

    print(
        f"Target coverage            : "
        f"{validation.get('target_coverage', {}).get('percent', 0.0):.2f}%"
    )

    print(
        f"Reference coverage         : "
        f"{validation.get('reference_coverage', {}).get('percent', 0.0):.2f}%"
    )

    print(
        f"Target hull coverage       : "
        f"{validation.get('target_hull_coverage', 0.0):.2f}%"
    )

    print(
        f"Reference hull coverage    : "
        f"{validation.get('reference_hull_coverage', 0.0):.2f}%"
    )

    print(
        f"Status                     : "
        f"{result.get('reason', 'N/A')}"
    )

    print("=" * 70)


def main():
    print("=" * 70)
    print("LUNA-REG V6.2")
    print("SIFT + RIFT2 Independent Verification + Selective Fusion")
    print("=" * 70)

    target_path, reference_path = select_images()

    if not target_path or not reference_path:
        print("Image selection cancelled.")
        return

    print(f"\nTarget / Moving   : {target_path}")
    print(f"Reference / Fixed : {reference_path}")
    print(f"Matching mode     : {MATCHING_MODE}")

    target = load_image(target_path)
    reference = load_image(reference_path)

    result = process_images(
        target,
        reference,
        MATCHING_MODE,
    )

    print_summary(result)

    output_dir = save_results(
        result,
        get_config(),
        target_path,
        reference_path,
    )

    print(
        f"\nResults saved to: "
        f"{Path(output_dir).resolve()}"
    )


if __name__ == "__main__":
    main()
