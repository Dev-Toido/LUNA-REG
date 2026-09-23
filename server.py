#!/usr/bin/env python3
"""
LUNA-REG — Lunar Image Feature Matching Demo Web Server

A lightweight, zero-dependency HTTP server built with Python standard library
that serves the interactive mission control web application and handles routes
such as /feature-matching-demo and /api/demo-data.

Usage:
    python server.py
    python server.py --port 8080
"""

import argparse
import io
import json
import mimetypes
import os
import sys
import uuid
import zipfile
from datetime import datetime
from email.parser import BytesParser
from email.policy import default
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

# Ensure standard mime types are properly registered
mimetypes.init()
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("application/json", ".json")

# Set UTF-8 encoding for standard output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

WEB_DIR = PROJECT_ROOT / "frontend" if (PROJECT_ROOT / "frontend").is_dir() else PROJECT_ROOT / "web"
STAGED_DIR = PROJECT_ROOT / "data" / "staged_inputs"
REGISTRATIONS_DIR = PROJECT_ROOT / "data" / "registrations"
STAGED_DIR.mkdir(parents=True, exist_ok=True)
REGISTRATIONS_DIR.mkdir(parents=True, exist_ok=True)

try:
    from core.processing_engine import ProcessingEngine
except ImportError:
    try:
        from src.core.processing_engine import ProcessingEngine
    except ImportError:
        ProcessingEngine = None


class LunaRegHTTPHandler(BaseHTTPRequestHandler):
    server_version = "LunaRegDemoServer/1.0"

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path

        # Route 1: Home & /feature-matching-demo -> serve web/index.html
        if clean_path in ["/", "/feature-matching-demo", "/index.html"]:
            self.serve_file(WEB_DIR / "index.html", "text/html; charset=utf-8")
            return

        # Route 2: Input Module -> serve web/input_module.html
        if clean_path in ["/input", "/input-module", "/input.html", "/input_module.html"]:
            self.serve_file(WEB_DIR / "input_module.html", "text/html; charset=utf-8")
            return

        # Route 3: Processing Module -> serve web/processing_module.html
        if clean_path in ["/processing", "/processing-module", "/processing.html", "/processing_module.html"]:
            self.serve_file(WEB_DIR / "processing_module.html", "text/html; charset=utf-8")
            return

        # Route 4: Output Module -> serve web/output_module.html
        if clean_path in ["/output", "/output-module", "/output.html", "/output_module.html"]:
            self.serve_file(WEB_DIR / "output_module.html", "text/html; charset=utf-8")
            return

        # Route 5: Automated Test Runner -> serve web/test_runner.html
        if clean_path in ["/test-runner", "/test_runner.html", "/tests"]:
            self.serve_file(WEB_DIR / "test_runner.html", "text/html; charset=utf-8")
            return

        # Route 6: Download all artifacts as ZIP /api/v1/registration/jobs/<job_id>/download-all
        if clean_path.startswith("/api/v1/registration/jobs/") and clean_path.endswith("/download-all"):
            sub = clean_path[len("/api/v1/registration/jobs/"): -len("/download-all")].strip("/")
            self.handle_download_all_zip(sub)
            return

        # Route 7: List recent jobs /api/v1/registration/jobs
        if clean_path in ["/api/v1/registration/jobs", "/api/registration/jobs"]:
            self.handle_list_jobs()
            return

        # Route 8: Single job result /api/v1/registration/jobs/<job_id>
        if clean_path.startswith("/api/v1/registration/jobs/"):
            job_id = clean_path[len("/api/v1/registration/jobs/"):].strip("/")
            if job_id and "/" not in job_id:
                self.handle_get_job_result(job_id)
                return

        # Route 9: Registration visual artifacts /api/v1/registration/artifacts/<job_id>/<filename>
        if clean_path.startswith("/api/v1/registration/artifacts/"):
            subpath = clean_path[len("/api/v1/registration/artifacts/"):].lstrip("/")
            candidate = REGISTRATIONS_DIR / subpath
            try:
                resolved = candidate.resolve()
                if not str(resolved).startswith(str(REGISTRATIONS_DIR.resolve())):
                    self.send_error(403, "Access Denied: Path outside registrations directory")
                    return
                if resolved.is_file():
                    mime_type, _ = mimetypes.guess_type(str(resolved))
                    self.serve_file(resolved, mime_type or "image/png")
                    return
                else:
                    self.send_error(404, f"Artifact not found: {subpath}")
                    return
            except Exception as e:
                self.send_error(500, f"Error resolving artifact: {e}")
                return

        # Route 6: Staged inputs and data directory access
        if clean_path.startswith("/data/"):
            rel = clean_path.lstrip("/")
            cand = PROJECT_ROOT / rel
            try:
                resolved = cand.resolve()
                if not str(resolved).startswith(str((PROJECT_ROOT / "data").resolve())):
                    self.send_error(403, "Access Denied")
                    return
                if resolved.is_file():
                    mime_type, _ = mimetypes.guess_type(str(resolved))
                    self.serve_file(resolved, mime_type or "application/octet-stream")
                    return
            except Exception as e:
                self.send_error(500, f"Internal Error: {e}")
                return

        # Route 7: /api/demo-data -> JSON API endpoint for external/API inspection
        if clean_path == "/api/demo-data":
            self.serve_demo_api()
            return

        # Route 3: Static files under /css, /js, /assets
        # Normalize relative path safely
        rel_path = clean_path.lstrip("/")
        candidate_file = WEB_DIR / rel_path

        try:
            resolved = candidate_file.resolve()
            if not str(resolved).startswith(str(WEB_DIR.resolve())):
                self.send_error(403, "Access Denied: Path outside web directory")
                return

            if resolved.is_file():
                mime_type, _ = mimetypes.guess_type(str(resolved))
                if not mime_type:
                    mime_type = "application/octet-stream"
                if mime_type.startswith("text/") or mime_type in ["application/javascript", "application/json"]:
                    mime_type += "; charset=utf-8"
                self.serve_file(resolved, mime_type)
                return
        except Exception as e:
            self.send_error(500, f"Internal Error: {e}")
            return

        # Fallback 404
        self.send_error(404, f"File not found: {clean_path}")

    def serve_file(self, filepath: Path, content_type: str):
        try:
            with open(filepath, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def serve_demo_api(self):
        demo_data_summary = {
            "title": "LUNA-REG Feature Matching Demo API",
            "disclaimer": "DEMO MODE — VISUAL EXPLANATION ONLY. NOT REAL SCIENTIFIC OUTPUT.",
            "transformation": {
                "translation_x_px": 18.4,
                "translation_y_px": -12.2,
                "rotation_deg": 3.2,
                "scale_factor": 1.03,
                "mean_reprojection_error_px": 0.84,
                "inlier_ratio": 0.833
            },
            "features_total": 30,
            "inliers_confirmed": 25,
            "outliers_rejected": 5,
            "sensors": ["Chandrayaan-2 TMC-2", "Chandrayaan-2 OHRC"]
        }
        data_bytes = json.dumps(demo_data_summary, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data_bytes)

    def do_POST(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path

        if clean_path == "/api/stage-inputs":
            self.handle_stage_inputs()
            return

        if clean_path in ["/api/v1/registration/process", "/api/process"]:
            self.handle_registration_process()
            return

        self.send_error(404, f"Endpoint not found: {clean_path}")

    def handle_stage_inputs(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            content_type = self.headers.get("Content-Type", "")

            # Security limit: 120 MB max payload for staging
            if content_length > 120 * 1024 * 1024:
                self.send_error(413, "Payload Too Large: Max staging size is 120 MB")
                return

            body = self.rfile.read(content_length)
            session_id = f"stage_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
            session_dir = STAGED_DIR / session_id
            session_dir.mkdir(parents=True, exist_ok=True)

            files_recorded = {}

            if "multipart/form-data" in content_type:
                # Parse multipart body
                header_bytes = f"Content-Type: {content_type}\r\n\r\n".encode("latin1")
                full_msg = BytesParser(policy=default).parsebytes(header_bytes + body)
                
                for part in full_msg.iter_parts():
                    cd = part.get("Content-Disposition", "")
                    name = None
                    filename = None
                    for item in cd.split(";"):
                        item = item.strip()
                        if item.startswith("name="):
                            name = item.split("=", 1)[1].strip('"\'')
                        elif item.startswith("filename="):
                            filename = item.split("=", 1)[1].strip('"\'')
                    
                    if filename:
                        safe_filename = Path(filename).name
                        data = part.get_payload(decode=True)
                        target_path = session_dir / safe_filename
                        with open(target_path, "wb") as f:
                            f.write(data)
                        files_recorded[name or safe_filename] = {
                            "filename": safe_filename,
                            "size_bytes": len(data),
                            "path": str(target_path.relative_to(PROJECT_ROOT))
                        }
            else:
                # Handle JSON payload staging metadata
                try:
                    meta = json.loads(body.decode("utf-8"))
                    with open(session_dir / "staging_meta.json", "w", encoding="utf-8") as f:
                        json.dump(meta, f, indent=2)
                    files_recorded["metadata"] = meta
                except Exception:
                    pass

            response_data = {
                "status": "SUCCESS",
                "stage_id": session_id,
                "timestamp": datetime.now().isoformat(),
                "message": "Selected lunar images successfully staged for processing workflow.",
                "files": files_recorded,
                "pipeline_status": "READY_FOR_PROCESSING",
                "registration_algorithms_executed": False,
                "note": "Registration algorithms (SIFT, ORB, RANSAC, homography) strictly decoupled. Not run during input staging."
            }

            resp_bytes = json.dumps(response_data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(resp_bytes)

        except Exception as e:
            err_data = json.dumps({"status": "ERROR", "message": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(err_data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err_data)

    def handle_registration_process(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            content_type = self.headers.get("Content-Type", "")

            # Security limit: 150 MB max payload for registration
            if content_length > 150 * 1024 * 1024:
                self.send_error(413, "Payload Too Large: Max registration size is 150 MB")
                return

            body = self.rfile.read(content_length)
            job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
            job_dir = REGISTRATIONS_DIR / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            inputs_dir = job_dir / "inputs"
            inputs_dir.mkdir(parents=True, exist_ok=True)

            ref_path = None
            mov_path = None
            settings = {
                "ratio_threshold": 0.75,
                "ransac_threshold": 5.0,
                "max_features": 2000,
                "contrast_enhancement": True,
                "rescale_factor": 1.0,
            }

            if "multipart/form-data" in content_type:
                header_bytes = f"Content-Type: {content_type}\r\n\r\n".encode("latin1")
                full_msg = BytesParser(policy=default).parsebytes(header_bytes + body)

                for part in full_msg.iter_parts():
                    cd = part.get("Content-Disposition", "")
                    name = None
                    filename = None
                    for item in cd.split(";"):
                        item = item.strip()
                        if item.startswith("name="):
                            name = item.split("=", 1)[1].strip('"\'')
                        elif item.startswith("filename="):
                            filename = item.split("=", 1)[1].strip('"\'')

                    if filename:
                        safe_filename = Path(filename).name
                        data = part.get_payload(decode=True)
                        target_path = inputs_dir / safe_filename
                        with open(target_path, "wb") as f:
                            f.write(data)

                        if name == "reference_image" or (name and "ref" in name.lower()):
                            ref_path = target_path
                        elif name == "moving_image" or (name and ("mov" in name.lower() or "source" in name.lower())):
                            mov_path = target_path
                        elif not ref_path:
                            ref_path = target_path
                        elif not mov_path:
                            mov_path = target_path
                    else:
                        payload_val = part.get_payload(decode=True).decode("utf-8", errors="ignore").strip()
                        if name == "stage_id":
                            stage_dir = STAGED_DIR / payload_val
                            if stage_dir.is_dir():
                                staged_files = [p for p in stage_dir.iterdir() if p.is_file() and p.name != "staging_meta.json"]
                                for sf in staged_files:
                                    if "ref" in sf.name.lower():
                                        ref_path = sf
                                    elif "mov" in sf.name.lower() or "source" in sf.name.lower():
                                        mov_path = sf
                                if not ref_path and len(staged_files) >= 1:
                                    ref_path = staged_files[0]
                                if not mov_path and len(staged_files) >= 2:
                                    mov_path = staged_files[1]
                        elif name == "reference_path":
                            cand = Path(payload_val)
                            ref_candidate = cand if cand.is_absolute() else PROJECT_ROOT / cand
                            if ref_candidate.is_file():
                                ref_path = ref_candidate
                        elif name == "moving_path":
                            cand = Path(payload_val)
                            mov_candidate = cand if cand.is_absolute() else PROJECT_ROOT / cand
                            if mov_candidate.is_file():
                                mov_path = mov_candidate
                        elif name in settings:
                            if name == "contrast_enhancement":
                                settings[name] = payload_val.lower() in ["true", "1", "yes"]
                            elif name == "max_features":
                                settings[name] = int(payload_val)
                            elif name in ["ratio_threshold", "ransac_threshold", "rescale_factor"]:
                                settings[name] = float(payload_val)
            else:
                try:
                    payload = json.loads(body.decode("utf-8"))
                except Exception:
                    payload = {}

                if "stage_id" in payload and payload["stage_id"]:
                    stage_dir = STAGED_DIR / payload["stage_id"]
                    if stage_dir.is_dir():
                        staged_files = [p for p in stage_dir.iterdir() if p.is_file() and p.name != "staging_meta.json"]
                        for sf in staged_files:
                            if "ref" in sf.name.lower():
                                ref_path = sf
                            elif "mov" in sf.name.lower() or "source" in sf.name.lower():
                                mov_path = sf
                        if not ref_path and len(staged_files) >= 1:
                            ref_path = staged_files[0]
                        if not mov_path and len(staged_files) >= 2:
                            mov_path = staged_files[1]

                if "reference_path" in payload and payload["reference_path"]:
                    cand = Path(payload["reference_path"])
                    ref_path = cand if cand.is_absolute() else PROJECT_ROOT / cand

                if "moving_path" in payload and payload["moving_path"]:
                    cand = Path(payload["moving_path"])
                    mov_path = cand if cand.is_absolute() else PROJECT_ROOT / cand

                if "settings" in payload and isinstance(payload["settings"], dict):
                    settings.update(payload["settings"])

            if not ref_path or not mov_path:
                resp = {
                    "job_id": job_id,
                    "status": "FAILED",
                    "registered_image": None,
                    "keypoints_image": None,
                    "matches_image": None,
                    "inliers_image": None,
                    "overlay_image": None,
                    "difference_image": None,
                    "metrics": {"processing_time_seconds": 0.0},
                    "transformation": None,
                    "error": "Missing input: Reference and Moving images are both required for registration.",
                }
                resp_bytes = json.dumps(resp, indent=2).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_bytes)
                return

            if not ProcessingEngine:
                raise RuntimeError("ProcessingEngine module could not be imported.")

            engine = ProcessingEngine(artifacts_dir=REGISTRATIONS_DIR)
            result = engine.run_registration(ref_path, mov_path, settings=settings, job_id=job_id)

            resp_bytes = json.dumps(result, indent=2).encode("utf-8")
            status_code = 200 if result.get("status") == "SUCCESS" else 422
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(resp_bytes)

        except Exception as e:
            err_data = json.dumps({
                "job_id": None,
                "status": "FAILED",
                "registered_image": None,
                "keypoints_image": None,
                "matches_image": None,
                "inliers_image": None,
                "overlay_image": None,
                "difference_image": None,
                "metrics": {"processing_time_seconds": 0.0},
                "transformation": None,
                "error": f"Internal Registration Server Error: {e}"
            }, indent=2).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(err_data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err_data)

    def handle_list_jobs(self):
        jobs = []
        if REGISTRATIONS_DIR.is_dir():
            for job_dir in REGISTRATIONS_DIR.iterdir():
                if job_dir.is_dir():
                    res_file = job_dir / "result.json"
                    if res_file.is_file():
                        try:
                            with open(res_file, "r", encoding="utf-8") as f:
                                data = json.load(f)
                            jobs.append({
                                "job_id": data.get("job_id", job_dir.name),
                                "status": data.get("status", "UNKNOWN"),
                                "created_at": data.get("created_at", ""),
                                "reference_name": data.get("reference_name", "unknown"),
                                "moving_name": data.get("moving_name", "unknown"),
                                "metrics": data.get("metrics", {}),
                            })
                        except Exception:
                            pass
        jobs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        resp_bytes = json.dumps(jobs, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(resp_bytes)

    def handle_get_job_result(self, job_id: str):
        job_dir = REGISTRATIONS_DIR / job_id
        res_file = job_dir / "result.json"
        try:
            resolved = res_file.resolve()
            if not str(resolved).startswith(str(REGISTRATIONS_DIR.resolve())):
                self.send_error(403, "Access Denied")
                return
            if resolved.is_file():
                with open(resolved, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                err_bytes = json.dumps({"error": f"Job '{job_id}' not found."}).encode("utf-8")
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(err_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(err_bytes)
                return
        except Exception as e:
            self.send_error(500, f"Error reading job: {e}")

    def handle_download_all_zip(self, job_id: str):
        job_dir = REGISTRATIONS_DIR / job_id
        try:
            resolved = job_dir.resolve()
            if not str(resolved).startswith(str(REGISTRATIONS_DIR.resolve())):
                self.send_error(403, "Access Denied")
                return
            if not resolved.is_dir():
                self.send_error(404, f"Job '{job_id}' not found.")
                return

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _, files in os.walk(resolved):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(resolved)
                        zf.write(file_path, arcname)

            zip_bytes = zip_buffer.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="luna_reg_{job_id}_results.zip"')
            self.send_header("Content-Length", str(len(zip_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(zip_bytes)
        except Exception as e:
            self.send_error(500, f"Error generating ZIP archive: {e}")

    def log_message(self, format, *args):
        # Clean terminal logging
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.address_string()} - {format % args}\n")


def run_server(port: int = 8000):
    server_address = ("", port)
    try:
        httpd = HTTPServer(server_address, LunaRegHTTPHandler)
    except OSError as e:
        if "address already in use" in str(e).lower() or getattr(e, 'winerror', None) == 10048:
            print(f"[*] Port {port} is busy, trying {port + 1}...")
            port = port + 1
            httpd = HTTPServer(("", port), LunaRegHTTPHandler)
        else:
            raise

    print("=" * 70)
    print("[*] LUNA-REG: Lunar Image Feature Matching Demo Web Server")
    print("=" * 70)
    print(f"[*] Web Directory: {WEB_DIR}")
    print(f"[*] Server Listening on: http://localhost:{port}/")
    print(f"[*] Demo Route:         http://localhost:{port}/feature-matching-demo")
    print(f"[*] API Route:          http://localhost:{port}/api/demo-data")
    print("=" * 70)
    print("Press Ctrl+C to stop the server.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down LUNA-REG demo server...")
        httpd.server_close()
        print("[+] Server stopped cleanly.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LUNA-REG Demo Web Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to serve on (default: 8000)")
    args = parser.parse_args()
    run_server(args.port)
