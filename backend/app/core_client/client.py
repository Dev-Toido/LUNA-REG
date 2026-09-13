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
		options: Mapping[str, Any] | None = None,
	) -> dict[str, Any]:
		"""Submit a registration request without performing image processing."""


class MockCoreClient:
	"""Development client that records no processing and queues nothing externally."""

	def submit_registration(
		self,
		pair_id: int,
		options: Mapping[str, Any] | None = None,
	) -> dict[str, Any]:
		return {
			"job_id": f"mock-{uuid4()}",
			"pair_id": pair_id,
			"status": "QUEUED",
		}
