"""Read schemas for canonical regions."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RegionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region_type: str
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    description: str | None
    created_at: datetime
