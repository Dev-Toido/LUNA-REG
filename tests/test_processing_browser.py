"""
LUNA-REG — Headless Browser Verification for Processing Module
Validates complete DOM rendering, controls, 12-step structure, and HUD styling in Microsoft Edge.
"""

import os
import re
import subprocess
import threading
import time
import unittest
from http.server import HTTPServer
from pathlib import Path

from server import LunaRegHTTPHandler, WEB_DIR


class TestProcessingBrowser(unittest.TestCase):

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

        # Start test HTTP server
        cls.server_port = 8995
        try:
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)
        except OSError:
            cls.server_port = 8996
            cls.httpd = HTTPServer(("127.0.0.1", cls.server_port), LunaRegHTTPHandler)

        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server_port}"
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_processing_module_dom_rendering_in_edge(self):
        """Render /processing in headless Edge and assert all mission controls exist in DOM."""
        if not self.edge_exe:
            self.skipTest("Edge browser not found in standard installation paths.")

        target_url = f"{self.base_url}/processing"

        res = subprocess.run([
            self.edge_exe,
            "--headless",
            "--disable-gpu",
            "--virtual-time-budget=6000",
            "--dump-dom",
            target_url
        ], capture_output=True, text=True, encoding="utf-8", errors="ignore")

        self.assertEqual(res.returncode, 0, f"Edge execution failed: {res.stderr}")
        dom = res.stdout

        # 1. Mission Header & Subsystem Badge
        self.assertIn("LUNA-REG • SIFT PROCESSING MODULE", dom)
        self.assertIn("PROCESSING SUBSYSTEM • SIFT + RANSAC PIPELINE", dom)

        # 2. Input Bridge Bar
        self.assertIn('id="pillReference"', dom)
        self.assertIn('id="pillMoving"', dom)

        # 3. Settings Controls
        self.assertIn('id="sliderRatioThreshold"', dom)
        self.assertIn('id="sliderRansacThreshold"', dom)
        self.assertIn('id="selectMaxFeatures"', dom)
        self.assertIn('id="checkClahe"', dom)
        self.assertIn('id="selectRescale"', dom)

        # 4. Master Action Buttons
        self.assertIn('id="btnExecuteRegistration"', dom)
        self.assertIn('id="btnLoadSamplePair"', dom)
        self.assertIn('id="btnResetSettings"', dom)

        # 5. All 12 Scientific Pipeline Steps
        for step_id in range(1, 13):
            self.assertIn(f'id="stepCard_{step_id}"', dom, f"Step #{step_id} card missing from DOM")
            self.assertIn(f'id="stepBadge_{step_id}"', dom, f"Step #{step_id} badge missing from DOM")

        # 6. Telemetry KPI Cards
        self.assertIn('id="kpiInliers"', dom)
        self.assertIn('id="kpiInlierRatio"', dom)
        self.assertIn('id="kpiReprojError"', dom)
        self.assertIn('id="kpiSpatialScore"', dom)
        self.assertIn('id="kpiKeypoints"', dom)
        self.assertIn('id="kpiTime"', dom)

        # 7. Homography Matrix Viewer
        self.assertIn('id="matrixGrid"', dom)

        # 8. Visual Artifact Tabs & Viewport
        self.assertIn('id="artifactTabs"', dom)
        self.assertIn('id="artifactViewport"', dom)
        self.assertIn('data-tab="registered"', dom)
        self.assertIn('data-tab="keypoints"', dom)
        self.assertIn('data-tab="matches"', dom)
        self.assertIn('data-tab="inliers"', dom)
        self.assertIn('data-tab="overlay"', dom)
        self.assertIn('data-tab="difference"', dom)

        # 9. Output Module Handoff Bar
        self.assertIn('id="btnProceedToOutput"', dom)


if __name__ == "__main__":
    unittest.main()
