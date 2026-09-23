"""
LUNA-REG — Headless Browser Verification for 10 Specification Test Cases
Executes test_runner.html in Edge headless browser and validates DOM output.
"""

import os
import re
import subprocess
import unittest
from pathlib import Path

class TestBrowserSpecs(unittest.TestCase):

    def test_10_specification_cases_in_browser(self):
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        edge_exe = None
        for p in edge_paths:
            if Path(p).is_file():
                edge_exe = p
                break

        if not edge_exe:
            self.skipTest("Edge browser not found in standard paths.")

        frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
        test_runner_file = (frontend_dir / "test_runner.html").resolve().as_uri()

        res = subprocess.run([
            edge_exe,
            "--headless",
            "--disable-gpu",
            "--virtual-time-budget=6000",
            "--dump-dom",
            test_runner_file
        ], capture_output=True, text=True, encoding="utf-8", errors="ignore")

        self.assertEqual(res.returncode, 0, f"Edge execution failed: {res.stderr}")

        pattern = re.compile(
            r'<tr id="test_row_(\d+)">.*?<div style="font-weight: 700; color: #eef0f5;">(.*?)</div>.*?<span class="test-pill (.*?)".*?>(.*?)</span>.*?<td id="diag_\d+".*?>(.*?)</td>',
            re.DOTALL
        )

        matches = pattern.findall(res.stdout)
        self.assertEqual(len(matches), 10, f"Expected 10 test cases, found {len(matches)}")

        for m in matches:
            t_id, t_name, t_cls, t_status, t_diag = m
            self.assertIn("PASS", t_status, f"Test #{t_id} ({t_name}) failed! Diag: {t_diag}")

if __name__ == "__main__":
    unittest.main()
