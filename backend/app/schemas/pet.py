"""Pydantic schemas for pet profiles and meal schedule slots."""

from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from .common import ResponseBase


# --- Schedule slot schemas ---

class ScheduleSlotCreate(BaseModel):
    meal_type: Literal["breakfast", "snack", "dinner"]
    window_start: time
    window_end: time
    reason_required_on_deviation: bool = False

    @property
    def is_valid_window(self) -> bool:
        return self.window_start < self.window_end


class ScheduleSlotUpdate(BaseModel):
    window_start: Optional[time] = None
    window_end: Optional[time] = None
    reason_required_on_deviation: Optional[bool] = None


class ScheduleSlotResponse(ResponseBase):

    id: int
    meal_type: str
    window_start: time
    window_end: time
    reason_required_on_deviation: bool
    updated_at: datetime


# --- Pet schemas ---

class PetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    species: Literal["dog", "cat"]
    breed: Optional[str] = Field(default=None, max_length=100)
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = Field(default=None, gt=0, le=200)
    # Schedule slots provided at creation (dogs only; ignored for cat).
    schedule_slots: list[ScheduleSlotCreate] = []


class PetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    breed: Optional[str] = Field(default=None, max_length=100)
    date_of_birth: Optional[date] = None
    weight_kg: Optional[float] = Field(default=None, gt=0, le=200)


class PetResponse(ResponseBase):

    id: int
    name: str
    species: str
    breed: Optional[str]
    date_of_birth: Optional[date]
    weight_kg: Optional[float]
    schedule_slots: list[ScheduleSlotResponse]
    created_at: datetime
    deleted_at: Optional[datetime]
