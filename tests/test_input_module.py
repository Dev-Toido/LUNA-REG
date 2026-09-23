"""
LUNA-REG — Input Module Automated Test Suite
Verifies files existence, zero blue colors in CSS, JavaScript component contracts,
server HTTP routes, staging API endpoints, and clean decoupling.
Uses only Python standard library.
"""

import json
import os
import shutil
import unittest
import urllib.request
import urllib.error
import threading
import time
from http.server import HTTPServer
from pathlib import Path

from server import LunaRegHTTPHandler, WEB_DIR, PROJECT_ROOT, STAGED_DIR

class TestInputModule(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Start server in a background daemon thread on an ephemeral port
        cls.server_port = 8899
        try:
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)
        except OSError:
            cls.server_port = 8898
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)
        
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_components_files_exist(self):
        """Verify that all required components and assets exist."""
        required_files = [
            WEB_DIR / "css" / "input_module.css",
            WEB_DIR / "js" / "components" / "FileValidationMessage.js",
            WEB_DIR / "js" / "components" / "FileMetadata.js",
            WEB_DIR / "js" / "components" / "FilePreview.js",
            WEB_DIR / "js" / "components" / "FileUploadCard.js",
            WEB_DIR / "js" / "components" / "InputModule.js",
            WEB_DIR / "input_module.html",
            WEB_DIR / "test_runner.html",
        ]
        for f in required_files:
            self.assertTrue(f.is_file(), f"Missing required component file: {f}")

    def test_no_forbidden_blue_in_input_module_css(self):
        """Verify strict mission control color scheme with zero blue colors."""
        css_path = WEB_DIR / "css" / "input_module.css"
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read().lower()

        forbidden_blues = ["#0000ff", "#00f", "#3b82f6", "#0ea5e9", "#2563eb", "#1d4ed8", "#60a5fa", "#93c5fd"]
        for b in forbidden_blues:
            self.assertNotIn(b, content, f"Forbidden blue color code {b} found in input_module.css")

    def test_file_upload_card_contract(self):
        """Verify specifications inside FileUploadCard.js."""
        card_js = WEB_DIR / "js" / "components" / "FileUploadCard.js"
        with open(card_js, "r", encoding="utf-8") as f:
            js = f.read()

        # Accepted file formats
        self.assertIn(".png", js)
        self.assertIn(".jpg", js)
        self.assertIn(".jpeg", js)
        self.assertIn(".tif", js)
        self.assertIn(".tiff", js)
        self.assertIn(".img", js)

        # 50 MB limit (50 * 1024 * 1024)
        self.assertIn("50 * 1024 * 1024", js)

        # Reusable controls
        self.assertIn("Browse File", js)
        self.assertIn("Replace", js)
        self.assertIn("Remove", js)
        self.assertIn("hidden-file-input", js)
        self.assertIn("drag-active", js)
        self.assertIn("extractDimensions", js)

    def test_input_module_contract(self):
        """Verify InputModule separation of state and decoupled handoff."""
        mod_js = WEB_DIR / "js" / "components" / "InputModule.js"
        with open(mod_js, "r", encoding="utf-8") as f:
            js = f.read()

        # Separate independent state variables
        self.assertIn("referenceState", js)
        self.assertIn("movingState", js)
        self.assertIn("referenceCard", js)
        self.assertIn("movingCard", js)

        # Proceed button
        self.assertIn("Continue to Processing", js)
        self.assertIn("btnProceedProcessing", js)

        # Verification that no registration algorithms run inside the Input Module
        self.assertNotIn("cv2", js)
        self.assertNotIn("SIFT_create", js)
        self.assertNotIn("findHomography", js)
        self.assertNotIn("estimateAffinePartial2D", js)
        self.assertIn("READY_FOR_PROCESSING", js)

    def test_input_module_html_structure(self):
        """Verify input_module.html mounts components without demo/fake images."""
        html_path = WEB_DIR / "input_module.html"
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn("inputModuleMount", html)
        self.assertIn("FileValidationMessage.js", html)
        self.assertIn("FileMetadata.js", html)
        self.assertIn("FilePreview.js", html)
        self.assertIn("FileUploadCard.js", html)
        self.assertIn("InputModule.js", html)
        self.assertNotIn("fake_preview.png", html)
        self.assertNotIn("demo_reference.jpg", html)

    def test_http_get_input_route(self):
        """Test GET /input and /input-module routes."""
        url = f"http://127.0.0.1:{self.server_port}/input"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.headers.get("Content-Type"))
            body = resp.read().decode("utf-8")
            self.assertIn("LUNA-REG", body)
            self.assertIn("Mission Image Input Module", body)

    def test_http_get_test_runner_route(self):
        """Test GET /test-runner route."""
        url = f"http://127.0.0.1:{self.server_port}/test-runner"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.headers.get("Content-Type"))
            body = resp.read().decode("utf-8")
            self.assertIn("INPUT MODULE VERIFICATION SUITE", body)
            self.assertIn("EXECUTE 10 TESTS", body)

    def test_api_stage_inputs_post(self):
        """Test POST /api/stage-inputs endpoint receives clean data handoff."""
        url = f"http://127.0.0.1:{self.server_port}/api/stage-inputs"
        payload = {
            "timestamp": "2026-09-17T12:00:00Z",
            "referenceName": "lunar_ref_test.png",
            "movingName": "lunar_mov_test.jpg"
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            res_json = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(res_json["status"], "SUCCESS")
            self.assertEqual(res_json["pipeline_status"], "READY_FOR_PROCESSING")
            self.assertFalse(res_json["registration_algorithms_executed"])
            self.assertIn("stage_", res_json["stage_id"])

    def test_multipart_file_upload_staging(self):
        """Test multipart/form-data upload staging creates isolated files without processing."""
        url = f"http://127.0.0.1:{self.server_port}/api/stage-inputs"
        boundary = "----LunaBoundaryXYZ12345"
        
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="reference_image"; filename="ref_lunar_surface.png"\r\n'
            f"Content-Type: image/png\r\n\r\n"
            f"MOCK_PNG_DATA_STREAM\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="moving_image"; filename="mov_lunar_surface.jpg"\r\n'
            f"Content-Type: image/jpeg\r\n\r\n"
            f"MOCK_JPG_DATA_STREAM\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        headers = {
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body))
        }

        req = urllib.request.Request(url, data=body, headers=headers)
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            res_json = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(res_json["status"], "SUCCESS")
            self.assertFalse(res_json["registration_algorithms_executed"])
            stage_id = res_json["stage_id"]
            staged_path = STAGED_DIR / stage_id
            self.assertTrue(staged_path.is_dir())
            self.assertTrue((staged_path / "ref_lunar_surface.png").is_file())
            self.assertTrue((staged_path / "mov_lunar_surface.jpg").is_file())

            # Cleanup staged test files
            shutil.rmtree(staged_path, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()
