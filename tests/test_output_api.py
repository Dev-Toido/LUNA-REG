"""
LUNA-REG — Output Module Automated API and Integration Tests.
Verifies:
- HTTP GET /output, /output-module, /output.html, /output_module.html routes
- HTTP GET /api/v1/registration/jobs (history listing)
- HTTP GET /api/v1/registration/jobs/<job_id> (structured result retrieval)
- HTTP GET /api/v1/registration/jobs/<job_id>/download-all (ZIP archive packaging)
- 404 handling for invalid / non-existent job IDs
- Color scheme verification (strictly ZERO blue colors in output_module.css)
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
import zipfile
from http.server import HTTPServer
from pathlib import Path

from server import LunaRegHTTPHandler, WEB_DIR, PROJECT_ROOT, REGISTRATIONS_DIR


class TestOutputAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.server_port = 8997
        try:
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)
        except OSError:
            cls.server_port = 8998
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)

        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server_port}"
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_output_module_files_exist(self):
        """Verify output module frontend files exist."""
        required = [
            WEB_DIR / "css" / "output_module.css",
            WEB_DIR / "js" / "components" / "OutputModule.js",
            WEB_DIR / "output_module.html",
        ]
        for f in required:
            self.assertTrue(f.is_file(), f"Missing required file: {f}")

    def test_no_blue_colors_in_output_module_css(self):
        """Verify strict mission control zero blue color policy."""
        css_path = WEB_DIR / "css" / "output_module.css"
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read().lower()

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

    def test_get_output_html_routes(self):
        """Verify GET routes serving output_module.html."""
        for path in ["/output", "/output-module", "/output.html", "/output_module.html"]:
            req = urllib.request.Request(f"{self.base_url}{path}")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read().decode("utf-8")
                self.assertIn("LUNA-REG", body)
                self.assertIn("OutputModule.js", body)
                self.assertIn("OUT-03", body)

    def test_get_jobs_list_api(self):
        """Verify GET /api/v1/registration/jobs returns valid list structure."""
        url = f"{self.base_url}/api/v1/registration/jobs"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            jobs = data if isinstance(data, list) else data.get("jobs", [])
            self.assertIsInstance(jobs, list)

    def test_full_pipeline_and_output_retrieval(self):
        """Execute real registration and test output contract retrieval & ZIP packaging."""
        # 1. Trigger registration
        proc_url = f"{self.base_url}/api/v1/registration/process"
        payload = {
            "reference_path": "assets/lunar_low_sun.jpg",
            "moving_path": "assets/lunar_low_sun.jpg",
            "settings": {
                "ratio_threshold": 0.75,
                "ransac_threshold": 5.0,
                "max_features": 800,
            }
        }
        req = urllib.request.Request(
            proc_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            proc_res = json.loads(resp.read().decode("utf-8"))

        job_id = proc_res.get("job_id")
        self.assertIsNotNone(job_id)
        self.assertEqual(proc_res.get("status"), "SUCCESS")

        # 2. Query jobs list and ensure this job is listed
        jobs_url = f"{self.base_url}/api/v1/registration/jobs"
        with urllib.request.urlopen(urllib.request.Request(jobs_url)) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            jobs = data if isinstance(data, list) else data.get("jobs", [])
            found = any(j.get("job_id") == job_id for j in jobs)
            self.assertTrue(found, f"Job {job_id} not found in jobs listing.")

        # 3. Retrieve specific job result object
        job_url = f"{self.base_url}/api/v1/registration/jobs/{job_id}"
        with urllib.request.urlopen(urllib.request.Request(job_url)) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode("utf-8"))

            self.assertEqual(res.get("job_id"), job_id)
            self.assertEqual(res.get("status"), "SUCCESS")
            self.assertIn("registered_image", res)
            self.assertIn("keypoints_image", res)
            self.assertIn("matches_image", res)
            self.assertIn("inliers_image", res)
            self.assertIn("overlay_image", res)
            self.assertIn("difference_image", res)

            metrics = res.get("metrics", {})
            self.assertGreater(metrics.get("inliers", 0), 0)
            self.assertGreater(metrics.get("candidate_matches", metrics.get("candidates", 0)), 0)
            self.assertIn("inlier_ratio", metrics)

            transformation = res.get("transformation", {})
            self.assertEqual(transformation.get("type"), "Homography")
            self.assertEqual(len(transformation.get("matrix", [])), 3)

        # 4. Test ZIP download endpoint
        zip_url = f"{self.base_url}/api/v1/registration/jobs/{job_id}/download-all"
        with urllib.request.urlopen(urllib.request.Request(zip_url)) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Content-Type"), "application/zip")
            zip_bytes = resp.read()
            self.assertGreater(len(zip_bytes), 5000)

            # Open ZIP in-memory and verify contents
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                namelist = zf.namelist()
                self.assertIn("result.json", namelist)
                self.assertIn("registered_target.png", namelist)
                self.assertIn("keypoints_vis.png", namelist)
                self.assertIn("matches_vis.png", namelist)
                self.assertIn("inliers_vis.png", namelist)
                self.assertIn("checkerboard_overlay.png", namelist)

    def test_nonexistent_job_returns_404(self):
        """Verify 404 response for unknown job IDs."""
        bad_url = f"{self.base_url}/api/v1/registration/jobs/nonexistent-uuid-99999"
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(urllib.request.Request(bad_url))
        self.assertEqual(ctx.exception.code, 404)

        bad_zip_url = f"{self.base_url}/api/v1/registration/jobs/nonexistent-uuid-99999/download-all"
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(urllib.request.Request(bad_zip_url))
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
