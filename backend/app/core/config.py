"""Environment-backed application configuration."""

from __future__ import annotations

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        extra="ignore",
        populate_by_name=True,
    )

    frontend_origins: list[str] = Field(
        default=["*"],
        validation_alias=AliasChoices("LUNA_REG_FRONTEND_ORIGINS", "FRONTEND_ORIGINS"),
    )
    api_base_url: str = Field(
        default="http://127.0.0.1:8000",
        validation_alias=AliasChoices("LUNA_REG_API_BASE_URL", "API_BASE_URL"),
    )
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("LUNA_REG_ENVIRONMENT", "ENVIRONMENT"),
    )
    cors_allow_credentials: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "LUNA_REG_CORS_ALLOW_CREDENTIALS",
            "CORS_ALLOW_CREDENTIALS",
        ),
    )

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_frontend_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
