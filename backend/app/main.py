"""
FastAPI application factory.

Startup sequence (via lifespan):
  1. Run Alembic migrations programmatically to ensure the schema is current.
  2. Seed reference data (food categories, symptom catalogue) if absent.

CORS:
  Development: allow http://localhost:5173 (Vite dev server)
  Production:  no CORS middleware - Caddy serves both frontend and API from
               the same origin, so cross-origin requests do not occur.
"""

import subprocess
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import AsyncSessionLocal
# Import all models so they are registered with Base metadata before any
# migration or seeding operation runs.
from .models import (  # noqa: F401
    FoodCategory,
    FoodItem,
    FoodItemEditHistory,
    FoodItemIngredient,
    HealthObservation,
    HealthObservationSymptom,
    Ingredient,
    MealLog,
    MealLogItem,
    Pet,
    PetMealScheduleSlot,
    Symptom,
    User,
)
from .routers import auth, food_library, health_observations, meal_logs, pets
from .seeds import seed_reference_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan: runs migrations and seeds on startup, nothing on shutdown.
    """
    # Run Alembic migrations to head. This is safe to call on every startup:
    # if the schema is already current, no-op. Alembic's migration lock
    # prevents race conditions if multiple processes start simultaneously.
    try:
        subprocess.run(
            ["alembic", "upgrade", "head"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"Alembic migration failed:\n{e.stderr}", file=sys.stderr)
        raise

    # Seed reference data (idempotent)
    async with AsyncSessionLocal() as db:
        await seed_reference_data(db)

    yield  # Application runs here


app = FastAPI(
    title="Pet Tracker",
    version="1.0.0",
    description="Diet and health tracking for Umair and partner's pets.",
    # Disable the default OpenAPI docs in production
    docs_url="/api/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT == "development" else None,
    lifespan=lifespan,
)

# CORS only needed in development: the Vite dev server runs on a different port.
# In production, Caddy serves both the SPA and the API from the same origin.
if settings.ENVIRONMENT == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,  # Required for httpOnly cookie auth
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- Routers ---
app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(food_library.router)
app.include_router(meal_logs.router)
app.include_router(health_observations.router)


# --- Health probe ---
# Used by Docker Compose healthcheck and Caddy upstream monitoring.
# Intentionally distinct from /api/health (the health observations list endpoint).
@app.get("/api/healthz", tags=["meta"], include_in_schema=False)
async def health_probe() -> dict:
    """Lightweight liveness probe. Returns 200 when the application is running."""
    return {"status": "ok"}
