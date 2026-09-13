"""Backend-to-Core client contracts."""

from app.core_client.client import CoreClient, MockCoreClient, get_core_client

__all__ = ["CoreClient", "MockCoreClient", "get_core_client"]
