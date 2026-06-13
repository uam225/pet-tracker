"""
Meal logging service.

Contains the business logic for:
- Computing meal deviation from the configured schedule window
- Enforcing the deviation reason requirement (breakfast/dinner)
- Creating and updating meal log entries
- Enforcing the correction window policy
"""

from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.food import FoodItem
from ..models.meal_log import MealLog, MealLogItem
from ..models.pet import Pet, PetMealScheduleSlot
from ..schemas.meal_log import MealLogCorrection, MealLogCreate, MealLogUpdate


def compute_deviation_minutes(
    fed_at: datetime,
    window_start: time,
    window_end: time,
) -> int:
    """
    Calculate how far outside the schedule window a feeding occurred.

    Returns:
        0   if fed_at time falls within [window_start, window_end]
        < 0 if fed early (minutes before window_start)
        > 0 if fed late (minutes after window_end)

    Times are compared without timezone info (the fed_at time component
    is stripped of tz) because window_start and window_end are stored as
    naive time objects representing UTC wall-clock hours.

    Midnight-crossing windows are not supported; window_start < window_end
    is enforced at the schedule slot creation layer.
    """
    # Extract the time component from the UTC datetime for comparison.
    fed_time = fed_at.astimezone(timezone.utc).replace(tzinfo=None).time()

    if window_start <= fed_time <= window_end:
        return 0

    # Use a reference date to compute minute deltas via timedelta arithmetic.
    ref_date = fed_at.date()
    fed_dt = datetime.combine(ref_date, fed_time)

    if fed_time < window_start:
        # Fed before the window opened: deviation is negative (early).
        start_dt = datetime.combine(ref_date, window_start)
        return -int((start_dt - fed_dt).total_seconds() / 60)
    else:
        # Fed after the window closed: deviation is positive (late).
        end_dt = datetime.combine(ref_date, window_end)
        return int((fed_dt - end_dt).total_seconds() / 60)


async def _get_pet_or_404(pet_id: int, db: AsyncSession) -> Pet:
    result = await db.execute(
        select(Pet)
        .where(Pet.id == pet_id, Pet.deleted_at.is_(None))
        .options(selectinload(Pet.schedule_slots))
    )
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pet {pet_id} not found.",
        )
    return pet


async def _get_food_item_or_404(food_item_id: int, db: AsyncSession) -> FoodItem:
    result = await db.execute(
        select(FoodItem).where(FoodItem.id == food_item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Food item {food_item_id} not found.",
        )
    if item.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Food item '{item.name}' is archived. "
                "Select an active item or create a new version."
            ),
        )
    return item


async def create_meal_log(
    payload: MealLogCreate,
    logged_by_user_id: int,
    db: AsyncSession,
) -> MealLog:
    """
    Create a new meal log entry, computing and enforcing deviation rules.

    Business rules applied:
    1. All food items must be active (not archived).
    2. For dogs: deviation is computed from the matching schedule slot.
    3. For breakfast/dinner with non-zero deviation: deviation_reason is mandatory.
    4. For cats (ad_hoc): no schedule lookup; deviation fields are NULL.
    """
    pet = await _get_pet_or_404(payload.pet_id, db)

    # Validate all food items before creating any records.
    for log_item in payload.items:
        await _get_food_item_or_404(log_item.food_item_id, db)

    # --- Deviation calculation ---
    scheduled_window_start: Optional[datetime] = None
    scheduled_window_end: Optional[datetime] = None
    deviation_minutes: Optional[int] = None

    if pet.species == "dog" and payload.meal_type != "ad_hoc":
        # Find the matching schedule slot for this meal type.
        slot = next(
            (s for s in pet.schedule_slots if s.meal_type == payload.meal_type),
            None,
        )
        if slot is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"No schedule slot configured for '{payload.meal_type}' "
                    f"on pet '{pet.name}'."
                ),
            )

        # Capture the schedule window on the log entry at the time of logging.
        # This preserves historical accuracy if the schedule is changed later.
        fed_date = payload.fed_at.date()
        scheduled_window_start = datetime.combine(
            fed_date, slot.window_start
        ).replace(tzinfo=timezone.utc)
        scheduled_window_end = datetime.combine(
            fed_date, slot.window_end
        ).replace(tzinfo=timezone.utc)

        deviation_minutes = compute_deviation_minutes(
            payload.fed_at,
            slot.window_start,
            slot.window_end,
        )

        # Enforce deviation reason for breakfast and dinner.
        if slot.reason_required_on_deviation and deviation_minutes != 0:
            if not payload.deviation_reason or not payload.deviation_reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"A reason is required when logging {payload.meal_type} "
                        f"outside the scheduled window "
                        f"({slot.window_start.strftime('%H:%M')}"
                        f"-{slot.window_end.strftime('%H:%M')} UTC). "
                        f"This meal is {abs(deviation_minutes)} minutes "
                        f"{'early' if deviation_minutes < 0 else 'late'}."
                    ),
                )

    # --- Create the log entry ---
    log = MealLog(
        pet_id=payload.pet_id,
        logged_by=logged_by_user_id,
        meal_type=payload.meal_type,
        fed_at=payload.fed_at,
        scheduled_window_start=scheduled_window_start,
        scheduled_window_end=scheduled_window_end,
        deviation_minutes=deviation_minutes,
        deviation_reason=payload.deviation_reason,
        notes=payload.notes,
    )
    db.add(log)
    await db.flush()  # Get log.id before creating items

    for log_item in payload.items:
        db.add(
            MealLogItem(
                meal_log_id=log.id,
                food_item_id=log_item.food_item_id,
                portion_grams=log_item.portion_grams,
                notes=log_item.notes,
            )
        )

    await db.flush()
    return log


async def update_meal_log(
    log_id: int,
    payload: MealLogUpdate,
    requesting_user_id: int,
    db: AsyncSession,
) -> MealLog:
    """
    In-place update of a meal log entry within the correction window.

    Only the user who created the entry may update it.
    Only permitted within CORRECTION_WINDOW_SECONDS of creation.
    After the window, use create_correction_entry instead.
    """
    result = await db.execute(
        select(MealLog)
        .where(MealLog.id == log_id, MealLog.deleted_at.is_(None))
        .options(selectinload(MealLog.items))
    )
    log = result.scalar_one_or_none()

    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal log not found.")

    if log.logged_by != requesting_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the user who created this entry may edit it.",
        )

    if not log.is_within_correction_window:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The correction window for this entry has elapsed. "
                "Submit a correction entry instead."
            ),
        )

    # Apply partial updates
    if payload.fed_at is not None:
        log.fed_at = payload.fed_at
    if payload.deviation_reason is not None:
        log.deviation_reason = payload.deviation_reason
    if payload.notes is not None:
        log.notes = payload.notes

    if payload.items is not None:
        # Replace all items: delete existing, insert new ones.
        for existing_item in log.items:
            await db.delete(existing_item)
        await db.flush()

        for item_data in payload.items:
            await _get_food_item_or_404(item_data.food_item_id, db)
            db.add(
                MealLogItem(
                    meal_log_id=log.id,
                    food_item_id=item_data.food_item_id,
                    portion_grams=item_data.portion_grams,
                    notes=item_data.notes,
                )
            )

    await db.flush()
    return log


async def create_correction_entry(
    payload: MealLogCorrection,
    logged_by_user_id: int,
    db: AsyncSession,
) -> MealLog:
    """
    Create a superseding meal log entry after the correction window has elapsed.

    The original entry is not modified. Both records persist in the database.
    The new entry carries corrects_log_id pointing to the original.
    """
    # Verify the entry being corrected exists
    original_result = await db.execute(
        select(MealLog).where(
            MealLog.id == payload.corrects_log_id,
            MealLog.deleted_at.is_(None),
        )
    )
    original = original_result.scalar_one_or_none()

    if original is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Original meal log entry {payload.corrects_log_id} not found.",
        )

    if original.is_within_correction_window:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The original entry is still within the correction window. "
                "Use the standard update endpoint instead."
            ),
        )

    # Create the correction as a new log entry
    create_payload = MealLogCreate(
        pet_id=payload.pet_id,
        meal_type=payload.meal_type,
        fed_at=payload.fed_at,
        items=payload.items,
        deviation_reason=payload.deviation_reason,
        notes=payload.notes,
    )
    new_log = await create_meal_log(create_payload, logged_by_user_id, db)
    new_log.corrects_log_id = payload.corrects_log_id

    await db.flush()
    return new_log


async def get_todays_logs_for_pet(
    pet_id: int,
    today: date,
    db: AsyncSession,
) -> list[MealLog]:
    """Return all non-deleted meal logs for a pet on a specific date."""
    result = await db.execute(
        select(MealLog)
        .where(
            MealLog.pet_id == pet_id,
            MealLog.deleted_at.is_(None),
            # Cast fed_at to date for comparison.
            # SQLite stores datetimes as strings; this string prefix match works
            # because fed_at is stored in ISO 8601 format (YYYY-MM-DD...).
        )
        .options(
            selectinload(MealLog.items).selectinload(MealLogItem.food_item)
        )
        .order_by(MealLog.fed_at)
    )
    logs = result.scalars().all()
    # Filter in Python for date comparison (avoids SQLite DATE() function quirks
    # with timezone-aware strings).
    return [
        log for log in logs
        if log.fed_at.astimezone(timezone.utc).date() == today
    ]
