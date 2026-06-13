"""
Application configuration.

All values are sourced from environment variables or a .env file.
No secrets are ever hardcoded here. The SECRET_KEY has no default
and will raise a validation error on startup if not set.
"""

from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    ENVIRONMENT: Literal["development", "production"] = "production"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:////data/pettracker.db"

    # Authentication
    # SECRET_KEY is required. Generate with:
    # python -c "import secrets; print(secrets.token_hex(64))"
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    # Token lifetime in minutes. Default: 7 days.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10_080

    # Application constraints
    # Hard limit: this application supports exactly two users.
    MAX_USERS: int = 2

    # Meal log correction window in seconds. Default: 60 minutes.
    CORRECTION_WINDOW_SECONDS: int = 3_600


settings = Settings()
