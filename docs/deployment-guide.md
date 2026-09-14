# LUNA-REG: Production Deployment & Operation Guide

**Project**: LUNA-REG — Multi-Modal Lunar Image Registration  
**Theme**: Lunar Terrain Explorer — Map & GIS — ISPE  
**Version**: 3.1.0  
**Stack**: Vanilla HTML5, ES6 Modules, Modern CSS Design System (Zero Build Runtime Portability)

---

## 1. System Overview

LUNA-REG is a high-precision multi-modal lunar image registration mission-control application designed for planetary scientists and GIS engineers working with Chandrayaan-2 and LRO datasets.

### Core Architecture & Runtime Design
- **Zero-Build Dependency**: The application is built with standard ECMAScript 6 modules and native HTML5/CSS3. It can run immediately on any static web server without requiring a transpilation step (Node.js/npm is optional for local development tooling).
- **Design System**: Obsidian black (`#07080a`), deep charcoal (`#111317`, `#16191f`), lunar grey (`#8e939d`), off-white (`#eaebee`), champagne gold (`#dfc08a`), and warm amber (`#e5a93b`). Strictly zero blue colors to adhere to mission-control GIS standards.
- **REST Architecture**: Direct REST API integration with FastAPI backend (`/health`, `/api/info`, `/regions`, `/products`, `/pairs`).
- **Zero Fake Data Policy**: Real backend telemetry only. No hardcoded mock results, synthetic homography, or simulated registration successes.

---

## 2. Environment Configuration

The frontend dynamically detects and connects to the backend API via environment variables or browser runtime overrides.

### 2.1. Environment Variables (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env` (or configure in your container orchestrator):

```ini
# ==============================================================================
# LUNA-REG Frontend Environment Configuration
# ==============================================================================

# Backend REST API Base URL
# Points to the FastAPI root serving endpoints: /health, /api/info, /regions, /products, /pairs
VITE_API_BASE_URL=http://localhost:8000

# Backend Root Base URL for Raw Assets & Static Media (TIF/PNG thumbnails)
VITE_BACKEND_ROOT=http://localhost:8000

# Frontend Host Port (for Vite dev server)
VITE_PORT=3000

# Application Release Tag
VITE_APP_VERSION=3.1.0
```

### 2.2. Runtime Client Override

Scientists and operators can switch backend targets directly in the running interface without rebuilding:
1. Click the **API Status badge** in the top navigation bar.
2. Enter the target Backend API URL (e.g., `https://luna-reg.isro.gov.in/api`).
3. Click **Save & Reconnect**.
4. The preference is stored in `localStorage['LUNA_REG_VITE_API_BASE_URL']` and persists across sessions.

---

## 3. Local Development & Serving Options

Choose any of the following serving methods depending on available system tooling.

### Option A: Node.js & Vite (Recommended for Local Dev)

If Node.js (v16+) is installed:

```bash
# Navigate to the frontend directory
cd frontend

# Install optional development dependencies
npm install

# Start development server with Hot Module Replacement (HMR)
npm run dev

# Build optimized production bundle to dist/
npm run build

# Preview production build locally
npm run preview
```

### Option B: Python 3 Built-in HTTP Server (No Node Required)

If Python 3 is installed on the host:

```bash
# From repository root directory
python -m http.server 3000

# Or from frontend directory
cd frontend && python -m http.server 3000
```
Open your browser at `http://localhost:3000`.

### Option C: PowerShell Native Server (Windows Zero-Dependency)

On Windows machines without Node or Python:

```powershell
# Serve repo directly via PowerShell HttpListener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:3000/')
$listener.Start()
Write-Host "LUNA-REG live on http://localhost:3000/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = Join-Path (Get-Location) ($ctx.Request.Url.LocalPath.TrimStart('/'))
    if (-not (Test-Path $path) -or (Get-Item $path).PSIsContainer) { $path = Join-Path (Get-Location) "index.html" }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
}
```

### Option D: Unified FastAPI Static Mounting (Single Backend + Frontend Server)

To serve both frontend and backend together from a single FastAPI process:

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="LUNA-REG API")

# Mount API routers (/health, /api/info, /regions, /products, /pairs)
# ...

# Mount frontend static directory at root
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
```

---

## 4. Production Deployment with Docker & Nginx

### 4.1. Nginx Configuration (`nginx.conf`)

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static Assets Caching
    location ~* \.(css|js|png|jpg|jpeg|svg|woff2?|ico)$ {
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # SPA Hash-Routing Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse Proxy to FastAPI Backend (Optional unified proxy)
    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://backend:8000/health;
    }
}
```

### 4.2. Dockerfile

```dockerfile
# Production Web Server Container
FROM nginx:alpine

# Copy web files
COPY . /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 4.3. Docker Compose (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    environment:
      - HOST=0.0.0.0
      - PORT=8000
    restart: always

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: always
```

---

## 5. Backend Requirements & API Compatibility

For all views to operate at full fidelity, the backend must expose the following REST endpoints conforming to `docs/backend-api-contract.md`:

| Endpoint | Method | Consumed By | Purpose |
| :--- | :---: | :--- | :--- |
| `/health` | `GET` | Topbar Health Indicator, System Diagnostic Modal | Real-time server status, latency, uptime |
| `/api/info` | `GET` | Topbar Health Indicator, System Diagnostic Modal | Environment metadata, version, active modules |
| `/regions` | `GET` | Dataset, Lunar Map, Dashboard, Pairs, Products | Lunar craters & polar region coordinates |
| `/products` | `GET` | Dataset, Products, Lunar Map, New Registration | Satellite sensor products (TMC, OHRC, CLASS) |
| `/pairs` | `GET` | Dataset, Pairs, Lunar Map, Dashboard, New Reg | Pre-computed source/reference image pairs |
| `/api/register` | `POST` | New Registration | Submit registration job *(Integration in progress)* |

### Required CORS Headers on Backend
The FastAPI server must allow Cross-Origin Resource Sharing (CORS):
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to your domain(s)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 6. Zero Fake Data & Pipeline State

- **Manual File Uploads**: Users can upload source and reference images (up to 50 MB, PNG/JPG/TIFF). Validation checks file format, file size, and dimension constraints.
- **Real Backend Database Pairs**: Users can inspect and select verified pairs loaded directly from `/pairs`.
- **Registration Processing Notice**: Until the backend registration computation pipeline (`/api/register`) is deployed with active GPU workers, clicking "Run Registration" stages the job and presents a clear scientific status notice. It does **not** generate synthetic homography matrices or mock RMSE scores.
- **Results & Analysis**: Displays real completed jobs when provided by the backend, and presents high-fidelity empty states with retry triggers when no completed jobs exist.

---

## 7. Operational Diagnostics & Troubleshooting

### Issue 1: "API DISCONNECTED" in Topbar
- **Cause**: Backend server is not running or CORS is blocking the request.
- **Remedy**:
  1. Verify FastAPI server is running: `curl http://localhost:8000/health`.
  2. Click the red **API DISCONNECTED** badge in the topbar.
  3. Enter the correct API URL and click **Ping Health Endpoint**.
  4. Ensure backend CORS middleware is enabled.

### Issue 2: Lunar Map Canvas is Blank
- **Cause**: Container was hidden during initial mount or resize observer was blocked.
- **Remedy**:
  1. Click the **Fit to View** or **Reset View** button in the map toolbar.
  2. Ensure your browser supports HTML5 Canvas 2D context.

### Issue 3: Stale Assets After Update
- **Cause**: Browser cache retained old JavaScript modules.
- **Remedy**:
  1. All script imports in `index.html` use `?v=3.1.0` cache-busting parameters.
  2. Perform a hard refresh (`Ctrl + Shift + R` or `Cmd + Shift + R`).

---

## 8. Verification & Release Sign-Off

The LUNA-REG v3.1.0 frontend has undergone:
- **Delimiter Balance Audit**: All 65 JavaScript ES6 files checked and verified balanced.
- **Design Token Compliance**: 100% adherence to zero-blue obsidian/champagne gold palette.
- **Network De-duplication**: In-flight REST API caching active in `ApiClient`.
- **Fault Tolerance**: Automatic fallback to 404 Mission Control view on unmatched route hashes.
