# LUNA-REG — Lunar Terrain Explorer — Map & GIS
### Chandrayaan-2 Planetary Multi-Modal Image Registration GIS Platform (SIH26166)

A professional lunar geospatial exploration and image registration workbench built for ISRO scientists, planetary researchers, geologists, space technology experts, and hackathon evaluators.

---

## 🛰️ Core Workflows

1. **Explore Lunar Terrain**
   - Full-screen interactive lunar GIS canvas with smooth pan, zoom, scale bar, graticule, north arrow, selenographic crosshair coordinates, and crater ROI targeting (Tycho Crater, Aristarchus, Shackleton South Pole, Copernicus, Mare Serenitatis, Clavius).
   - Dynamic terrain shading styles: *Grayscale Nadir*, *Low-Sun Oblique Shadow*, *Topographic Hillshade*, and *Inverted Albedo*.
   - Selenographic telemetry panel displaying ground sampling distance (GSD), optical reflectance, solar incidence, sub-pixel residual error histogram, and 3x3 transformation homography matrices.

2. **Select & Preview Imagery**
   - Dedicated registration workspace supporting browser `File` objects (drag-and-drop or system file browser).
   - Strict format validation (PNG, JPG, JPEG, TIFF) and file size checks (up to 150 MB).
   - Interactive dual-image workspace with Fit to View, Zoom, Pan, and Reset.
   - Built-in Chandrayaan-2 TMC-2 reference and target calibration presets.

3. **Register Images via Real Backend API**
   - Clean, decoupled service layer in `frontend/src/services/api.js`.
   - Sends real `multipart/form-data` with `reference_image` and `target_image` to `POST /api/register`.
   - Configurable API base URL with interactive endpoint settings and latency testing.
   - Genuine error diagnostics with fallback calibration execution so judges can test downstream features even without an active GPU cluster.

4. **Monitor Scientific Processing**
   - Backend-driven status polling (`GET /api/register/{job_id}/status`).
   - 4-stage processing progress indicator (*Feature Extraction*, *Geometric Alignment*, *Sub-pixel Refinement*, *Quality Verification*).
   - Live streaming terminal log feed (`role="log"`, `aria-live="polite"`).

5. **Compare Registered Results**
   - 4 specialized comparison viewing modes:
     - **OVERLAY**: Blended multi-temporal imagery with real-time 0–100% opacity slider.
     - **SPLIT VIEW**: Interactive vertical split divider comparing reference against aligned target.
     - **BEFORE / AFTER**: Instant comparative toggle between original unaligned and registered aligned imagery.
     - **MATCHES**: Tie points and matching vectors with inlier filtering.

6. **Analyze Registration Quality & GIS Integration**
   - Scientific quality metrics: Total Matches, Inlier Count, Sub-pixel RMSE, Confidence Score, Transformation Matrix, Residual Error Histogram.
   - Direct integration into the lunar map canvas with layer toggling, opacity controls, and geospatial georeference notifications.
   - Registration History workspace with filterable status indicators (`Completed`, `Processing`, `Failed`, `Queued`) and instant result re-inspection.

---

## 🎨 Design System: Restrained Dark Lunar GIS

The interface strictly avoids generic blue themes and gaming aesthetics, adhering to planetary science standards:

- **Obsidian**: `#08080a` (Deep Space Foundation)
- **Lunar Grey**: `#101014`, `#18181f`, `#c5c5d6` (Regolith Tone)
- **Grayscale Terrain**: Photographic lunar topography
- **Champagne Gold**: `#dfc08a` (Primary Mission Accent & Focus Halos)
- **Warm Ivory**: `#f3e5c8` (High-Legibility Telemetry Readouts)

---

## ♿ Accessibility & Responsiveness

- **Keyboard Navigation**:
  - `1`, `2`, `3`, `4`: Instant view navigation (`Explorer`, `Registration`, `Results`, `History`).
  - `P`, `S`, `M`, `F`, `R`, `+`, `-`, `L`: Map tools (Pan, Select, Measure, Fullscreen, Reset, Zoom, Layers).
  - `Escape`: Universal dismissal of modals, dropdowns, and drawers.
  - Arrow Keys: Traversal across toolbar buttons and comparison viewer modes.
- **Focus States**: High-contrast champagne-gold halo (`:focus-visible`).
- **WCAG Compliance**: Contrast ratios strictly exceed WCAG AA/AAA guidelines.
- **Motion Sensitivity**: Reduced motion media query (`@media (prefers-reduced-motion: reduce)`) to disable decorative animations.
- **Responsive Viewports**:
  - Desktop & Laptop: 3-column GIS workspace.
  - Tablet: Off-canvas sidebar and slide-out terrain panel.
  - Mobile: Map-first layout with touch gestures and expandable bottom sheet.

---

## 📁 Project Structure

```
frontend/
├── assets/                  # Lunar calibration imagery (TMC-2 Nadir, Low-Sun, South Pole)
├── css/
│   └── style.css            # Restrained dark lunar design system & responsive layout
├── js/
│   └── app.js               # GIS engine, workflow controller, comparison viewer & hotkeys
├── src/
│   └── services/
│       └── api.js           # Decoupled backend API service layer (POST /api/register, polling)
├── index.html               # Semantic HTML5 application entry point
└── README.md                # Platform documentation
```
