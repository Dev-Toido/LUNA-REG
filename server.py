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
import json
import mimetypes
import os
import sys
import uuid
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
WEB_DIR = PROJECT_ROOT / "frontend" if (PROJECT_ROOT / "frontend").is_dir() else PROJECT_ROOT / "web"
STAGED_DIR = PROJECT_ROOT / "data" / "staged_inputs"


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

        # Route 3: Automated Test Runner -> serve web/test_runner.html
        if clean_path in ["/test-runner", "/test_runner.html", "/tests"]:
            self.serve_file(WEB_DIR / "test_runner.html", "text/html; charset=utf-8")
            return

        # Route 4: /api/demo-data -> JSON API endpoint for external/API inspection
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
