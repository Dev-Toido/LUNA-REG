"""Application entry point for the LUNA-REG backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.canonical import router as canonical_router
from app.api.canonical_write import router as canonical_write_router
from app.api.datasets import router as datasets_router
from app.api.dataset_files import router as dataset_files_router
from app.api.registration_jobs import router as registration_jobs_router
from app.api.storage import router as storage_router
from app.core.config import settings
from app.db.database import Base, engine
from app.db import models


@asynccontextmanager
async def lifespan(_: FastAPI):
	Base.metadata.create_all(bind=engine)
	yield


app = FastAPI(title="LUNA-REG Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
	CORSMiddleware,
	allow_origins=settings.frontend_origins,
	allow_credentials=settings.cors_allow_credentials,
	allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
	allow_headers=["Content-Type", "Authorization"],
)
app.include_router(datasets_router)
app.include_router(dataset_files_router)
app.include_router(canonical_router)
app.include_router(canonical_router, prefix="/api/v1")
app.include_router(canonical_write_router)
app.include_router(registration_jobs_router)
app.include_router(auth_router)
app.include_router(storage_router)


@app.get("/")
def read_root() -> dict[str, str]:
	return {"project": "LUNA-REG", "status": "running"}


@app.get("/health")
def read_health() -> dict[str, str]:
	return {"status": "ok"}


@app.get("/api/info")
def read_api_info() -> dict[str, str]:
	return {
		"name": "LUNA-REG",
		"version": app.version,
		"environment": settings.environment,
		"api_version": "v1",
	}
