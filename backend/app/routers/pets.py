"""
Pets router.

Endpoints:
  GET    /api/pets                        List active pets
  POST   /api/pets                        Create a pet
  GET    /api/pets/{id}                   Get a single pet
  PATCH  /api/pets/{id}                   Update a pet's profile
  DELETE /api/pets/{id}                   Soft-delete a pet
  GET    /api/pets/{id}/schedule          Get schedule slots
  PATCH  /api/pets/{id}/schedule/{slot_id} Update a schedule slot
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.pet import Pet, PetMealScheduleSlot
from ..models.user import User
from ..schemas.pet import (
    PetCreate,
    PetResponse,
    PetUpdate,
    ScheduleSlotResponse,
    ScheduleSlotUpdate,
)
from ..services.auth_service import get_current_user
from datetime import datetime, timezone

router = APIRouter(prefix="/api/pets", tags=["pets"])


async def _get_active_pet(pet_id: int, db: AsyncSession) -> Pet:
    """Retrieve an active pet by ID or raise 404."""
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


@router.get("", response_model=list[PetResponse])
async def list_pets(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PetResponse]:
    """Return all active (non-deleted) pets with their schedule slots."""
    result = await db.execute(
        select(Pet)
        .where(Pet.deleted_at.is_(None))
        .options(selectinload(Pet.schedule_slots))
        .order_by(Pet.name)
    )
    pets = result.scalars().all()
    return [PetResponse.model_validate(p) for p in pets]


@router.post("", response_model=PetResponse, status_code=status.HTTP_201_CREATED)
async def create_pet(
    payload: PetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PetResponse:
    """
    Create a new pet profile.

    If the pet is a dog and schedule_slots are provided, those slots are
    created. The cat species ignores schedule_slots (all meals are ad_hoc).
    """
    pet = Pet(
        name=payload.name.strip(),
        species=payload.species,
        breed=payload.breed,
        date_of_birth=payload.date_of_birth,
        weight_kg=payload.weight_kg,
    )
    db.add(pet)
    await db.flush()  # Get pet.id

    if payload.species == "dog":
        for slot_data in payload.schedule_slots:
            if slot_data.window_start >= slot_data.window_end:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Schedule slot window_start must be before window_end "
                        f"for meal type '{slot_data.meal_type}'."
                    ),
                )
            db.add(
                PetMealScheduleSlot(
                    pet_id=pet.id,
                    meal_type=slot_data.meal_type,
                    window_start=slot_data.window_start,
                    window_end=slot_data.window_end,
                    reason_required_on_deviation=slot_data.reason_required_on_deviation,
                )
            )

    await db.flush()
    # Reload with slots for the response
    return PetResponse.model_validate(await _get_active_pet(pet.id, db))


@router.get("/{pet_id}", response_model=PetResponse)
async def get_pet(
    pet_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PetResponse:
    """Return a single active pet."""
    pet = await _get_active_pet(pet_id, db)
    return PetResponse.model_validate(pet)


@router.patch("/{pet_id}", response_model=PetResponse)
async def update_pet(
    pet_id: int,
    payload: PetUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PetResponse:
    """Partial update of a pet profile. Species cannot be changed after creation."""
    pet = await _get_active_pet(pet_id, db)

    if payload.name is not None:
        pet.name = payload.name.strip()
    if payload.breed is not None:
        pet.breed = payload.breed
    if payload.date_of_birth is not None:
        pet.date_of_birth = payload.date_of_birth
    if payload.weight_kg is not None:
        pet.weight_kg = payload.weight_kg

    await db.flush()
    return PetResponse.model_validate(await _get_active_pet(pet_id, db))


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pet(
    pet_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    """Soft-delete a pet. The record is retained; deleted_at is populated."""
    pet = await _get_active_pet(pet_id, db)
    pet.deleted_at = datetime.now(timezone.utc)
    await db.flush()


@router.get("/{pet_id}/schedule", response_model=list[ScheduleSlotResponse])
async def get_schedule(
    pet_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ScheduleSlotResponse]:
    """Return schedule slots for a pet. Empty list for cats."""
    pet = await _get_active_pet(pet_id, db)
    return [ScheduleSlotResponse.model_validate(s) for s in pet.schedule_slots]


@router.patch("/{pet_id}/schedule/{slot_id}", response_model=ScheduleSlotResponse)
async def update_schedule_slot(
    pet_id: int,
    slot_id: int,
    payload: ScheduleSlotUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ScheduleSlotResponse:
    """
    Update a specific schedule slot window.

    Note: changing the window here will not affect historical meal log
    deviation records, which capture the window at the time of logging.
    """
    pet = await _get_active_pet(pet_id, db)

    slot = next((s for s in pet.schedule_slots if s.id == slot_id), None)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule slot {slot_id} not found on pet {pet_id}.",
        )

    if payload.window_start is not None:
        slot.window_start = payload.window_start
    if payload.window_end is not None:
        slot.window_end = payload.window_end
    if payload.reason_required_on_deviation is not None:
        slot.reason_required_on_deviation = payload.reason_required_on_deviation

    # Validate the resulting window after partial update
    if slot.window_start >= slot.window_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="window_start must be before window_end.",
        )

    await db.flush()
    return ScheduleSlotResponse.model_validate(slot)
