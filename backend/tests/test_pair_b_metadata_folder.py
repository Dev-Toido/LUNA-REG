"""Focused regression checks for Pair-B metadata folder resolution."""

from types import SimpleNamespace

from app.api import storage as storage_api
from app.services.dataset_upload_service import resolve_upload_folder


class FakeStorage:
    def __init__(self) -> None:
        self.lookups: list[tuple[str, str | None]] = []
        self.folders = {
            ("LUNA-REG-DATA", None): {"id": "root-id"},
            ("metadata", "root-id"): {"id": "metadata-id"},
            ("PAIR-B", "metadata-id"): {"id": "pair-metadata-id"},
        }

    def find_folder(self, name: str, parent_id: str | None = None):
        self.lookups.append((name, parent_id))
        return self.folders.get((name, parent_id))


def test_pair_b_metadata_resolves_to_metadata_pair_folder() -> None:
    dataset = SimpleNamespace(
        pair_id="PAIR-B",
        source_instrument="OHRC",
        reference_instrument="TMC-2",
    )
    storage = FakeStorage()

    folder = resolve_upload_folder(storage, dataset, "metadata")

    assert folder == {"id": "pair-metadata-id"}
    assert storage.lookups == [
        ("LUNA-REG-DATA", None),
        ("metadata", "root-id"),
        ("PAIR-B", "metadata-id"),
    ]


def test_pair_b_setup_creates_and_reuses_metadata_folder() -> None:
    dataset = SimpleNamespace(
        id=3,
        pair_id="PAIR-B",
        source_instrument="OHRC",
        reference_instrument="TMC-2",
    )
    folders = {
        ("LUNA-REG-DATA", None): {"id": "root-id"},
        ("raw", "root-id"): {"id": "raw-id"},
        ("PAIR-B", "raw-id"): {"id": "raw-pair-id"},
        ("OHRC", "raw-pair-id"): {"id": "source-id"},
        ("TMC-2", "raw-pair-id"): {"id": "reference-id"},
    }
    created: list[tuple[str, str | None]] = []

    class SetupStorage:
        def find_folder(self, name: str, parent_id: str | None = None):
            return folders.get((name, parent_id))

        def create_folder(self, name: str, parent_id: str | None = None):
            folder = {"id": f"created-{len(created)}"}
            created.append((name, parent_id))
            folders[(name, parent_id)] = folder
            return folder

    storage_api.GoogleDriveStorage = SetupStorage
    db = SimpleNamespace(get=lambda model, dataset_id: dataset)

    first = storage_api.setup_dataset_drive_folders(3, db)
    second = storage_api.setup_dataset_drive_folders(3, db)

    assert first == second
    assert first["metadata_folder_id"] == "created-1"
    assert created == [
        ("metadata", "root-id"),
        ("PAIR-B", "created-0"),
    ]
