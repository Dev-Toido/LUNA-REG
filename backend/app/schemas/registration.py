"""Schemas for registration jobs, status, and results."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class MatchPointSchema(BaseModel):
    ref_x: float
    ref_y: float
    tgt_x: float
    tgt_y: float
    residual: Optional[float] = None


class RegistrationMetricsSchema(BaseModel):
    rmse: Optional[float] = None
    mae: Optional[float] = None
    max_error: Optional[float] = None
    inlier_ratio: Optional[float] = None
    inlier_matches: Optional[int] = None
    total_matches: Optional[int] = None
    confidence: Optional[float] = None
    scale_ratio: Optional[float] = None
    rotation_deg: Optional[float] = None
    moving_coverage: Optional[float] = None
    reference_coverage: Optional[float] = None
    processing_time: Optional[str] = None
    transformation_type: Optional[str] = "Homography (8-DOF)"


class RegistrationSubmissionResponse(BaseModel):
    job_id: str
    status: str = "processing"
    message: str = "Registration job initialized and queued for processing"


class RegistrationStatusResponse(BaseModel):
    job_id: str
    status: str  # "queued", "processing", "completed", "failed", "cancelled"
    stage: str = "validation"
    progress: int = 0
    message: str = ""
    created_at: str
    elapsed_seconds: float = 0.0
    logs: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class RegistrationResultResponse(BaseModel):
    job_id: str
    status: str = "completed"
    registered_image_url: Optional[str] = None
    reference_image_url: Optional[str] = None
    target_image_url: Optional[str] = None
    difference_image_url: Optional[str] = None
    overlay_image_url: Optional[str] = None
    report_url: Optional[str] = None
    csv_url: Optional[str] = None
    homography_matrix: Optional[List[List[float]]] = None
    metrics: RegistrationMetricsSchema
    matches: List[MatchPointSchema] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
