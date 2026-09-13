# LUNA-REG: Backend API Integration Documentation

**Project**: LUNA-REG (Multi-Modal Lunar Image Registration)  
**Status**: Real Backend Integration Active  
**Base URL**: Configured dynamically via `import.meta.env.VITE_API_BASE_URL` (Default: `http://localhost:8000`)

---

## Important Architectural Notice

> **"Registration write/processing API is not available in the current frontend integration."**  
> All metadata, products, files, catalog pairs, and registration input packages are live and queried against the real FastAPI backend. Image registration execution and processing endpoints (e.g., `POST /register`) will be integrated when confirmed and deployed by the backend team.

---

## 1. System Diagnostics & Health Endpoints

### 1.1. Health Check
* **Endpoint**: `GET /health`
* **Purpose**: Verifies that the FastAPI backend service is online and healthy.
* **Response**:
```json
{
  "status": "healthy"
}
```

### 1.2. API Info & Telemetry
* **Endpoint**: `GET /api/info`
* **Purpose**: Retrieves backend platform metadata, API versions, and runtime environment.
* **Response**:
```json
{
  "name": "LUNA-REG",
  "version": "0.1.0",
  "api_version": "v1",
  "environment": "development"
}
```

---

## 2. Regions Endpoints

### 2.1. List Target Regions
* **Endpoint**: `GET /api/v1/regions`
* **Supported Filters**: None (returns all canonical lunar target regions)
* **Response**: Array of `Region` objects:
```json
[
  {
    "id": 1,
    "name": "Tycho Crater",
    "description": "Prominent lunar impact crater in southern highlands with extensive ray system",
    "center_lat": -43.31,
    "center_lon": -11.36,
    "min_lat": -45.0,
    "max_lat": -41.0,
    "min_lon": -14.0,
    "max_lon": -9.0,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### 2.2. Get Region By ID
* **Endpoint**: `GET /api/v1/regions/{region_id}`
* **Path Parameters**: `region_id` (`integer`)

---

## 3. Products & Product Files Endpoints

### 3.1. List Products
* **Endpoint**: `GET /api/v1/products`
* **Supported Filters (Query Parameters)**:
  * `instrument` (`string`, e.g., `OHRC`, `TMC-2`, `IIRS`)
  * `mission` (`string`, e.g., `CHANDRAYAAN-2`, `LRO`)
  * `region_id` (`integer`, e.g., `1`)
* **Combined Filters Example**: `GET /api/v1/products?instrument=OHRC&mission=CHANDRAYAAN-2&region_id=1`
* **Response**: Array of `Product` objects:
```json
[
  {
    "id": 1,
    "product_id": "ch2_tmc_nnd_20200115T061234123_d_img_d18",
    "instrument": "TMC-2",
    "mission": "CHANDRAYAAN-2",
    "product_type": "PDS4_IMAGE",
    "acquisition_time": "2020-01-15T06:12:34.123Z",
    "resolution": 5.0,
    "calibration_status": "CALIBRATED",
    "region_id": 1,
    "footprint_lat_min": -44.5,
    "footprint_lat_max": -42.1,
    "footprint_lon_min": -13.2,
    "footprint_lon_max": -10.1,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### 3.2. Get Product By ID
* **Endpoint**: `GET /api/v1/products/{product_id}`
* **Path Parameters**: `product_id` (`integer` database ID or canonical string ID)

### 3.3. Get Product Files
* **Endpoint**: `GET /api/v1/products/{product_id}/files`
* **Purpose**: Returns associated physical and cloud raster assets for a given product.
* **Security & Drive Handling**:
  * Frontend strictly avoids direct Google Drive downloads or accessing `.IMG` files from Drive directly.
  * `drive_file_id` is exposed only as debug/development metadata in UI badges.
* **Response**: Array of `ProductFile` objects:
```json
[
  {
    "id": 1,
    "product_id": 1,
    "file_role": "SOURCE_IMAGE",
    "file_name": "ch2_tmc_nnd_20200115T061234123.tif",
    "file_type": "TIFF",
    "storage_provider": "LOCAL_STORAGE",
    "drive_file_id": null,
    "drive_folder_id": null,
    "file_size_bytes": 104857600,
    "mime_type": "image/tiff",
    "checksum": "a1b2c3d4e5f6...",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

## 4. Pairs Endpoints

### 4.1. List Canonical Image Pairs
* **Endpoint**: `GET /api/v1/pairs`
* **Supported Filters (Query Parameters)**:
  * `source_instrument` (`string`, e.g., `OHRC`)
  * `reference_instrument` (`string`, e.g., `TMC-2`)
  * `overlap_status` (`string`, e.g., `VERIFIED`, `UNVERIFIED`, `CALCULATED`)
  * `region_id` (`integer`, e.g., `1`)
* **Combined Filters Example**: `GET /api/v1/pairs?source_instrument=OHRC&reference_instrument=TMC-2&overlap_status=UNVERIFIED`
* **Response**: Array of `Pair` objects:
```json
[
  {
    "id": 1,
    "region_id": 1,
    "source_product_id": 1,
    "reference_product_id": 2,
    "source_instrument": "OHRC",
    "reference_instrument": "TMC-2",
    "overlap_status": "VERIFIED",
    "overlap_area": 124.5,
    "overlap_ratio": 0.78,
    "verification_method": "POLYGON_INTERSECTION",
    "evidence_source": "SPICE_METADATA",
    "verification_notes": "Overlap verified via SPICE kernel footprint geometry",
    "overlap_geometry_json": "{\"type\":\"Polygon\",\"coordinates\":[...]}",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### 4.2. Get Pair By ID
* **Endpoint**: `GET /api/v1/pairs/{pair_id}`
* **Path Parameters**: `pair_id` (`integer`)

### 4.3. Get Pair Registration Input
* **Endpoint**: `GET /api/v1/pairs/{pair_id}/registration-input`
* **Purpose**: Crucial backend endpoint providing complete paired scientific metadata, dual product attributes, resolution metrics, and file assets required to prepare for registration.
* **Response Structure**:
```json
{
  "pair": {
    "id": 1,
    "region_id": 1,
    "source_product_id": 1,
    "reference_product_id": 2,
    "source_instrument": "OHRC",
    "reference_instrument": "TMC-2",
    "overlap_status": "UNVERIFIED",
    "overlap_area": null,
    "overlap_ratio": null,
    "verification_method": null,
    "evidence_source": null,
    "verification_notes": null,
    "overlap_geometry_json": null,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "source": {
    "product": {
      "id": 1,
      "product_id": "ch2_ohr_ncp_20200115T061234_d_img_d18",
      "instrument": "OHRC",
      "mission": "CHANDRAYAAN-2",
      "resolution": 0.25,
      "product_type": "PDS4_IMAGE",
      "acquisition_time": "2020-01-15T06:12:34Z",
      "calibration_status": "CALIBRATED",
      "region_id": 1,
      "footprint_lat_min": -44.2,
      "footprint_lat_max": -43.8,
      "footprint_lon_min": -12.1,
      "footprint_lon_max": -11.7,
      "created_at": "2024-01-01T00:00:00Z"
    },
    "files": [
      {
        "id": 10,
        "product_id": 1,
        "file_role": "SOURCE_IMAGE",
        "file_name": "ch2_ohr_ncp_20200115.tif",
        "file_type": "TIFF",
        "storage_provider": "LOCAL_STORAGE",
        "file_size_bytes": 524288000,
        "mime_type": "image/tiff"
      }
    ]
  },
  "reference": {
    "product": {
      "id": 2,
      "product_id": "ch2_tmc_nnd_20200115T061234_d_img_d18",
      "instrument": "TMC-2",
      "mission": "CHANDRAYAAN-2",
      "resolution": 5.0,
      "product_type": "PDS4_IMAGE",
      "acquisition_time": "2020-01-15T06:12:34Z",
      "calibration_status": "CALIBRATED",
      "region_id": 1,
      "footprint_lat_min": -45.0,
      "footprint_lat_max": -41.0,
      "footprint_lon_min": -14.0,
      "footprint_lon_max": -9.0,
      "created_at": "2024-01-01T00:00:00Z"
    },
    "files": [
      {
        "id": 20,
        "product_id": 2,
        "file_role": "REFERENCE_IMAGE",
        "file_name": "ch2_tmc_nnd_20200115.tif",
        "file_type": "TIFF",
        "storage_provider": "LOCAL_STORAGE",
        "file_size_bytes": 104857600,
        "mime_type": "image/tiff"
      }
    ]
  }
}
```

---

## 5. Frontend Service Layer Mapping

| Service File | Function | Integrated Endpoint | Supported Parameters |
| :--- | :--- | :--- | :--- |
| `src/services/systemService.js` | `getHealth()` | `GET /health` | None |
| `src/services/systemService.js` | `getApiInfo()` | `GET /api/info` | None |
| `src/services/regionService.js` | `getRegions()` | `GET /api/v1/regions` | None |
| `src/services/regionService.js` | `getRegionById(id)` | `GET /api/v1/regions/{id}` | `region_id` |
| `src/services/productService.js` | `getProducts(filters)` | `GET /api/v1/products` | `instrument`, `mission`, `region_id` |
| `src/services/productService.js` | `getProductById(id)` | `GET /api/v1/products/{id}` | `product_id` |
| `src/services/productService.js` | `getProductFiles(id)` | `GET /api/v1/products/{id}/files` | `product_id` |
| `src/services/pairService.js` | `getPairs(filters)` | `GET /api/v1/pairs` | `source_instrument`, `reference_instrument`, `overlap_status`, `region_id` |
| `src/services/pairService.js` | `getPairById(id)` | `GET /api/v1/pairs/{id}` | `pair_id` |
| `src/services/pairService.js` | `getRegistrationInput(id)` | `GET /api/v1/pairs/{id}/registration-input` | `pair_id` |

---

## 6. Null & Missing Data Guarantees

* `region_id` may be `null` &rarr; Displayed as `"Not assigned"`.
* `overlap_status` of `UNVERIFIED` &rarr; Restrained gold/amber warning indicator: `"Overlap has not yet been verified."`
* `overlap_area` or `overlap_ratio` is `null` &rarr; Displayed as `"Not available"` or `"Not calculated"`.
* Missing footprint bounds &rarr; Displayed as `"Footprint geometry not available."` (No fake coordinates fabricated).
* Telemetry metrics when offline &rarr; Displayed as `"--"`. Never display `0` unless returned by the API.
