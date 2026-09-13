"""Print metadata found in a product XML label as JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.product_metadata import extract_product_metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xml_path", type=Path)
    args = parser.parse_args()
    print(json.dumps(extract_product_metadata(args.xml_path).to_dict(), indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())