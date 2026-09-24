# LUNA-REG V6.2

## Main change

V6.2 replaces blind SIFT+RIFT2 fusion with **independent RIFT2 verification**.

### V6.0 problem

```text
SIFT matches + RIFT2 matches
          ↓
       fusion
          ↓
      geometry
```

A large number of weak RIFT2 matches could dilute a strong SIFT solution.

### V6.2

```text
SIFT ──→ independent geometry ───────────────┐
                                             │
RIFT2 ─→ independent geometry ─→ gate ───────┤
                                             ↓
                                     selective fusion
                                             ↓
                                        final geometry
                                             ↓
                                        validation
```

Only RIFT2 correspondences that first survive their own robust
geometric verification and then agree with the SIFT baseline are
eligible for hybrid fusion.

If hybrid is worse than a valid SIFT baseline, V6.2 falls back to SIFT.

## Four files

```text
LUNA-REG_V6_2/
├── input.py
├── image_processing.py
├── output.py
└── main.py
```

All algorithms remain in `image_processing.py`.

## Modes

`MATCHING_MODE = "SIFT"`  
SIFT baseline.

`MATCHING_MODE = "RIFT2"`  
RIFT2-only independent geometry.

`MATCHING_MODE = "HYBRID"`  
SIFT baseline + independently verified RIFT2 selective fusion.

## Important research caveat

The RIFT2 branch is a self-contained research-oriented Python implementation
based on the RIFT/RIFT2 pipeline used in the project. It should not be
described as a bit-for-bit reproduction of the original MATLAB reference.

RIFT2 should be evaluated especially on genuinely multimodal lunar image
pairs. Same-modality pairs are useful as baseline tests.

## Recommended experiment

Use the same image pair three times:

1. `MATCHING_MODE = "SIFT"`
2. `MATCHING_MODE = "RIFT2"`
3. `MATCHING_MODE = "HYBRID"`

Record:

- SIFT matches and inliers
- RIFT2 matches and independent inliers
- RIFT2 independent inlier ratio
- RIFT2 independent mean error
- RIFT2 added to hybrid
- RIFT2 rejected
- final inliers
- final inlier ratio
- spatial coverage
- reprojection error
- final visual registration

Do not change thresholds until this controlled experiment is complete.

## Run

```bash
py main.py
```
