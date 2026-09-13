"""End-to-end frontend contract tests using isolated in-memory SQLite."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session

from app.db.database import Base, get_db
from app.db.models import Pair, Product, ProductFile
from app.main import app


async def _request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    payload = json.dumps(body).encode() if body is not None else b""
    request_headers = {"content-type": "application/json"} if body is not None else {}
    request_headers.update(headers or {})
    messages: list[dict[str, Any]] = []
    consumed = False

    async def receive() -> dict[str, Any]:
        nonlocal consumed
        if consumed:
            return {"type": "http.disconnect"}
        consumed = True
        return {"type": "http.request", "body": payload, "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    await app(
        {
            "type": "http",
            "method": method,
            "path": path,
            "query_string": b"",
            "headers": [(key.lower().encode(), value.encode()) for key, value in request_headers.items()],
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("testclient", 1),
            "root_path": "",
            "http_version": "1.1",
        },
        receive,
        send,
    )
    response_start = next(message for message in messages if message["type"] == "http.response.start")
    response_body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return response_start["status"], dict(response_start["headers"]), response_body


def _json(body: bytes) -> dict[str, Any]:
    return json.loads(body.decode())


def _seed_database() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    source = Product(
        instrument="OHRC",
        mission="Chandrayaan-2",
        product_id="PAIR-B-SOURCE",
        product_type="image",
        calibration_status="Calibrated",
    )
    reference = Product(
        instrument="TMC-2",
        mission="Chandrayaan-2",
        product_id="PAIR-B-REFERENCE",
        product_type="image",
        calibration_status="Calibrated",
    )
    db.add_all([source, reference])
    db.flush()
    db.add_all(
        [
            ProductFile(
                product_id=source.id,
                file_role="source_raw",
                file_name="pair-b-source.img",
                file_type="img",
                drive_file_id="contract-drive-source",
            ),
            ProductFile(
                product_id=reference.id,
                file_role="reference_raw",
                file_name="pair-b-reference.img",
                file_type="img",
                drive_file_id="contract-drive-reference",
            ),
        ]
    )
    db.add(
        Pair(
            source_product_id=source.id,
            reference_product_id=reference.id,
            source_instrument="OHRC",
            reference_instrument="TMC-2",
            overlap_status="UNVERIFIED",
        )
    )
    db.commit()
    return db


def test_frontend_api_contract_end_to_end() -> None:
    db = _seed_database()

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        status_code, _, body = asyncio.run(_request("GET", "/api/v1/products"))
        assert status_code == 200 and len(_json(body)) == 2

        status_code, _, body = asyncio.run(_request("GET", "/api/v1/pairs"))
        assert status_code == 200 and len(_json(body)) == 1
        pair_id = _json(body)[0]["id"]

        status_code, _, body = asyncio.run(_request("GET", f"/api/v1/pairs/{pair_id}"))
        assert status_code == 200 and _json(body)["overlap_status"] == "UNVERIFIED"

        status_code, _, body = asyncio.run(_request("GET", f"/api/v1/pairs/{pair_id}/registration-input"))
        assert status_code == 200
        registration_input = _json(body)
        assert registration_input["source"]["files"][0]["drive_file_id"] == "contract-drive-source"
        assert registration_input["reference"]["files"][0]["drive_file_id"] == "contract-drive-reference"

        new_product = {
            "instrument": "LRO-NAC",
            "mission": "LRO",
            "product_id": "LRO-NEW-1",
            "product_type": "image",
            "calibration_status": "raw",
        }
        status_code, _, body = asyncio.run(_request("POST", "/api/v1/products", new_product))
        assert status_code == 201
        new_product_id = _json(body)["id"]

        new_file = {
            "file_role": "source_raw",
            "file_name": "lro-new.img",
            "file_type": "img",
            "drive_file_id": "contract-drive-new",
        }
        status_code, _, body = asyncio.run(_request("POST", f"/api/v1/products/{new_product_id}/files", new_file))
        assert status_code == 201 and _json(body)["drive_file_id"] == "contract-drive-new"

        new_pair = {
            "source_product_id": new_product_id,
            "reference_product_id": 2,
            "source_instrument": "LRO-NAC",
            "reference_instrument": "TMC-2",
        }
        status_code, _, body = asyncio.run(_request("POST", "/api/v1/pairs", new_pair))
        assert status_code == 201
        created_pair_id = _json(body)["id"]
        assert _json(body)["overlap_status"] == "UNVERIFIED"

        status_code, _, body = asyncio.run(
            _request(
                "PATCH",
                f"/api/v1/pairs/{created_pair_id}",
                {"verification_method": "manual-review", "overlap_status": "VERIFIED"},
            )
        )
        assert status_code == 200
        assert _json(body)["verification_method"] == "manual-review"

        status_code, _, body = asyncio.run(_request("GET", f"/api/v1/pairs/{created_pair_id}"))
        assert status_code == 200
        assert _json(body)["overlap_status"] == "VERIFIED"

        status_code, _, _ = asyncio.run(_request("GET", "/api/v1/products/999999"))
        assert status_code == 404

        status_code, _, body = asyncio.run(_request("GET", "/", headers={"Origin": "http://localhost:3000"}))
        assert status_code == 200
        assert body == b'{"project":"LUNA-REG","status":"running"}'
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_frontend_cors_contract() -> None:
    allowed_headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
    }
    status_code, headers, _ = asyncio.run(_request("OPTIONS", "/api/v1/products", headers=allowed_headers))
    assert status_code == 200
    assert headers[b"access-control-allow-origin"] == b"http://localhost:3000"
    assert b"GET" in headers[b"access-control-allow-methods"]

    status_code, headers, _ = asyncio.run(
        _request("GET", "/api/v1/products", headers={"Origin": "http://untrusted.example"})
    )
    assert status_code == 200
    assert b"access-control-allow-origin" not in headers
