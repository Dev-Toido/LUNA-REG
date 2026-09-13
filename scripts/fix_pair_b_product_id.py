"""One-time correction for the Pair-B reference product ID."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import SessionLocal
from app.db.models import Dataset

DATASET_ID = 3
EXPECTED_PAIR_ID = "PAIR-B"
CORRECT_REFERENCE_PRODUCT_ID = "ch2_tmc_ncn_20211116T1329461965_d_img_d18"


def main() -> int:
    db = SessionLocal()
    try:
        dataset = db.get(Dataset, DATASET_ID)
        if dataset is None:
            print(f"ERROR: dataset {DATASET_ID} does not exist", file=sys.stderr)
            return 1
        if dataset.pair_id != EXPECTED_PAIR_ID:
            print(
                f"ERROR: dataset {DATASET_ID} has pair_id {dataset.pair_id!r}, "
                f"expected {EXPECTED_PAIR_ID!r}",
                file=sys.stderr,
            )
            return 1

        print(f"Old reference_product_id: {dataset.reference_product_id}")
        dataset.reference_product_id = CORRECT_REFERENCE_PRODUCT_ID
        db.commit()
        print(f"New reference_product_id: {dataset.reference_product_id}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
