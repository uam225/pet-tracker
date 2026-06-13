"""Pydantic schemas for health observation and symptom endpoints."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Symptom schemas ---

class SymptomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    applies_to_species: str
    display_order: int
    is_active: bool


# --- Health observation schemas ---

class HealthObservationSymptomCreate(BaseModel):
    symptom_id: int
    # Per-symptom detail: location, duration, severity descriptor, etc.
    notes: Optional[str] = Field(default=None, max_length=500)


class HealthObservationCreate(BaseModel):
    pet_id: int
    # The date the observation pertains to. May be in the past if logging
    # retroactively. Defaults to today if not supplied.
    observation_date: date
    # All scored metrics are optional; partial observations are valid.
    energy_level: Optional[int] = Field(default=None, ge=1, le=10)
    digestion_comfort: Optional[int] = Field(default=None, ge=1, le=10)
    stool_quality: Optional[int] = Field(default=None, ge=1, le=7)
    reaction_severity: Optional[int] = Field(default=None, ge=0, le=10)
    symptoms: list[HealthObservationSymptomCreate] = []
    notes: Optional[str] = Field(default=None, max_length=2000)


class HealthObservationUpdate(BaseModel):
    """Partial update for a health observation."""
    observation_date: Optional[date] = None
    energy_level: Optional[int] = Field(default=None, ge=1, le=10)
    digestion_comfort: Optional[int] = Field(default=None, ge=1, le=10)
    stool_quality: Optional[int] = Field(default=None, ge=1, le=7)
    reaction_severity: Optional[int] = Field(default=None, ge=0, le=10)
    symptoms: Optional[list[HealthObservationSymptomCreate]] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class HealthObservationSymptomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symptom: SymptomResponse
    notes: Optional[str]


class HealthObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pet_id: int
    logged_by: int
    observed_at: datetime
    observation_date: date
    energy_level: Optional[int]
    digestion_comfort: Optional[int]
    stool_quality: Optional[int]
    reaction_severity: Optional[int]
    symptoms: list[HealthObservationSymptomResponse]
    notes: Optional[str]
    created_at: datetime
    deleted_at: Optional[datetime]


# --- Dashboard schemas ---

class MissedSlot(BaseModel):
    """A scheduled meal slot that has no corresponding log entry today."""
    meal_type: str
    window_start: str  # HH:MM format for display
    window_end: str


class PetDashboardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pet_id: int
    pet_name: str
    pet_species: str
    todays_meal_count: int
    missed_slots: list[MissedSlot]
    latest_observation: Optional[HealthObservationResponse]
    active_symptoms: list[str]  # Symptom names from today's observations


class DashboardResponse(BaseModel):
    pets: list[PetDashboardSummary]
    generated_at: datetime
