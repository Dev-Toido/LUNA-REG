"""Google Drive storage provider."""

from io import BufferedIOBase
from pathlib import Path
from typing import Any

from googleapiclient.discovery import Resource, build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload, MediaIoBaseUpload

from app.services.google_auth import get_authorized_credentials
from app.services.storage.base import Storage


class DriveFileExistsError(Exception):
	"""Raised when a file with the same name already exists in a folder."""


def _escape_query_value(value: str) -> str:
	return value.replace("\\", "\\\\").replace("'", "\\'")


class GoogleDriveStorage(Storage):
	"""Storage provider backed by Google Drive API v3."""

	def __init__(self) -> None:
		credentials = get_authorized_credentials()
		self._service: Resource = build(
			"drive",
			"v3",
			credentials=credentials,
			cache_discovery=False,
		)

	def list_files(
		self,
		query: str | None = None,
		page_size: int = 100,
	) -> list[dict[str, Any]]:
		files: list[dict[str, Any]] = []
		page_token: str | None = None
		while True:
			response = (
				self._service.files()
				.list(
					q=query,
					pageSize=page_size,
					pageToken=page_token,
					spaces="drive",
					fields="nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,trashed)",
				)
				.execute()
			)
			files.extend(response.get("files", []))
			page_token = response.get("nextPageToken")
			if not page_token:
				return files

	def get_file_metadata(self, file_id: str) -> dict[str, Any]:
		return (
			self._service.files()
			.get(
				fileId=file_id,
				fields="id,name,mimeType,parents,size,modifiedTime,trashed",
			)
			.execute()
		)

	def find_folder(self, name: str, parent_id: str | None = None) -> dict[str, Any] | None:
		query_parts = [
			f"name = '{name}'",
			"mimeType = 'application/vnd.google-apps.folder'",
			"trashed = false",
		]
		if parent_id:
			query_parts.append(f"'{parent_id}' in parents")
		folders = self.list_files(query=" and ".join(query_parts), page_size=10)
		return folders[0] if folders else None

	def find_file(self, name: str, parent_id: str) -> dict[str, Any] | None:
		query = (
			f"name = '{_escape_query_value(name)}' and "
			f"'{_escape_query_value(parent_id)}' in parents and trashed = false"
		)
		files = self.list_files(query=query, page_size=10)
		return files[0] if files else None

	def create_folder(
		self,
		name: str,
		parent_id: str | None = None,
	) -> dict[str, Any]:
		metadata: dict[str, Any] = {
			"name": name,
			"mimeType": "application/vnd.google-apps.folder",
		}
		if parent_id:
			metadata["parents"] = [parent_id]
		return (
			self._service.files()
			.create(body=metadata, fields="id,name,mimeType,parents")
			.execute()
		)

	def upload_file(
		self,
		local_path: str | Path,
		name: str | None = None,
		parent_id: str | None = None,
		mime_type: str | None = None,
	) -> dict[str, Any]:
		path = Path(local_path)
		file_name = name or path.name
		if parent_id and self.find_file(file_name, parent_id) is not None:
			raise DriveFileExistsError(
				f"A file named '{file_name}' already exists in the destination folder."
			)
		metadata: dict[str, Any] = {"name": file_name}
		if parent_id:
			metadata["parents"] = [parent_id]
		media = MediaFileUpload(
			str(path),
			mimetype=mime_type,
			resumable=True,
		)
		return (
			self._service.files()
			.create(
				body=metadata,
				media_body=media,
				fields="id,name,mimeType,parents,size,modifiedTime",
			)
			.execute()
		)

	def upload_stream(
		self,
		file_object: BufferedIOBase,
		name: str,
		parent_id: str,
		mime_type: str,
	) -> dict[str, Any]:
		if self.find_file(name, parent_id) is not None:
			raise DriveFileExistsError(
				f"A file named '{name}' already exists in the destination folder."
			)
		media = MediaIoBaseUpload(
			file_object,
			mimetype=mime_type,
			resumable=True,
		)
		return (
			self._service.files()
			.create(
				body={"name": name, "parents": [parent_id]},
				media_body=media,
				fields="id,name,mimeType,parents,size,modifiedTime",
			)
			.execute()
		)

	def download_file(self, file_id: str, destination: str | Path) -> Path:
		destination_path = Path(destination)
		request = self._service.files().get_media(fileId=file_id)
		with destination_path.open("wb") as destination_file:
			downloader = MediaIoBaseDownload(destination_file, request)
			done = False
			while not done:
				_, done = downloader.next_chunk()
		return destination_path

	def iter_file_chunks(self, file_id: str):
		request = self._service.files().get_media(fileId=file_id)

		class ChunkSink:
			def __init__(self) -> None:
				self.data = b""

			def write(self, data: bytes) -> int:
				self.data = data
				return len(data)

		sink = ChunkSink()
		downloader = MediaIoBaseDownload(sink, request)
		done = False
		while not done:
			sink.data = b""
			_, done = downloader.next_chunk()
			if sink.data:
				yield sink.data