# LUNA-REG: Frontend Integration & Verification Checklist

**Platform**: LUNA-REG (Multi-Modal Lunar Image Registration Workstation)  
**Problem Statement**: SIH26166 (ISRO SAC — Chandrayaan-2 Planetary Image Alignment)  
**Version**: `v3.1.0` (Part 8 Master Integration & System Polish)  
**Design Standard**: ISRO Lunar GIS Mission-Control (Obsidian `#07080a`, Deep Charcoal `#111317`, `#16191f`, Lunar Grey `#8e939d`, Off-White `#eaebee`, Champagne Gold `#dfc08a`, Warm Amber `#e5a93b`, Zero Blue Palette).

---

## 1. Implemented Pages & Workspaces

| Page / Workspace | Hash Route | Key Capabilities | Service Integration |
| :--- | :--- | :--- | :--- |
| **Mission Dashboard** | `#/dashboard`, `#/overview` | Live backend health, database catalog statistics, telemetry badges, quick registration entry point, available pairs table. | `/health`, `/api/info`, `/api/v1/products`, `/api/v1/pairs`, `/api/v1/regions` |
| **Lunar Map & GIS Explorer** | `#/lunar-map`, `#/explorer`, `#/map` | Interactive HiDPI 2D canvas, Moon 2000 IAU/IAG equirectangular projection, graticule, scale bar, 5 toggleable GIS layers with opacity controls, footprint polygons, overlap geometry rendering, click-to-inspect feature drawer, Lat/Lon readout. | `LunarMapPage`, `LunarMapCanvas`, `MapLayerPanel`, `FeatureInfoPanel` |
| **New Registration Preparation** | `#/register`, `#/new-registration`, `#/new-reg` | Dual-mode preparation: Database Pair staging (from real `/pairs` catalog) & Manual Drag-and-Drop upload (with client-side TIFF/PNG/JPG validation and 50MB limits). | `pairService.getRegistrationInput()`, file validation |
| **Registration Processing** | `#/processing`, `#/processing/{id}` | Dedicated stage runner interface with graceful notice indicating that backend processing endpoints are pending deployment. | Safe staging notice |
| **Registration Results** | `#/results` | Sub-pixel alignment viewer, split-slider comparison, overlay blend, difference heatmaps, scientific metrics panel, metadata accordion. | `resultsPage.init()`, empty state when no job |
| **Analysis Tools Workspace** | `#/analysis-tools`, `#/analysis` | Deep scientific inspection: dual-raster pixel probe, coordinate readouts, measurement tools, affine transformation parameters, error histogram. | `analysisToolsPage.init()`, empty state fallback |
| **Planetary Dataset Explorer** | `#/dataset`, `#/products`, `#/pairs`, `#/regions` | Unified catalog explorer with overview cards, multi-dimensional filters (region, mission, instrument, product type, calibration status, overlap status, resolution), sortable paginated tables, and inspection drawers. | `/api/v1/products`, `/api/v1/pairs`, `/api/v1/regions`, `/products/{id}/files` |
| **Registration History** | `#/history` | Past registration jobs ledger with empty state handling ("No registrations yet"). | History empty state |
| **About LUNA-REG** | `#/about` | Scientific mission background, Chandrayaan-2 specifications, PDS4 geodetic records, architectural UX standards. | Static mission brief |
| **404 Route Not Found** | `#/not-found` (or any unrecognized hash) | Dedicated mission control fallback page featuring loss-of-signal radar animation, attempted route readout, and direct navigational links. | Client routing fallback |

---

## 2. Available Backend REST Endpoints

All live modules interact with the real FastAPI backend through the centralized client layer (`frontend/src/services/api.js`).

| Method | Endpoint | Description | Frontend Handler |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service liveness & health check (`{"status":"healthy"}`) | `SystemService.getHealth()` |
| `GET` | `/api/info` | Application metadata, API version, and environment | `SystemService.getApiInfo()` |
| `GET` | `/api/v1/regions` | Canonical lunar target regions (e.g. Tycho Crater, Shackleton) | `RegionService.getRegions()` |
| `GET` | `/api/v1/regions/{id}` | Specific region boundary geometry and metadata | `RegionService.getRegionById()` |
| `GET` | `/api/v1/products` | PDS4 lunar products filtered by mission, instrument, region | `ProductService.getProducts()` |
| `GET` | `/api/v1/products/{id}` | Detailed product metadata and footprint coordinates | `ProductService.getProductById()` |
| `GET` | `/api/v1/products/{id}/files` | Physical and cloud asset inventory associated with product | `ProductService.getProductFiles()` |
| `GET` | `/api/v1/pairs` | Multi-modal image pairs with overlap status & geometry | `PairService.getPairs()` |
| `GET` | `/api/v1/pairs/{id}` | Pair verification details and overlap ratio | `PairService.getPairById()` |
| `GET` | `/api/v1/pairs/{id}/registration-input` | Complete paired scientific metadata and raster file definitions | `PairService.getRegistrationInput()` |

---

## 3. Missing Future Registration Endpoints

The frontend client is architected to immediately attach to asynchronous registration-processing endpoints as soon as deployed by the backend team.

| Planned Method | Planned Endpoint | Payload / Format | Expected Response | Current Frontend Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | `multipart/form-data`<br>(reference_image, target_image, detector, geometric_model) | `{"job_id": "LR-XXXXXX", "status": "processing"}` | UI stages metadata from `/pairs/{id}/registration-input` and displays clear notice: *"Registration metadata staged. Backend registration runner is pending deployment."* |
| `GET` | `/api/register/{id}/status` | Query parameter / Path ID | `{"status": "processing", "stage": "feature_matching", "progress": 45}` | Polling logic is prepared in `RegistrationPreparationPage.js` and `api.js` (3000ms polling with timeout). |
| `GET` | `/api/register/{id}/result` | Path ID | `{"status": "completed", "metrics": {...}, "matches": [...]}` | Results and Analysis pages show honest empty states until real alignment data is returned. |
| `GET` | `/api/register/history` | Query parameters | `[ { "id": "LR-XXXXXX", "status": "Completed" } ]` | Shows *"No registrations yet"* empty state when empty. |

---

## 4. Environment Variable Setup

The frontend supports runtime, environment, and local storage overrides without requiring rebuilds:

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api/v1` | Base URL for REST API routes |
| `VITE_BACKEND_ROOT` | `http://127.0.0.1:8000` | Base URL for root health checks (`/health`) and static assets |
| `localStorage['LUNA_REG_VITE_API_BASE_URL']` | *(User configured)* | Live client override configurable via the Header API Status modal |
| `localStorage['LUNA_REG_VITE_BACKEND_ROOT']` | *(User configured)* | Live root override configurable via the Header API Status modal |

### Local Configuration Example (`frontend/.env`):
```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_BACKEND_ROOT=http://127.0.0.1:8000
```

---

## 5. Route List & Navigation Deep-Links

The application uses hash-based SPA routing compatible with static servers, GitHub Pages, and local file systems:

* `#/dashboard` (Aliases: `#/overview`, `""`, `"#"`) — Mission overview dashboard
* `#/lunar-map` (Aliases: `#/explorer`, `#/map`) — GIS canvas explorer
* `#/register` (Aliases: `#/new-registration`, `#/new-reg`) — Registration preparation workspace
* `#/processing` — Active registration processing monitor
* `#/results` — Post-registration alignment viewer (supports `?pair_id=1` or `?job_id=LR-XXXXXX`)
* `#/analysis-tools` (Alias: `#/analysis`) — Scientific inspection and transformation metrics
* `#/dataset` — Unified planetary dataset explorer
* `#/products` — Opens Dataset Explorer with the **Products** subtab pre-selected
* `#/pairs` — Opens Dataset Explorer with the **Pairs** subtab pre-selected
* `#/regions` — Opens Dataset Explorer with the **Regions** subtab pre-selected
* `#/history` — Registration job ledger
* `#/about` — Mission specifications and architecture
* `#/not-found` — Fallback 404 error page

---

## 6. Testing & Quality Assurance Checklist

- [x] **Route Integrity**: Verified that all primary routes, aliases, subtabs, and deep-link query parameters navigate cleanly.
- [x] **404 Fallback**: Verified that visiting an unrecognized route (e.g. `#/test-route-invalid`) triggers the 404 mission control view with return links.
- [x] **Global Health Telemetry**: Live polling of `/health` and `/api/info` updates the top navigation status badge, latency readout in milliseconds, and sidebar status circle.
- [x] **Diagnostics Inspector**: Clicking the topbar API status indicator opens the diagnostics modal with real round-trip pinging and editable base URL.
- [x] **Toast & Notification System**: Toast notifications fire for real user actions (`info`, `warning`, `error`, `success`); genuine session telemetry logs populate the `#btn-notifications` drawer.
- [x] **Zero Fake Data Policy**: All tables, drawers, metrics, and cards strictly display real backend data or safe null indicators (`—` or `Not available`). No artificial RMSE or inlier numbers are fabricated.
- [x] **File Download Security**: Product files list storage providers (`LOCAL_STORAGE`); direct file download buttons are disabled with notices that rasters are maintained on protected storage.
- [x] **Zero Direct SQLite / Drive Access**: Verified that no SQLite imports or Google Drive access keys exist on the client.
- [x] **Manual Upload Validation**: Validates file types (`.tif`, `.tiff`, `.png`, `.jpg`, `.jpeg`) and enforces a 50MB file size limit with user-friendly toast warnings.
- [x] **Accessibility (WCAG 2.1 AA)**: Skip navigation link, visible `:focus-visible` gold rings, descriptive ARIA attributes, semantic landmarks, and full keyboard escape modal handling.
- [x] **Zero-Blue Palette**: Verified 100% adherence to obsidian black, deep charcoal, lunar grey, champagne gold, and warm amber. Zero blue color tokens.
- [x] **Mobile Responsiveness**: Verified that topbar tools wrap, canvas expands, floating drawers adjust, and touch buttons satisfy 44px min touch targets.

---

## 7. Known Limitations

1. **Backend Processing Engine**: The backend has not yet implemented the `POST /api/register` execution runner. The frontend properly stages inputs and informs the operator without fabricating simulated convergence.
2. **Raw Tile Streaming**: The canvas renders satellite footprints, overlap polygons, and graticules; integration with dynamic XYZ/WMTS lunar map tile servers will activate once tile endpoints are hosted.
3. **Restricted File Downloads**: Planetary raster assets residing on server local storage cannot be directly downloaded to client disk without backend-mediated signed download URLs.

---

## 8. Future Improvements

* **WebAssembly Feature Matcher**: Client-side preview matching for rapid keypoint visualization before submitting large jobs.
* **WMTS Tile Cache Integration**: Ingesting LROC WAC global morphologic basemap and LOLA DEM digital elevation tiles.
* **3D Terrain Mesh Projection**: Three.js lunar globe visualization with Chandrayaan-2 ground-track orbit overlays.
* **Batch Registration Queues**: Multi-pair batch job submission with concurrent pipeline tracking.
