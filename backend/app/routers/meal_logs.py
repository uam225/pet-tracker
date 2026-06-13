"""
Meal logs router.

Endpoints:
  GET    /api/meal-logs                      List meal logs (filterable)
  POST   /api/meal-logs                      Create a meal log entry
  GET    /api/meal-logs/{id}                 Get a single meal log
  PATCH  /api/meal-logs/{id}                 Update (within correction window)
  POST   /api/meal-logs/{id}/correct         Superseding correction (post-window)
  DELETE /api/meal-logs/{id}                 Soft-delete a meal log
"""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.food import FoodItemIngredient
from ..models.meal_log import MealLog, MealLogItem
from ..models.user import User
from ..schemas.meal_log import (
    MealLogCorrection,
    MealLogCreate,
    MealLogResponse,
    MealLogUpdate,
)
from ..services.auth_service import get_current_user
from ..services.meal_service import (
    create_correction_entry,
    create_meal_log,
    update_meal_log,
)

router = APIRouter(prefix="/api/meal-logs", tags=["meal-logs"])


async def _load_log(log_id: int, db: AsyncSession) -> MealLog:
    """Load a meal log with all related data or raise 404."""
    result = await db.execute(
        select(MealLog)
        .where(MealLog.id == log_id, MealLog.deleted_at.is_(None))
        .options(
            selectinload(MealLog.items).selectinload(MealLogItem.food_item).selectinload(
                "ingredients"
            ).selectinload(FoodItemIngredient.ingredient)
        )
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meal log {log_id} not found.",
        )
    return log


@router.get("", response_model=list[MealLogResponse])
async def list_meal_logs(
    pet_id: Optional[int] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MealLogResponse]:
    """
    Return meal logs with optional filtering by pet and date range.

    Defaults to the 50 most recent entries if no date range is supplied.
    """
    query = (
        select(MealLog)
        .where(MealLog.deleted_at.is_(None))
        .options(
            selectinload(MealLog.items)
            .selectinload(MealLogItem.food_item)
            .selectinload("ingredients")
            .selectinload(FoodItemIngredient.ingredient)
        )
        .order_by(MealLog.fed_at.desc())
        .limit(limit)
    )

    if pet_id is not None:
        query = query.where(MealLog.pet_id == pet_id)

    if date_from is not None:
        query = query.where(MealLog.fed_at >= datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc))

    if date_to is not None:
        query = query.where(MealLog.fed_at <= datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc))

    result = await db.execute(query)
    logs = result.scalars().all()
    return [MealLogResponse.model_validate(log) for log in logs]


@router.post("", response_model=MealLogResponse, status_code=status.HTTP_201_CREATED)
async def create_log(
    payload: MealLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MealLogResponse:
    """
    Create a new meal log entry.

    Deviation from the schedule window is computed automatically.
    A reason is required for breakfast/dinner entries outside their window.
    """
    log = await create_meal_log(payload, current_user.id, db)
    return MealLogResponse.model_validate(await _load_log(log.id, db))


@router.get("/{log_id}", response_model=MealLogResponse)
async def get_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MealLogResponse:
    """Return a single meal log entry."""
    return MealLogResponse.model_validate(await _load_log(log_id, db))


@router.patch("/{log_id}", response_model=MealLogResponse)
async def update_log(
    log_id: int,
    payload: MealLogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MealLogResponse:
    """
    In-place update of a meal log entry.

    Only permitted within the correction window (60 minutes of creation).
    Only the user who created the entry may update it.
    """
    log = await update_meal_log(log_id, payload, current_user.id, db)
    return MealLogResponse.model_validate(await _load_log(log.id, db))


@router.post("/{log_id}/correct", response_model=MealLogResponse, status_code=status.HTTP_201_CREATED)
async def correct_log(
    log_id: int,
    payload: MealLogCorrection,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MealLogResponse:
    """
    Create a superseding correction entry after the correction window.

    The original entry is retained unchanged. The new entry carries
    corrects_log_id referencing the original.
    """
    # Enforce that the corrects_log_id in the URL matches the payload
    if payload.corrects_log_id != log_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="corrects_log_id in the request body must match the URL parameter.",
        )
    new_log = await create_correction_entry(payload, current_user.id, db)
    return MealLogResponse.model_validate(await _load_log(new_log.id, db))


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    """Soft-delete a meal log entry."""
    result = await db.execute(
        select(MealLog).where(MealLog.id == log_id, MealLog.deleted_at.is_(None))
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meal log {log_id} not found.",
        )
    log.deleted_at = datetime.now(timezone.utc)
    await db.flush()
