"""
Health observation service.

Contains business logic for creating and querying health observations,
and building the dashboard summary for all active pets.
"""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.health import (
    HealthObservation,
    HealthObservationSymptom,
    Symptom,
)
from ..models.meal_log import MealLog
from ..models.pet import Pet, PetMealScheduleSlot
from ..schemas.health import (
    DashboardResponse,
    HealthObservationCreate,
    HealthObservationUpdate,
    MissedSlot,
    PetDashboardSummary,
)
from ..services.meal_service import get_todays_logs_for_pet


async def create_observation(
    payload: HealthObservationCreate,
    logged_by_user_id: int,
    db: AsyncSession,
) -> HealthObservation:
    """
    Create a new health observation for a pet.

    Validates that:
    - The pet exists and is active.
    - All supplied symptom IDs exist and are active.
    - Symptoms marked as 'dog' species are not logged for a cat.
    """
    # Verify pet
    pet_result = await db.execute(
        select(Pet).where(Pet.id == payload.pet_id, Pet.deleted_at.is_(None))
    )
    pet = pet_result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pet {payload.pet_id} not found.",
        )

    # Validate symptoms
    symptom_ids = [s.symptom_id for s in payload.symptoms]
    if symptom_ids:
        symptoms_result = await db.execute(
            select(Symptom).where(
                Symptom.id.in_(symptom_ids),
                Symptom.is_active.is_(True),
            )
        )
        found_symptoms = {s.id: s for s in symptoms_result.scalars().all()}

        for sym_payload in payload.symptoms:
            sym = found_symptoms.get(sym_payload.symptom_id)
            if sym is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Symptom {sym_payload.symptom_id} not found or inactive.",
                )
            # Enforce species applicability
            if sym.applies_to_species == "dog" and pet.species != "dog":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Symptom '{sym.name}' is only applicable to dogs. "
                        f"'{pet.name}' is a {pet.species}."
                    ),
                )

    observation = HealthObservation(
        pet_id=payload.pet_id,
        logged_by=logged_by_user_id,
        observed_at=datetime.now(timezone.utc),
        observation_date=payload.observation_date,
        energy_level=payload.energy_level,
        digestion_comfort=payload.digestion_comfort,
        stool_quality=payload.stool_quality,
        reaction_severity=payload.reaction_severity,
        notes=payload.notes,
    )
    db.add(observation)
    await db.flush()  # Get observation.id

    for sym_payload in payload.symptoms:
        db.add(
            HealthObservationSymptom(
                health_observation_id=observation.id,
                symptom_id=sym_payload.symptom_id,
                notes=sym_payload.notes,
            )
        )

    await db.flush()
    return observation


async def update_observation(
    observation_id: int,
    payload: HealthObservationUpdate,
    requesting_user_id: int,
    db: AsyncSession,
) -> HealthObservation:
    """Update an existing health observation. No correction window applies."""
    result = await db.execute(
        select(HealthObservation)
        .where(
            HealthObservation.id == observation_id,
            HealthObservation.deleted_at.is_(None),
        )
        .options(selectinload(HealthObservation.symptoms))
    )
    obs = result.scalar_one_or_none()

    if obs is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Health observation not found.",
        )

    # Apply scalar updates
    update_fields = {
        "observation_date", "energy_level", "digestion_comfort",
        "stool_quality", "reaction_severity", "notes",
    }
    for field in update_fields:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(obs, field, value)

    # Replace symptom list if provided
    if payload.symptoms is not None:
        for existing_sym in obs.symptoms:
            await db.delete(existing_sym)
        await db.flush()

        for sym_payload in payload.symptoms:
            db.add(
                HealthObservationSymptom(
                    health_observation_id=obs.id,
                    symptom_id=sym_payload.symptom_id,
                    notes=sym_payload.notes,
                )
            )

    await db.flush()
    return obs


async def soft_delete_observation(
    observation_id: int,
    db: AsyncSession,
) -> None:
    """Soft-delete a health observation by setting deleted_at."""
    result = await db.execute(
        select(HealthObservation).where(
            HealthObservation.id == observation_id,
            HealthObservation.deleted_at.is_(None),
        )
    )
    obs = result.scalar_one_or_none()
    if obs is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Health observation not found.",
        )
    obs.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def build_dashboard(db: AsyncSession) -> DashboardResponse:
    """
    Build the dashboard summary for all active pets.

    For each pet, returns:
    - Count of meals logged today
    - Missed schedule slots (dogs only: slots past their window with no log)
    - Most recent health observation (today's if available, else latest)
    - Symptom names from today's health observations
    """
    today = datetime.now(timezone.utc).date()
    now_utc = datetime.now(timezone.utc)

    # Load all active pets with their schedule slots and today's observations
    pets_result = await db.execute(
        select(Pet)
        .where(Pet.deleted_at.is_(None))
        .options(
            selectinload(Pet.schedule_slots),
        )
        .order_by(Pet.name)
    )
    pets = pets_result.scalars().all()

    summaries = []

    for pet in pets:
        # --- Today's meals ---
        todays_logs = await get_todays_logs_for_pet(pet.id, today, db)

        # --- Missed slots (dogs only) ---
        missed_slots: list[MissedSlot] = []
        if pet.species == "dog":
            logged_types_today = {log.meal_type for log in todays_logs}
            for slot in pet.schedule_slots:
                if slot.meal_type not in logged_types_today:
                    # Only flag as missed if the window has already closed.
                    window_end_today = datetime.combine(today, slot.window_end).replace(
                        tzinfo=timezone.utc
                    )
                    if now_utc > window_end_today:
                        missed_slots.append(
                            MissedSlot(
                                meal_type=slot.meal_type,
                                window_start=slot.window_start.strftime("%H:%M"),
                                window_end=slot.window_end.strftime("%H:%M"),
                            )
                        )

        # --- Latest health observation ---
        # Prefer today's most recent; fall back to the most recent overall.
        obs_result = await db.execute(
            select(HealthObservation)
            .where(
                HealthObservation.pet_id == pet.id,
                HealthObservation.deleted_at.is_(None),
            )
            .options(
                selectinload(HealthObservation.symptoms).selectinload(
                    HealthObservationSymptom.symptom
                )
            )
            .order_by(HealthObservation.observation_date.desc(), HealthObservation.observed_at.desc())
            .limit(1)
        )
        latest_obs = obs_result.scalar_one_or_none()

        # --- Active symptoms from today's observations ---
        todays_obs_result = await db.execute(
            select(HealthObservation)
            .where(
                HealthObservation.pet_id == pet.id,
                HealthObservation.deleted_at.is_(None),
                HealthObservation.observation_date == today,
            )
            .options(
                selectinload(HealthObservation.symptoms).selectinload(
                    HealthObservationSymptom.symptom
                )
            )
        )
        todays_obs = todays_obs_result.scalars().all()

        active_symptoms: list[str] = []
        seen_symptom_ids: set[int] = set()
        for obs in todays_obs:
            for obs_sym in obs.symptoms:
                if obs_sym.symptom_id not in seen_symptom_ids:
                    active_symptoms.append(obs_sym.symptom.name)
                    seen_symptom_ids.add(obs_sym.symptom_id)

        summaries.append(
            PetDashboardSummary(
                pet_id=pet.id,
                pet_name=pet.name,
                pet_species=pet.species,
                todays_meal_count=len(todays_logs),
                missed_slots=missed_slots,
                latest_observation=latest_obs,
                active_symptoms=active_symptoms,
            )
        )

    return DashboardResponse(
        pets=summaries,
        generated_at=now_utc,
    )
