"""
Health observations router.

Endpoints:
  GET    /api/health                         List observations (filterable)
  POST   /api/health                         Create an observation
  GET    /api/health/{id}                    Get a single observation
  PATCH  /api/health/{id}                    Update an observation
  DELETE /api/health/{id}                    Soft-delete an observation
  GET    /api/health/symptoms                List the symptom catalogue
  GET    /api/dashboard                      Dashboard summary for all pets
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.health import (
    HealthObservation,
    HealthObservationSymptom,
    Symptom,
)
from ..models.user import User
from ..schemas.health import (
    DashboardResponse,
    HealthObservationCreate,
    HealthObservationResponse,
    HealthObservationUpdate,
    SymptomResponse,
)
from ..services.auth_service import get_current_user
from ..services.health_service import (
    build_dashboard,
    create_observation,
    soft_delete_observation,
    update_observation,
)

router = APIRouter(tags=["health"])


async def _load_observation(obs_id: int, db: AsyncSession) -> HealthObservation:
    """Load an observation with all related data or raise 404."""
    result = await db.execute(
        select(HealthObservation)
        .where(
            HealthObservation.id == obs_id,
            HealthObservation.deleted_at.is_(None),
        )
        .options(
            selectinload(HealthObservation.symptoms).selectinload(
                HealthObservationSymptom.symptom
            )
        )
    )
    obs = result.scalar_one_or_none()
    if obs is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Health observation {obs_id} not found.",
        )
    return obs


# --- Symptom catalogue ---

@router.get("/api/health/symptoms", response_model=list[SymptomResponse])
async def list_symptoms(
    species: Optional[str] = Query(
        default=None,
        description="Filter by species ('dog' or 'cat'). "
                    "Omit for all active symptoms.",
    ),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SymptomResponse]:
    """
    Return the active symptom catalogue.

    When species='cat', returns only symptoms where applies_to_species='all'.
    When species='dog' or omitted, returns all active symptoms.
    """
    query = select(Symptom).where(Symptom.is_active.is_(True))

    if species == "cat":
        query = query.where(Symptom.applies_to_species == "all")

    query = query.order_by(Symptom.display_order)
    result = await db.execute(query)
    return [SymptomResponse.model_validate(s) for s in result.scalars().all()]


# --- Health observation CRUD ---

@router.get("/api/health", response_model=list[HealthObservationResponse])
async def list_observations(
    pet_id: Optional[int] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[HealthObservationResponse]:
    """Return health observations with optional filtering."""
    query = (
        select(HealthObservation)
        .where(HealthObservation.deleted_at.is_(None))
        .options(
            selectinload(HealthObservation.symptoms).selectinload(
                HealthObservationSymptom.symptom
            )
        )
        .order_by(
            HealthObservation.observation_date.desc(),
            HealthObservation.observed_at.desc(),
        )
        .limit(limit)
    )

    if pet_id is not None:
        query = query.where(HealthObservation.pet_id == pet_id)
    if date_from is not None:
        query = query.where(HealthObservation.observation_date >= date_from)
    if date_to is not None:
        query = query.where(HealthObservation.observation_date <= date_to)

    result = await db.execute(query)
    return [HealthObservationResponse.model_validate(o) for o in result.scalars().all()]


@router.post(
    "/api/health",
    response_model=HealthObservationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_health_observation(
    payload: HealthObservationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthObservationResponse:
    """Create a new health observation for a pet."""
    obs = await create_observation(payload, current_user.id, db)
    return HealthObservationResponse.model_validate(await _load_observation(obs.id, db))


@router.get("/api/health/{obs_id}", response_model=HealthObservationResponse)
async def get_observation(
    obs_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> HealthObservationResponse:
    """Return a single health observation."""
    return HealthObservationResponse.model_validate(await _load_observation(obs_id, db))


@router.patch("/api/health/{obs_id}", response_model=HealthObservationResponse)
async def update_health_observation(
    obs_id: int,
    payload: HealthObservationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthObservationResponse:
    """Partial update of a health observation."""
    obs = await update_observation(obs_id, payload, current_user.id, db)
    return HealthObservationResponse.model_validate(await _load_observation(obs.id, db))


@router.delete("/api/health/{obs_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_observation(
    obs_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    """Soft-delete a health observation."""
    await soft_delete_observation(obs_id, db)


# --- Dashboard ---

@router.get("/api/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardResponse:
    """
    Return today's summary for all active pets.

    Includes: meals logged today, missed schedule slots, latest health
    observation, and active symptoms from today's observations.
    """
    return await build_dashboard(db)
