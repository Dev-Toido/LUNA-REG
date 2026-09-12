# LUNA-REG: Backend API Contract & Integration Specification

**Project**: LUNA-REG (Multi-Modal Lunar Image Registration)  
**Theme**: Lunar Terrain Explorer — Map & GIS — ISPE  
**Purpose**: Scientific multi-modal lunar satellite image registration platform for Chandrayaan-2 planetary data.

This document formally specifies the REST API contract between the LUNA-REG frontend and backend registration service.

---

## 1. Global Configuration

* **Environment Variable**: `VITE_API_BASE_URL`
* **Default Base URL**: `http://localhost:8000`
* **Client Override**: Stored in `localStorage['LUNA_REG_VITE_API_BASE_URL']` and configurable live via the UI.
* **Content Types**:
  * Registration submission: `multipart/form-data`
  * Status and results endpoints: `application/json`

---

## 2. API Endpoints Specification

### 2.1. Submit Image Registration Job

Initiates an asynchronous multi-modal registration job with the provided lunar satellite files.

* **Method**: `POST`
* **Endpoint**: `/api/register`
* **Content-Type**: `multipart/form-data` *(Note: The browser sets the boundary automatically. Do not manually set `Content-Type` header).*

#### Request Fields

| Field Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `reference_image` | `File` (Binary) | **Yes** | Base lunar image for alignment (PNG, JPG, JPEG, TIFF up to 50 MB). |
| `target_image` | `File` (Binary) | **Yes** | Lunar image to be aligned/registered (PNG, JPG, JPEG, TIFF up to 50 MB). |
| `registration_mode` | `string` | No | Registration mode: `"automatic"` (default) or `"manual"`. |
| `detector` | `string` | No | Feature detector algorithm: `"sift"`, `"orb"`, `"akaze"`, etc. *(Confirm with backend team)* |
| `outlier_filter` | `string` | No | Outlier rejection model: `"ransac"`, `"magsac"`, etc. *(Confirm with backend team)* |
| `geometric_model` | `string` | No | Transformation type: `"homography"`, `"affine"`, `"rigid"`. *(Confirm with backend team)* |
| `subpixel_refinement` | `boolean` | No | Enable Levenberg-Marquardt sub-pixel optimization. *(Confirm with backend team)* |
| `clahe_normalization` | `boolean` | No | Contrast-limited adaptive histogram equalization. *(Confirm with backend team)* |

#### Expected Response (HTTP 200 OK / HTTP 201 Created / HTTP 202 Accepted)

```json
{
  "job_id": "LR-482910",
  "status": "processing",
  "message": "Registration job initialized and queued for processing"
}
```

*Required Response Field*:
* `job_id` (`string`): Unique scientific job identifier (e.g. `LR-XXXXXX`).

---

### 2.2. Get Registration Job Status

Polls the processing status of an active registration job.

* **Method**: `GET`
* **Endpoint**: `/api/register/{job_id}/status`
* **Polling Interval**: Every 3 seconds (`3000ms`).

#### Expected Response (HTTP 200 OK)

```json
{
  "job_id": "LR-482910",
  "status": "processing",
  "stage": "feature_matching",
  "progress": 45,
  "message": "Matching multi-scale feature descriptors across orbit passes",
  "created_at": "2026-09-12T15:20:00Z",
  "elapsed_seconds": 3.4
}
```

#### Possible Job Statuses

| Status | Meaning | Frontend Action |
| :--- | :--- | :--- |
| `queued` | Job is in the task queue awaiting compute resources. | Continue polling (3s). Display "Queued in queue". |
| `processing` | Job is actively running alignment pipeline. | Continue polling (3s). Update current stage and progress. |
| `completed` | Registration completed successfully. | **Stop polling**. Request `/api/register/{job_id}/result` and navigate to Results view. |
| `failed` | Registration failed or could not converge. | **Stop polling**. Display dedicated failure state with error details. |
| `cancelled` | Job was cancelled by user or operator. | **Stop polling**. Display cancellation message. |

#### Standardized Scientific Pipeline Stages *(Confirm with backend team)*

1. `validation` / `image_validation`: Verifying file geometry, bit depth, and raster dimensions.
2. `preprocessing`: Radiometric calibration, CLAHE normalization, and gradient scaling.
3. `feature_extraction`: Multi-scale keypoint detection (SIFT / Affine covariant detectors).
4. `feature_matching`: Cross-illumination feature descriptor matching across orbit passes.
5. `geometric_verification`: Robust spatial consensus and outlier rejection via RANSAC.
6. `multimodal_validation`: Cross-sensor consistency and residual error assessment.
7. `registration`: Transformation parameter estimation (Homography / Projective warp).
8. `result_generation`: Sub-pixel Levenberg-Marquardt refinement and warped raster output.

*(Note: If the backend returns general status without specific stages, the frontend displays general progress without fabricating individual step completions).*

---

### 2.3. Get Registration Results

Retrieves completed registration output rasters, correspondence coordinates, and scientific accuracy metrics.

* **Method**: `GET`
* **Endpoint**: `/api/register/{job_id}/result`

#### Expected Response (HTTP 200 OK)

```json
{
  "job_id": "LR-482910",
  "status": "completed",
  "registered_image_url": "/api/register/LR-482910/download/registered.tif",
  "reference_image_url": "/api/register/LR-482910/download/reference.tif",
  "target_image_url": "/api/register/LR-482910/download/target.tif",
  "report_url": "/api/register/LR-482910/download/report.pdf",
  "metrics": {
    "rmse": 0.318,
    "inlier_ratio": 0.918,
    "inlier_matches": 1311,
    "total_matches": 1428,
    "confidence": 0.964,
    "processing_time": "2.45 s",
    "transformation_type": "Homography (8-DOF)"
  },
  "matches": [
    { "ref_x": 1024.4, "ref_y": 512.2, "tgt_x": 1021.1, "tgt_y": 515.8, "residual": 0.12 }
  ],
  "metadata": {
    "sensor": "TMC-2",
    "gsd": "5.0m",
    "datum": "D_MOON_2000"
  }
}
```

*Missing Metrics Policy*:
* If any metric or URL is not returned by the backend, the frontend strictly displays `"Not available"` and keeps corresponding download actions disabled. No fake numbers or synthetic rasters are fabricated.

---

### 2.4. Get Registration History

Retrieves past registration jobs from the backend ledger.

* **Method**: `GET`
* **Endpoint**: `/api/register/history` *(Also supports `/api/jobs` - confirm with backend team)*

#### Expected Response (HTTP 200 OK)

```json
[
  {
    "id": "LR-482910",
    "date": "2026-09-12 15:20:00 UTC",
    "refName": "CH2_TMC2_NADIR_ORBIT4829.PNG",
    "refThumb": "/api/register/LR-482910/thumb/ref.jpg",
    "tgtName": "CH2_TMC2_LOWSUN_ORBIT4842.PNG",
    "tgtThumb": "/api/register/LR-482910/thumb/tgt.jpg",
    "status": "Completed",
    "processingTime": "2.45 s",
    "metrics": { "rmse": 0.318 }
  }
]
```

*Empty State*:
* If empty list (`[]`) or endpoint returns 404, the frontend cleanly renders: `"No registrations yet."` without crashing.

---

## 3. Standardized HTTP Error Handling

| HTTP Code | Error Meaning | User-Facing Message |
| :--- | :--- | :--- |
| **0 / Network** | Server unreachable or CORS failure. | *"Registration service is currently unavailable. Please check your backend connection."* |
| **400 Bad Request** | Missing required parameters or malformed payload. | *"Invalid request. Please check your image selection and try again."* |
| **401 Unauthorized** | Missing or invalid API credentials. | *"Authorization required to access the registration service."* |
| **403 Forbidden** | Insufficient permissions for this operation. | *"Access denied by planetary registration service."* |
| **404 Not Found** | Job ID or endpoint does not exist. | *"The requested registration job was not found."* |
| **413 Payload Too Large** | Files exceed server upload limits. | *"One or more files exceed the allowed size (maximum 50 MB)."* |
| **422 Unprocessable Entity** | Image decoding or scientific validation failed. | *"Unable to process selected lunar imagery. Please verify file integrity."* |
| **500 Internal Error** | Backend processing crash. | *"Registration service encountered an error. Please try again later."* |
| **Timeout (30s)** | Request exceeded maximum duration. | *"Connection to registration service timed out. Please try again."* |

---

## 4. Notes & Backend Alignment Flags

> [!NOTE]
> **Endpoints marked `Confirm with backend team`**:
> 1. Exact status property name: `status` vs `state`.
> 2. Specific stage names in `/status`: e.g. `feature_matching` vs `matching`.
> 3. Results download endpoint paths.
> 4. History endpoint location: `/api/register/history` vs `/api/jobs`.
> 
> The frontend service layer (`frontend/src/services/api.js`) centralizes all path mappings so that any backend team adjustments can be configured in a single location.
