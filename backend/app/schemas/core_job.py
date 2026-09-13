"""Schemas for Backend-to-Core registration jobs."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

JobStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]


class RegistrationJobCreate(BaseModel):
	options: dict[str, Any] | None = None


class RegistrationJobResponse(BaseModel):
	id: int
	pair_id: int
	status: JobStatus
	requested_options: dict[str, Any]
	core_job_id: str
	created_at: datetime
	started_at: datetime | None
	completed_at: datetime | None
	error_message: str | None


CoreJobCreate = RegistrationJobCreate
CoreJobResponse = RegistrationJobResponse