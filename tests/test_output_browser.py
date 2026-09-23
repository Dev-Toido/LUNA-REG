"""
LUNA-REG — Headless Browser Verification for Output Module.
Validates complete DOM rendering, controls, comparison modes, pan-zoom viewer,
metrics badges, homography matrix table, result file cards, and HUD styling in Microsoft Edge.
"""

import json
import os
import re
import subprocess
import threading
import time
import unittest
import urllib.request
from http.server import HTTPServer
from pathlib import Path

from server import LunaRegHTTPHandler, WEB_DIR


class TestOutputBrowser(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Locate Edge executable
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        cls.edge_exe = None
        for p in edge_paths:
            if Path(p).is_file():
                cls.edge_exe = p
                break

        # Start test HTTP server on dynamic OS assigned port
        cls.httpd = HTTPServer(("127.0.0.1", 0), LunaRegHTTPHandler)
        cls.server_port = cls.httpd.server_address[1]
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server_port}"
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_output_module_empty_state_in_edge(self):
        """Render /output with no active job and assert clean empty state."""
        if not self.edge_exe:
            self.skipTest("Edge browser not found in standard installation paths.")

        target_url = f"{self.base_url}/output"

        res = subprocess.run([
            self.edge_exe,
            "--headless",
            "--disable-gpu",
            "--virtual-time-budget=5000",
            "--dump-dom",
            target_url
        ], capture_output=True, text=True, encoding="utf-8", errors="ignore")

        self.assertEqual(res.returncode, 0, f"Edge execution failed: {res.stderr}")
        dom = res.stdout

        # 1. Mission Header & Subsystem Badge
        self.assertIn("LUNA-REG", dom)
        self.assertIn("OUTPUT SUBSYSTEM", dom)
        self.assertIn("OUT-03", dom)

        # 2. Empty State Card
        self.assertIn("No Registration Results Available", dom)
        self.assertIn("Go to Input Module", dom)
        self.assertIn("Go to Processing Module", dom)

        # 3. Recent Registrations Section
        self.assertIn("Recent Registrations History", dom)

    def test_output_module_completed_job_in_edge(self):
        """Render /output?job_id=... with a real registered job and assert all interactive sections."""
        if not self.edge_exe:
            self.skipTest("Edge browser not found in standard installation paths.")

        # 1. First trigger a real registration to get a job_id
        proc_url = f"{self.base_url}/api/v1/registration/process"
        payload = {
            "reference_path": "assets/lunar_low_sun.jpg",
            "moving_path": "assets/lunar_low_sun.jpg",
            "settings": {
                "ratio_threshold": 0.75,
                "ransac_threshold": 5.0,
                "max_features": 600,
            }
        }
        req = urllib.request.Request(
            proc_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            proc_res = json.loads(resp.read().decode("utf-8"))

        job_id = proc_res.get("job_id")
        self.assertIsNotNone(job_id)
        time.sleep(0.5)

        target_url = f"{self.base_url}/output?job_id={job_id}"

        res = subprocess.run([
            self.edge_exe,
            "--headless",
            "--disable-gpu",
            "--virtual-time-budget=8000",
            "--dump-dom",
            target_url
        ], capture_output=True, text=True, encoding="utf-8", errors="ignore")

        self.assertEqual(res.returncode, 0, f"Edge execution failed: {res.stderr}")
        dom = res.stdout

        # Verify Header telemetry & Job ID
        self.assertIn(job_id, dom)
        self.assertIn("STATUS: COMPLETED", dom)

        # Verify Pan/Zoom Controls
        self.assertIn('id="btnZoomIn"', dom)
        self.assertIn('id="btnZoomOut"', dom)
        self.assertIn('id="btnFitScreen"', dom)
        self.assertIn('id="btnResetZoom"', dom)

        # Verify Comparison Viewer Controls
        self.assertIn("SWIPE COMPARISON", dom)
        self.assertIn("OVERLAY (OPACITY)", dom)
        self.assertIn("SIDE-BY-SIDE", dom)
        self.assertIn("sliderOverlayOpacity", dom)

        # Verify Detailed Diagnostic Panels
        self.assertIn("SIFT Keypoints", dom)
        self.assertIn("Feature Matches", dom)
        self.assertIn("RANSAC Inlier / Outlier Analysis", dom)

        # Verify Metrics Grid
        self.assertIn("INLIER RATIO", dom)
        self.assertIn("REPROJECTION ERROR", dom)
        self.assertIn("SPATIAL SCORE", dom)

        # Verify Homography Matrix Table
        self.assertIn("Transformation Matrix Details", dom)
        self.assertIn("Estimated Homography matrix", dom)

        # Verify Result Files and ZIP Download
        self.assertIn("Generated Result Files &amp; Artifacts", dom)
        self.assertIn("DOWNLOAD ALL RESULTS (ZIP)", dom)


if __name__ == "__main__":
    unittest.main()
