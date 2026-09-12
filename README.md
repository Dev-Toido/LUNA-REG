
# 🌕 LUNA-REG

### Lunar Unified Navigation & Alignment for Robust Image Registration

> **Smart India Hackathon 2026 — SIH26166**  
> *Multi-modal, Sun-angle and scale invariant image correspondence using Chandrayaan-2 optical images.*

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)](https://www.python.org/)
[![OpenCV](https://img.shields.io/badge/OpenCV-Computer%20Vision-green?logo=opencv)](https://opencv.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-Deep%20Learning-ee4c2c?logo=pytorch)](https://pytorch.org/)
[![Status](https://img.shields.io/badge/Status-Research%20%26%20Development-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## 🛰️ Overview

**LUNA-REG** is a research-driven lunar image correspondence and registration framework being developed for **Smart India Hackathon 2026 — SIH26166**.

The system focuses on finding reliable correspondences between lunar images acquired under substantially different:

- ☀️ illumination and Sun-angle conditions
- 📐 viewing geometries
- 🔍 spatial resolutions and scales
- 📷 sensors and imaging modalities
- 🌑 shadow and low-texture conditions

The ultimate goal is to use those correspondences to produce an accurate and geometrically consistent registered image.

> **The central problem is correspondence; registration is the downstream geometric result.**

---

# 🎯 Objectives

LUNA-REG aims to:

1. Identify reliable correspondences between source and reference lunar images.
2. Handle illumination and Sun-angle variation.
3. Handle viewpoint and geometric differences.
4. Handle large scale and resolution differences.
5. Reject incorrect and geometrically unreliable correspondences.
6. Maintain spatially distributed match points.
7. Estimate a reliable geometric transformation.
8. Produce a registered image.
9. Investigate genuine sub-pixel refinement.
10. Quantitatively evaluate each approach.
11. Adapt the processing strategy when the initial registration is unreliable.

### Expected Outputs

- ✅ Registered image
- ✅ Corresponding match points
- ✅ Transformation parameters
- ✅ Inlier information
- ✅ RMSE / reprojection error
- ✅ Inlier ratio
- ✅ Runtime and resource statistics
- ✅ Experiment and failure reports

---

# 🧠 Research Direction

LUNA-REG is **not** based on the assumption that one existing feature matcher is universally optimal.

The literature already contains strong approaches such as:

- SIFT
- ASIFT
- AKAZE
- RIFT / RIFT2
- SuperPoint
- SuperGlue
- LightGlue
- LoFTR
- lunar structural / crater-based approaches

Therefore:

> **Using an existing algorithm is not, by itself, our research contribution.**

Our current research hypothesis is:


Analyze Image Pair
        ↓
Characterize Difficulty
        ↓
Choose / Prepare Representation
        ↓
Select Matching Strategy
        ↓
Filter Reliable Correspondences
        ↓
Verify Geometry
        ↓
Register / Refine
        ↓
Evaluate
        ↓
Adapt if Necessary


The adaptive strategy will only be considered a meaningful contribution if experiments demonstrate measurable improvement.

---

# 🔬 Research Questions

### RQ1 — Robust Correspondence

How can reliable correspondences be identified when lunar images simultaneously exhibit severe illumination, shadow, scale, viewpoint and texture differences?

### RQ2 — Stable Image Evidence

Which information remains stable under changing lunar illumination?

Possible sources include:

* local appearance
* gradients
* edges
* phase/frequency structure
* geomorphological structure
* contextual relationships

### RQ3 — Correspondence Reliability

How can visually plausible but geometrically unreliable matches be detected and removed?

### RQ4 — Geometric / Metadata Priors

Can metadata and approximate geometric information reduce the search space and false-match rate without over-constraining the matcher?

### RQ5 — Adaptive Computation

Can adaptive escalation improve the accuracy–runtime trade-off compared with always using the most expensive approach?

---

# 📚 Research Foundation

The current research corpus includes work covering classical, multimodal, learned, detector-free, planetary and lunar-specific registration.

### Most Directly Relevant

**Makharia et al. (2025)**
*Comparative Evaluation of Traditional and Deep Learning Feature Matching Algorithms using Chandrayaan-2 Lunar Data*

Evaluates:

* OHRC ↔ LROC NAC
* IIRS ↔ LROC WAC
* DFSAR ↔ SELENE

Methods:

* SIFT
* ASIFT
* AKAZE
* RIFT2
* SuperGlue

Key finding:

> No single method is universally robust across all lunar conditions.

---

### Other Important References

**Makharia et al. (2024)**
*Image Registration of High Resolution Chandrayaan-2 Data*

**Sidiropoulos & Muller (2017)**
*A Systematic Solution to Multi-Instrument Coregistration of High-Resolution Planetary Images to an Orthorectified Baseline*

**Yang & Kang (2017)**
*Accurate Registration of the Chang’E-1 IIM Data Based on LRO LROC-WAC Mosaic Data*

**Yang, Kang & Yang (2020)**
*A Semi-automatic Registration Method for Chang’E-1 IIM Imagery Based on Globally Geo-Reference LROC-WAC Mosaic Imagery*

**Li, Hu & Ai (2020)**
*RIFT: Multi-Modal Image Matching Based on Radiation-Variation Insensitive Feature Transform*

Detailed literature and research-gap analysis are maintained in:

```text
docs/
└── research/
```

---

# 🧩 Research Gap

Existing research already provides strong solutions for individual aspects of the problem:

* scale and rotation robustness
* radiometric robustness
* learned correspondence
* detector-free matching
* crater-based structural evidence
* geometric verification
* adaptive computation

However, there is less evidence for a single practical framework that jointly considers:

```text
Illumination
    +
Scale / Resolution
    +
Sensor Differences
    +
Weak / Repetitive Texture
    +
Correspondence Reliability
    +
Spatial Coverage
    +
Geometric Consistency
    +
Computational Cost
```

### Current Working Research Gap

> **Develop a practical lunar registration framework that identifies reliable evidence under combined imaging variations, validates geometric consistency, and allocates computational effort according to registration difficulty.**

This remains a **research hypothesis** and must be validated experimentally.

---

# 🌑 Chandrayaan-2 Imaging Context

## OHRC

**Orbiter High Resolution Camera**

* Panchromatic optical imagery
* ~0.25–0.3 m/pixel
* Very high spatial resolution
* Extremely large image dimensions
* Useful for fine-scale lunar morphology

## TMC / TMC-2

* Lower resolution than OHRC
* Wider-area imaging
* TMC-2 provides stereo capability
* Useful for multi-resolution / multi-view registration

## IIRS

**Imaging Infrared Spectrometer**

* Hyperspectral imagery
* ~80 m spatial resolution in the reviewed work
* Multiple spectral bands

For IIRS registration, prior research used the following strategy:

```text
IIRS Hyperspectral Cube
        ↓
Select suitable band
        ↓
Register selected band
        ↓
Estimate transformation
        ↓
Apply same transformation
to remaining bands
```

IIRS is part of the broader project scope but is **not the first experimental target**.

---

# 🧪 Initial Real Dataset — Pair A

Our first real experimental benchmark is:

## Source — Chandrayaan-2 OHRC

```text
Product:
ch2_ohr_ncp_20210401T2357376656_d_img_d18
```

Important characteristics:

| Property        | Value               |
| --------------- | ------------------- |
| Processing      | Calibrated          |
| Resolution      | **0.26 m/pixel**    |
| Dimensions      | **90,148 × 12,000** |
| Projection      | Selenographic       |
| Region          | Equatorial          |
| Sun Elevation   | **~9.91°**          |
| Solar Incidence | **~80.09°**         |
| Image Size      | **~1.08 GB**        |

The large image size means that the system must support:

* memory-mapped access
* windowed reads
* ROI extraction
* tiled processing

The full image should not be unnecessarily loaded into RAM.

---

## Reference — LROC NAC

```text
Calibrated Product:
M1350459544RC
```

Important characteristics:

| Property    | Value               |
| ----------- | ------------------- |
| Resolution  | **~1.6053 m/pixel** |
| Dimensions  | **52,224 × 2,532**  |
| Instrument  | LROC NAC            |
| Acquisition | 2020-07-27          |
| Overlap     | Yes                 |

### Approximate Resolution Difference

```text
1.6053 / 0.26 ≈ 6.17×
```

Therefore, the reference image is approximately **6.2× coarser in spatial resolution** than the OHRC source.

Pair A therefore provides a real test of:

* cross-sensor registration
* cross-resolution matching
* illumination differences
* viewing differences
* large-image processing

---

# 🗂️ Data Policy

Large scientific datasets are intentionally **not stored in Git**.

Do NOT commit:

```text
*.IMG
*.img
large *.zip
large TIFF/JP2 files
raw scientific datasets
model checkpoints
virtual environments
cache files
large generated outputs
secrets
.env files
```

The repository contains:

* source code
* documentation
* configurations
* tests
* experiment metadata
* selected small visual results

Original scientific data must remain untouched.

See:

```text
data/README.md
```

for dataset setup instructions.

---

# 🏗️ System Architecture

LUNA-REG is divided into three engineering areas.

```text
┌───────────────────────────┐
│        FRONTEND            │
│        TEAM 3              │
│      UI / UX               │
└─────────────┬─────────────┘
              │
              │ HTTP / API
              ▼
┌───────────────────────────┐
│         BACKEND            │
│         TEAM 2             │
│ API + DB + Storage         │
└─────────────┬─────────────┘
              │
              │ Core Interface
              ▼
┌───────────────────────────┐
│       AI / ML CORE         │
│         TEAM 1             │
│ Processing + Registration  │
└───────────────────────────┘
```

### Dependency Direction

```text
Frontend → Backend → Core
```

This separation keeps each team independent while providing clean integration points.

---

# 👥 Team Structure

## Team 1 — AI/ML Architect & Processing Unit Manager

Owns:

```text
core/
```

Responsible for:

* scientific image loading
* preprocessing
* feature detection
* feature description
* feature matching
* geometric verification
* registration
* evaluation
* correspondence filtering
* spatial distribution
* sub-pixel refinement
* adaptive strategy
* AI/ML models

---

## Team 2 — Backend Designer & Database Manager

Owns:

```text
backend/
```

Responsible for:

* API
* request handling
* database
* storage
* experiment/result persistence
* job/status management
* integration with the AI/ML core

Initial backend technology:

```text
Python
FastAPI
SQLite
```

The backend should not implement the actual ML algorithms.

---

## Team 3 — UI/UX Designer & Frontend Manager

Owns:

```text
frontend/
```

Responsible for:

* UI/UX
* image upload
* input selection
* processing status
* registered-image display
* correspondence visualization
* metrics visualization

The frontend communicates through the backend API.

---

# 📁 Repository Structure

```text
LUNA-REG/
│
├── core/              # Team 1 — AI/ML + processing
├── backend/           # Team 2 — API + database + storage
├── frontend/          # Team 3 — UI/UX + frontend
│
├── docs/              # Shared research + documentation
├── configs/           # Shared configurations
├── tests/             # Testing
├── data/              # Local datasets
├── experiments/       # Experiment results/logs
├── scripts/           # Utilities
│
├── README.md
├── LICENSE
├── requirements.txt
└── .gitignore
```

---

# ⚙️ Core Registration Pipeline

```text
Source Image + Reference Image
              ↓
      Product Interpretation
              ↓
      Pair Characterization
              ↓
          Preprocessing
              ↓
  Feature / Representation Generation
              ↓
       Candidate Matches
              ↓
 Reliability + Spatial Filtering
              ↓
    RANSAC / Geometric Verification
              ↓
     Transformation Estimation
              ↓
        Image Warping
              ↓
    Sub-Pixel Refinement
              ↓
          Evaluation
              ↓
       ┌──────┴──────┐
       │             │
     SUCCESS       FAILURE
       │             │
       ▼             ▼
     Result      Adaptive Retry
```

---

# 🔬 Algorithms

## Classical Baselines

Initial:

* ORB
* SIFT
* AKAZE

Optional:

* ASIFT

## Radiation / Multimodal

* RIFT
* RIFT2

## Learned

* SuperPoint + SuperGlue
* SuperPoint + LightGlue
* LoFTR

Each method must be experimentally evaluated rather than assumed to be superior.

---

# 🖼️ Preprocessing

Preprocessing is modular.

Potential strategies:

* raw calibrated image
* percentile normalization
* min-max normalization
* histogram equalization
* CLAHE
* gamma / log transform
* shadow-aware processing
* gradients / edges
* multi-scale image pyramids

Every preprocessing experiment must record:

* method
* parameters
* result
* effect on registration quality

---

# 📐 Geometric Registration

Supported transformation models:

* Translation
* Similarity
* Affine
* Homography

The system should not automatically assume homography is always physically appropriate.

Robust geometric estimation such as RANSAC must be used where appropriate.

---

# 🎯 Correspondence Reliability

Raw match count is NOT the only objective.

The system must consider:

* match confidence
* descriptor consistency
* mutual consistency where appropriate
* RANSAC consistency
* reprojection error
* inlier ratio
* spatial coverage
* clustering

A smaller number of reliable, spatially distributed correspondences may be preferable to thousands of weak or clustered matches.

---

# 📊 Evaluation Metrics

Every experiment should record:

### Matching

* Feature count
* Candidate match count
* Accepted matches
* Inlier count
* Inlier ratio

### Geometry

* Transformation model
* RANSAC configuration
* Reprojection error
* RMSE
* Median error
* Maximum error where meaningful

### Registration

* Success / failure
* Coverage
* Spatial correspondence coverage

### Performance

* Preprocessing time
* Feature extraction time
* Matching time
* Transformation estimation time
* Total runtime
* RAM usage
* VRAM usage
* CPU/GPU device

### Research

* Failure reason
* Observations
* Output path

---

# 🔬 Sub-Pixel Accuracy

Floating-point coordinates do NOT automatically mean sub-pixel accuracy.

Sub-pixel accuracy must be experimentally demonstrated.

Possible approaches include:

* local correlation
* patch optimization
* least-squares refinement
* intensity/gradient optimization
* sub-pixel keypoint localization

The evaluation methodology must clearly document how the accuracy claim is obtained.

---

# 🤖 Adaptive Processing

The eventual adaptive system will use measured evidence.

Possible input signals:

* feature density
* scale ratio
* illumination difference
* match count
* inlier ratio
* RMSE
* spatial coverage
* image size
* estimated computational cost

Example:

```text
Easy Pair
   ↓
Cheap Matcher
   ↓
Quality Check
   ├── PASS → Accept
   └── FAIL
          ↓
     Escalate
          ↓
Alternative preprocessing / stronger matcher
          ↓
Re-evaluate
```

Possible escalation:

```text
SIFT / AKAZE
    ↓
RIFT2
    ↓
LightGlue / SuperGlue
    ↓
LoFTR
```

The exact strategy must be determined experimentally.

---

# 🖥️ GPU Support

When an NVIDIA GPU is available:

1. Detect GPU.
2. Verify driver.
3. Verify CUDA.
4. Install CUDA-compatible PyTorch.
5. Verify `torch.cuda.is_available()`.
6. Run supported deep-learning models on GPU.
7. Record GPU and VRAM usage.

GPU acceleration is especially important for:

* SuperGlue
* LightGlue
* LoFTR
* other transformer/deep-learning methods

Never claim GPU usage unless it actually occurred.

---

# 🧪 Experimental Strategy

### Phase 1 — Baseline

```text
ORB
SIFT
AKAZE
```

### Phase 2 — Radiometric Robustness

```text
Preprocessing Ablations
RIFT / RIFT2
```

### Phase 3 — Learned Matching

```text
SuperPoint + SuperGlue
SuperPoint + LightGlue
LoFTR
```

### Phase 4 — Difficult Conditions

Test:

* strong shadows
* low Sun angle
* weak texture
* large scale difference
* heterogeneous sensors
* polar imagery when available

### Phase 5 — Reliability

Add:

* confidence filtering
* spatial selection
* geometric consistency

### Phase 6 — Refinement

Investigate:

* sub-pixel refinement

### Phase 7 — Adaptive Strategy

Construct the adaptive system from the measured results.

---

# 🧩 Ablation Study

The project will evaluate the system incrementally:

```text
A — Baseline Matcher

B — Baseline
    + Illumination Handling

C — B
    + Reliability / Spatial Selection

D — C
    + Geometric Feedback

FULL SYSTEM
    + Adaptive Computation
```

The contribution of each stage should be measurable independently.

---

# 📝 Experiment Logging

Every experiment should produce a structured record containing:

```text
Experiment ID
Date
Dataset
Image Pair
Sensor
Region
Illumination Category
Scale Category
Resolution Category
Method
Model Version
Preprocessing
Feature Count
Matcher Configuration
RANSAC Configuration
Transformation Model
Inlier Count
Inlier Ratio
RMSE
Reprojection Error
Registration Success
Processing Time
Memory Usage
Failure Notes
Output Path
```

Store results as:

* JSON
* CSV
* Markdown reports
* plots / visualizations

---

# ❌ Failure Analysis

Failure is part of the research.

Possible failure categories:

* insufficient features
* weak texture
* repetitive terrain
* illumination / shadow
* scale mismatch
* viewpoint mismatch
* false correspondences
* geometric degeneracy
* insufficient overlap
* RAM limitation
* VRAM limitation
* dependency failure
* model/domain-gap issue
* implementation issue

Failed experiments must remain documented.

---

# 🤝 Collaboration Workflow

Do not develop directly on `main`.

Recommended workflow:

```text
Feature Branch
      ↓
Pull Request
      ↓
Code Review
      ↓
develop
      ↓
Testing
      ↓
main
```

Example branches:

```text
team1/preprocessing
team1/sift-baseline
team1/rift2

team2/backend-api
team2/database
team2/integration

team3/frontend
team3/upload
team3/results
```

Keep commits focused and descriptive.

Examples:

```text
Add PDS metadata parser
Implement SIFT registration baseline
Add registration result schema
Add registration API endpoint
Add result visualization
```

---

# 🔗 Core ↔ Backend Interface

The AI/ML core should expose a clean interface conceptually similar to:

```python
result = register_images(
    moving_image,
    reference_image,
    config
)
```

The result should contain information such as:

```text
status
registered image
correspondences
method
transformation
inlier count
inlier ratio
RMSE
reprojection error
runtime
device
failure information
```

The backend should depend on this stable interface rather than directly depending on individual algorithm implementations.

---

# 📚 Documentation

The repository should maintain:

```text
docs/
├── DATA.md
├── METHODS.md
├── EXPERIMENTS.md
├── RESULTS.md
├── FAILURES.md
├── RESEARCH_NOTES.md
└── ARCHITECTURE.md
```

Also maintain:

```text
PROJECT_STATUS.md
```

`PROJECT_STATUS.md` should summarize:

* environment
* GPU
* implemented methods
* executed methods
* unavailable methods and reasons
* Pair-A results
* failure modes
* adaptive-system status
* research conclusions
* next experiments

---

# ⚠️ Research Integrity

Never:

* fabricate metrics
* fabricate benchmark results
* report literature results as project results
* claim sub-pixel accuracy without evidence
* claim existing algorithms as novel
* hide failed experiments
* silently replace unavailable models

Always distinguish between:

**Literature Result**
What previous research reported.

**Experimental Result**
What LUNA-REG actually measured.

**Engineering Observation**
What we observed while implementing the system.

**Hypothesis**
What we think may work but still need to validate.

---

# 🚀 Current Development Priority

The immediate goal is NOT the final UI and NOT the final adaptive system.

The first milestone is:

```text
Environment Audit
       ↓
Pair-A Metadata Inspection
       ↓
.IMG Windowed Reader
       ↓
ROI / Overlap Inspection
       ↓
SIFT Baseline
       ↓
RANSAC Registration
       ↓
Visual Output
       ↓
Metrics
       ↓
Experiment Log
```

After this works, progressively add:

```text
ORB / AKAZE
      ↓
Preprocessing Experiments
      ↓
RIFT2
      ↓
SuperGlue / LightGlue
      ↓
LoFTR
      ↓
Spatial Reliability
      ↓
Sub-Pixel Refinement
      ↓
Comparative Evaluation
      ↓
Adaptive Strategy
```

---

# 🌕 Long-Term Vision

LUNA-REG aims to become a practical research-grade lunar correspondence and registration framework that balances:

**Accuracy**
+
**Robustness**
+
**Correspondence Reliability**
+
**Spatial Coverage**
+
**Computational Efficiency**

The system should ultimately be driven by **experimental evidence rather than assumptions**.

---

## 📌 Current Status

**Project:** LUNA-REG
**Problem Statement:** SIH26166
**Implementation:** Python
**UI:** Deferred
**Current Real Dataset:** Pair A — Chandrayaan-2 OHRC ↔ LROC NAC
**Repository:** Public GitHub
**Current Stage:** Research + Initial Engineering
**Next Milestone:** Baseline registration pipeline

---

### Built for lunar research. Designed for robust correspondence. 🌕

```
```
