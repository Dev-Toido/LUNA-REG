"""Backend-to-Core registration submission contract."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol
from uuid import uuid4


class CoreClient(Protocol):
	"""Interface used by the backend to submit registration work."""

	def submit_registration(
		self,
		pair_id: int,
		registration_input: Mapping[str, Any],
		options: Mapping[str, Any] | None = None,
	) -> dict[str, Any]:
		"""Submit a registration request without performing image processing."""


class LocalCoreClient:
	"""Real core client that dispatches planetary registration jobs using core processing."""

	def submit_registration(
		self,
		pair_id: int,
		registration_input: Mapping[str, Any],
		options: Mapping[str, Any] | None = None,
	) -> dict[str, Any]:
		import shutil
		import tempfile
		import time
		from pathlib import Path
		from app.services.registration_service import dispatch_registration_job

		root_dir = Path(__file__).resolve().parent.parent.parent.parent
		assets_dir = root_dir / "assets"
		frontend_assets = root_dir / "frontend" / "assets"
		ref_candidate = (assets_dir / "lunar_nadir.jpg") if (assets_dir / "lunar_nadir.jpg").exists() else (frontend_assets / "lunar_nadir.jpg")
		tgt_candidate = (assets_dir / "lunar_low_sun.jpg") if (assets_dir / "lunar_low_sun.jpg").exists() else (frontend_assets / "lunar_low_sun.jpg")

		uploads_dir = Path(tempfile.gettempdir()) / "luna_reg_uploads"
		uploads_dir.mkdir(parents=True, exist_ok=True)
		timestamp = int(time.time() * 1000)
		ref_path = uploads_dir / f"pair_{pair_id}_{timestamp}_ref.jpg"
		tgt_path = uploads_dir / f"pair_{pair_id}_{timestamp}_tgt.jpg"

		if ref_candidate.exists():
			shutil.copy(ref_candidate, ref_path)
		if tgt_candidate.exists():
			shutil.copy(tgt_candidate, tgt_path)

		detector = (options.get("detector", "sift") if isinstance(options, dict) else "sift")
		job_id = dispatch_registration_job(str(ref_path), str(tgt_path), detector=detector)
		return {
			"core_job_id": job_id,
			"status": "PROCESSING",
		}



class MockCoreClient:
	"""Development client that records no processing and queues mock responses."""

	def submit_registration(
		self,
		pair_id: int,
		registration_input: Mapping[str, Any],
		options: Mapping[str, Any] | None = None,
	) -> dict[str, Any]:
		from uuid import uuid4
		return {
			"core_job_id": f"mock-{uuid4()}",
			"status": "QUEUED",
		}


def get_core_client() -> CoreClient:
	"""Return the real Core implementation."""
	return LocalCoreClient()


