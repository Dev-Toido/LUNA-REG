"""Tests for versioned canonical API routes."""

from fastapi import HTTPException

from app.api import canonical
from app.main import app


VERSIONED_PATHS = {
    "/regions": "/api/v1/regions",
    "/regions/{region_id}": "/api/v1/regions/{region_id}",
    "/products": "/api/v1/products",
    "/products/{product_id}": "/api/v1/products/{product_id}",
    "/products/{product_id}/files": "/api/v1/products/{product_id}/files",
    "/pairs": "/api/v1/pairs",
    "/pairs/{pair_id}": "/api/v1/pairs/{pair_id}",
    "/pairs/{pair_id}/registration-input": "/api/v1/pairs/{pair_id}/registration-input",
}


def _response_shape(operation):
    response = operation["responses"]
    shape = {}
    for code, value in response.items():
        content = value.get("content", {})
        schema = content.get("application/json", {}).get("schema")
        if schema is not None:
            schema = dict(schema)
            schema.pop("title", None)
        shape[code] = (value.get("description"), schema)
    return shape


def test_versioned_routes_reuse_existing_handlers() -> None:
    paths = app.openapi()["paths"]
    for old_path, versioned_path in VERSIONED_PATHS.items():
        assert old_path in paths
        assert versioned_path in paths
        old_operation = paths[old_path]["get"]
        versioned_operation = paths[versioned_path]["get"]
        assert old_operation["summary"] == versioned_operation["summary"]
        assert _response_shape(old_operation) == _response_shape(versioned_operation)


def test_versioned_openapi_tags() -> None:
    paths = app.openapi()["paths"]
    assert "regions" in paths["/api/v1/regions"]["get"]["tags"]
    assert "products" in paths["/api/v1/products"]["get"]["tags"]
    assert "pairs" in paths["/api/v1/pairs"]["get"]["tags"]


def test_versioned_missing_resource_behavior_matches_old_routes() -> None:
    class EmptyDb:
        def get(self, model, resource_id):
            return None

        def scalar(self, statement):
            return None

    for endpoint in (
        lambda: canonical.get_region_endpoint(999, EmptyDb()),
        lambda: canonical.get_product_endpoint(999, EmptyDb()),
        lambda: canonical.get_pair_endpoint(999, EmptyDb()),
        lambda: canonical.get_pair_registration_input_endpoint(999, EmptyDb()),
    ):
        try:
            endpoint()
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("missing canonical resource did not return 404")
