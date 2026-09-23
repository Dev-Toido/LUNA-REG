"""
LUNA-REG — Processing Module Automated API and Integration Tests.
Verifies:
- HTTP GET /processing, /processing-module, /processing_module.html routes
- HTTP POST /api/v1/registration/process with JSON input
- HTTP POST /api/v1/registration/process with multipart/form-data upload
- HTTP GET /api/v1/registration/artifacts/<job_id>/<filename>
- HTTP Error responses (400 for missing inputs)
- Color scheme verification (strictly ZERO blue colors in processing_module.css)
"""

import io
import json
import os
import re
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path

from server import LunaRegHTTPHandler, WEB_DIR, PROJECT_ROOT, REGISTRATIONS_DIR


class TestProcessingAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Start server in a background daemon thread
        cls.server_port = 8990
        try:
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)
        except OSError:
            cls.server_port = 8991
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)

        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server_port}"
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_processing_module_files_exist(self):
        """Verify processing module frontend files exist."""
        required = [
            WEB_DIR / "css" / "processing_module.css",
            WEB_DIR / "js" / "components" / "ProcessingModule.js",
            WEB_DIR / "processing_module.html",
        ]
        for f in required:
            self.assertTrue(f.is_file(), f"Missing required file: {f}")

    def test_no_blue_colors_in_processing_module_css(self):
        """Verify strict mission control zero blue color policy."""
        css_path = WEB_DIR / "css" / "processing_module.css"
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read().lower()

        # Check for forbidden blue keywords and hex codes
        forbidden_patterns = [
            r"#0000ff\b",
            r"#00f\b",
            r"#3b82f6\b",
            r"#0ea5e9\b",
            r"#2563eb\b",
            r"#1d4ed8\b",
            r"#60a5fa\b",
            r"#93c5fd\b",
            r"\bblue\b",
            r"\bdodgerblue\b",
            r"\bcornflowerblue\b",
            r"\broyalblue\b",
            r"\bdeepskyblue\b",
        ]
        for pattern in forbidden_patterns:
            matches = re.findall(pattern, content)
            self.assertEqual(len(matches), 0, f"Found forbidden blue color '{pattern}' in {css_path.name}: {matches}")

    def test_get_processing_html_routes(self):
        """Verify GET routes serving processing_module.html."""
        for path in ["/processing", "/processing-module", "/processing_module.html"]:
            req = urllib.request.Request(f"{self.base_url}{path}")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read().decode("utf-8")
                self.assertIn("LUNA-REG", body)
                self.assertIn("ProcessingModule.js", body)

    def test_post_registration_process_json(self):
        """Verify POST /api/v1/registration/process with JSON body."""
        url = f"{self.base_url}/api/v1/registration/process"
        payload = {
            "reference_path": "assets/lunar_low_sun.jpg",
            "moving_path": "assets/lunar_low_sun.jpg",
            "settings": {
                "ratio_threshold": 0.75,
                "ransac_threshold": 5.0,
                "max_features": 1000,
            }
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(res["status"], "SUCCESS")
            self.assertIsNotNone(res["job_id"])
            self.assertGreater(res["metrics"]["inliers"], 0)
            self.assertEqual(res["transformation"]["type"], "Homography")

            # Check artifact URL accessibility
            artifact_url = f"{self.base_url}{res['registered_image']}"
            art_req = urllib.request.Request(artifact_url)
            with urllib.request.urlopen(art_req) as art_resp:
                self.assertEqual(art_resp.status, 200)
                self.assertEqual(art_resp.headers.get("Content-Type"), "image/png")
                art_bytes = art_resp.read()
                self.assertGreater(len(art_bytes), 1000)

    def test_post_registration_missing_inputs_returns_400(self):
        """Verify POST /api/v1/registration/process rejects empty/missing payloads."""
        url = f"{self.base_url}/api/v1/registration/process"
        payload = {}
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 400 for empty registration payload")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
            res = json.loads(e.read().decode("utf-8"))
            self.assertEqual(res["status"], "FAILED")
            self.assertIn("Missing input", res["error"])

    def test_post_registration_multipart_form(self):
        """Verify POST /api/v1/registration/process with multipart/form-data."""
        url = f"{self.base_url}/api/v1/registration/process"
        boundary = "---------------------------LunaRegBoundary123456789"

        with open(PROJECT_ROOT / "assets" / "lunar_low_sun.jpg", "rb") as f:
            file_bytes = f.read()

        body = bytearray()
        # Reference image part
        body.extend(f"--{boundary}\r\n".encode("latin1"))
        body.extend(b'Content-Disposition: form-data; name="reference_image"; filename="ref.jpg"\r\n')
        body.extend(b"Content-Type: image/jpeg\r\n\r\n")
        body.extend(file_bytes)
        body.extend(b"\r\n")

        # Moving image part
        body.extend(f"--{boundary}\r\n".encode("latin1"))
        body.extend(b'Content-Disposition: form-data; name="moving_image"; filename="mov.jpg"\r\n')
        body.extend(b"Content-Type: image/jpeg\r\n\r\n")
        body.extend(file_bytes)
        body.extend(b"\r\n")

        # Form setting part
        body.extend(f"--{boundary}\r\n".encode("latin1"))
        body.extend(b'Content-Disposition: form-data; name="max_features"\r\n\r\n')
        body.extend(b"800\r\n")

        body.extend(f"--{boundary}--\r\n".encode("latin1"))

        req = urllib.request.Request(
            url,
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
        )

        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(res["status"], "SUCCESS")
            self.assertGreater(res["metrics"]["inliers"], 0)


if __name__ == "__main__":
    unittest.main()
