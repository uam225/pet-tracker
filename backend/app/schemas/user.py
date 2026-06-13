"""Pydantic schemas for user registration, login, and responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=["Umair"])
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=128,
        description="Minimum 8 characters.",
    )


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    created_at: datetime


class RegistrationStatusResponse(BaseModel):
    """Indicates whether new user registration is currently permitted."""

    is_open: bool
    current_count: int
    max_users: int
