"""Ingest the verified Pair-B product files into Google Drive."""

from __future__ import annotations

import argparse
import mimetypes
import sys
from dataclasses import dataclass
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.db.database import SessionLocal
from app.db.models import Dataset, DatasetFile
from app.schemas.dataset_file import DatasetFileCreate
from app.services.dataset_file_service import create_dataset_file
from app.services.dataset_upload_service import (
    DatasetFileRegistrationError,
    resolve_upload_folder,
)
from app.services.google_auth import GoogleAuthError
from app.services.storage.google_drive import (
    DriveFileExistsError,
    GoogleDriveStorage,
)

EXPECTED_PAIR_ID = "PAIR-B"
EXPECTED_PRODUCTS = {
    "OHRC": "ch2_ohr_ncp_20210405T0640233469_d_img_d18",
    "TMC-2": "ch2_tmc_ncn_20211116T1329461965_d_img_d18",
}
ROLE_BY_INSTRUMENT = {"OHRC": "source_raw", "TMC-2": "reference_raw"}
INSTRUMENTS = tuple(EXPECTED_PRODUCTS)


@dataclass(frozen=True)
class IngestItem:
    path: Path
    instrument: str
    file_role: str


@dataclass
class IngestSummary:
    discovered: int = 0
    uploaded: int = 0
    skipped: int = 0
    failed: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument("--path", type=Path, required=True)
    parser.add_argument("--continue-on-error", action="store_true")
    return parser.parse_args()


def expected_file_names(dataset: Dataset) -> dict[str, str]:
    source = dataset.source_product_id
    reference = dataset.reference_product_id
    return {
        source + ".img": "OHRC",
        source + ".xml": "OHRC",
        source.replace("_d_img_d18", "_g_grd_d18") + ".xml": "OHRC",
        source.replace("_d_img_d18", "_b_brw_d18") + ".xml": "OHRC",
        reference + ".img": "TMC-2",
        reference + ".xml": "TMC-2",
        reference.replace("_d_img_d18", "_g_grd_d18") + ".xml": "TMC-2",
        reference.replace("_d_img_d18", "_b_brw_d18") + ".xml": "TMC-2",
    }


def validate_dataset(dataset: Dataset) -> None:
    if dataset.pair_id != EXPECTED_PAIR_ID:
        raise ValueError(f"Dataset {dataset.id} is {dataset.pair_id}, expected {EXPECTED_PAIR_ID}")
    for instrument, expected_product in EXPECTED_PRODUCTS.items():
        actual_product = (
            dataset.source_product_id if instrument == "OHRC" else dataset.reference_product_id
        )
        if actual_product != expected_product:
            raise ValueError(
                f"Unexpected {instrument} product ID: {actual_product}; "
                f"expected {expected_product}"
            )


def discover_files(pair_root: Path, dataset: Dataset) -> list[IngestItem]:
    if not pair_root.is_dir():
        raise ValueError(f"Pair path does not exist: {pair_root}")

    expected = expected_file_names(dataset)
    discovered: list[IngestItem] = []
    for file_name, instrument in expected.items():
        candidates = [
            path
            for path in (pair_root / instrument).rglob(file_name)
            if path.is_file() and "calibrated" in path.parts
        ]
        if len(candidates) != 1:
            raise ValueError(
                f"Expected exactly one calibrated {instrument} file named {file_name}; "
                f"found {len(candidates)}"
            )
        discovered.append(
            IngestItem(
                path=candidates[0],
                instrument=instrument,
                file_role="metadata" if candidates[0].suffix.lower() == ".xml" else ROLE_BY_INSTRUMENT[instrument],
            )
        )
    return discovered


def file_type(path: Path) -> str:
    extension = path.suffix.lower().lstrip(".")
    return extension if extension in {"img", "xml", "png", "tiff", "json", "txt", "zip"} else "other"


def mime_type(path: Path) -> str:
    if path.suffix.lower() == ".img":
        return "application/octet-stream"
    if path.suffix.lower() == ".xml":
        return "application/xml"
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def destination_role(item: IngestItem) -> str:
    return item.file_role


def ingest_item(
    db,
    dataset: Dataset,
    storage: GoogleDriveStorage,
    item: IngestItem,
) -> str:
    folder = resolve_upload_folder(storage, dataset, destination_role(item))
    existing_drive_file = storage.find_file(item.path.name, folder["id"])
    if existing_drive_file is not None:
        registered = db.scalar(
            select(DatasetFile).where(
                DatasetFile.drive_file_id == existing_drive_file["id"]
            )
        )
        if registered is not None or existing_drive_file.get("id"):
            print(f"SKIP {item.path.name}: already exists in destination folder")
            return "skipped"

    size_bytes = item.path.stat().st_size
    print(f"UPLOAD {item.path.name}")
    uploaded = storage.upload_file(
        item.path,
        name=item.path.name,
        parent_id=folder["id"],
        mime_type=mime_type(item.path),
    )

    try:
        record = create_dataset_file(
            db,
            dataset.id,
            DatasetFileCreate(
                file_role=item.file_role,
                file_name=item.path.name,
                file_type=file_type(item.path),
                storage_provider="google_drive",
                drive_file_id=uploaded["id"],
                drive_folder_id=folder["id"],
                file_size_bytes=size_bytes,
                mime_type=uploaded.get("mimeType", mime_type(item.path)),
            ),
        )
    except Exception as exc:
        raise DatasetFileRegistrationError(
            f"Drive upload succeeded for {item.path.name}, but DB registration failed"
        ) from exc
    if record is None:
        raise DatasetFileRegistrationError(
            f"Drive upload succeeded for {item.path.name}, but DB registration failed"
        )
    print(f"SUCCESS {item.path.name}: drive_file_id={uploaded['id']}")
    return "uploaded"


def run(args: argparse.Namespace) -> int:
    db = SessionLocal()
    summary = IngestSummary()
    try:
        dataset = db.get(Dataset, args.dataset_id)
        if dataset is None:
            print(f"FAILED dataset {args.dataset_id}: dataset not found")
            return 1
        validate_dataset(dataset)
        items = discover_files(args.path, dataset)
        summary.discovered = len(items)
        print(f"Dataset:\n{dataset.pair_id}\n")
        storage = GoogleDriveStorage()
        for item in items:
            try:
                result = ingest_item(db, dataset, storage, item)
                if result == "uploaded":
                    summary.uploaded += 1
                else:
                    summary.skipped += 1
            except Exception as exc:
                summary.failed += 1
                print(f"FAILED {item.path.name}: {exc}")
                if not args.continue_on_error:
                    break
    except (GoogleAuthError, ValueError, OSError) as exc:
        summary.failed += 1
        print(f"FAILED: {exc}")
        return 1
    finally:
        db.close()

    print(
        f"\nDiscovered: {summary.discovered}\n"
        f"Uploaded: {summary.uploaded}\n"
        f"Skipped: {summary.skipped}\n"
        f"Failed: {summary.failed}"
    )
    return 1 if summary.failed else 0


def main() -> int:
    return run(parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
