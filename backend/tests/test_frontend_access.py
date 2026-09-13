"""Tests for frontend-facing configuration and API discovery."""

import asyncio

from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.main import app, read_api_info, read_health, read_root


def test_frontend_settings_parse_origins_and_credentials() -> None:
    settings = Settings(
        frontend_origins="http://localhost:3000, http://127.0.0.1:3000",
        api_base_url="http://localhost:8000",
        environment="test",
        cors_allow_credentials=True,
    )
    assert settings.frontend_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    assert settings.api_base_url == "http://localhost:8000"
    assert settings.environment == "test"
    assert settings.cors_allow_credentials is True


def test_cors_middleware_is_configured_for_frontend_access() -> None:
    middleware = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
    options = middleware.kwargs
    assert options["allow_origins"]
    assert options["allow_methods"] == ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    assert options["allow_headers"] == ["Content-Type", "Authorization"]
    assert options["allow_credentials"] is False


def test_api_info_and_existing_root_health() -> None:
    assert read_api_info() == {
        "name": "LUNA-REG",
        "version": app.version,
        "environment": "development",
        "api_version": "v1",
    }
    assert read_root() == {"project": "LUNA-REG", "status": "running"}
    assert read_health() == {"status": "ok"}
    paths = app.openapi()["paths"]
    assert "/api/info" in paths
    assert "/regions" in paths
    assert "/products" in paths
    assert "/pairs" in paths
    assert "/datasets" in paths
    assert "/auth/google/login" in paths
    for path in (
        "/api/v1/regions",
        "/api/v1/regions/{region_id}",
        "/api/v1/products",
        "/api/v1/products/{product_id}",
        "/api/v1/products/{product_id}/files",
        "/api/v1/pairs",
        "/api/v1/pairs/{pair_id}",
        "/api/v1/pairs/{pair_id}/registration-input",
    ):
        assert path in paths


async def _send_request(method: str, path: str, headers: dict[str, str]):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await app(
        {
            "type": "http",
            "method": method,
            "path": path,
            "query_string": b"",
            "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("testclient", 1),
            "root_path": "",
            "http_version": "1.1",
        },
        receive,
        send,
    )
    return messages


def test_cors_preflight_allows_configured_origin() -> None:
    messages = asyncio.run(
        _send_request(
            "OPTIONS",
            "/api/v1/regions",
            {
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
    )
    response_start = next(message for message in messages if message["type"] == "http.response.start")
    headers = dict(response_start["headers"])
    assert response_start["status"] == 200
    assert headers[b"access-control-allow-origin"] == b"http://localhost:3000"
    assert b"GET" in headers[b"access-control-allow-methods"]


def test_cors_disallows_unknown_origin() -> None:
    messages = asyncio.run(
        _send_request(
            "GET",
            "/api/info",
            {"Origin": "http://untrusted.example"},
        )
    )
    response_start = next(message for message in messages if message["type"] == "http.response.start")
    headers = dict(response_start["headers"])
    assert b"access-control-allow-origin" not in headers
