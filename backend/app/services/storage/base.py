"""Abstract interface for storage providers."""

from abc import ABC, abstractmethod
from io import BufferedIOBase
from pathlib import Path
from typing import Any


class Storage(ABC):
	"""Common interface for file storage providers."""

	@abstractmethod
	def list_files(
		self,
		query: str | None = None,
		page_size: int = 100,
	) -> list[dict[str, Any]]:
		"""List files matching an optional provider-specific query."""

	@abstractmethod
	def get_file_metadata(self, file_id: str) -> dict[str, Any]:
		"""Return metadata for a file identifier."""

	@abstractmethod
	def find_folder(self, name: str, parent_id: str | None = None) -> dict[str, Any] | None:
		"""Find the first non-trashed folder with an optional parent."""

	@abstractmethod
	def create_folder(
		self,
		name: str,
		parent_id: str | None = None,
	) -> dict[str, Any]:
		"""Create a folder and return its metadata."""

	@abstractmethod
	def upload_file(
		self,
		local_path: str | Path,
		name: str | None = None,
		parent_id: str | None = None,
		mime_type: str | None = None,
	) -> dict[str, Any]:
		"""Upload a local file and return its metadata."""

	@abstractmethod
	def upload_stream(
		self,
		file_object: BufferedIOBase,
		name: str,
		parent_id: str,
		mime_type: str,
	) -> dict[str, Any]:
		"""Upload a file-like object using a resumable upload."""

	@abstractmethod
	def download_file(self, file_id: str, destination: str | Path) -> Path:
		"""Download a remote file to a local destination."""

	@abstractmethod
	def iter_file_chunks(self, file_id: str):
		"""Yield downloaded file chunks without buffering the complete file."""