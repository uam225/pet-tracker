"""
Health observation models.

A HealthObservation captures a pet's wellbeing at a point in time.
It combines scored metrics (numeric scales) with zero or more observed
symptoms from the fixed symptom catalogue.

Key design decisions:
- observation_date is separate from observed_at (the logging timestamp).
  This allows retroactive logging (e.g. noting yesterday's symptoms the
  following morning) while preserving the audit trail of when the entry
  was actually made.
- All scored metrics are nullable. Partial observations are valid and
  common (e.g. logging only a stool quality score after a walk).
- The symptom catalogue is seeded at deployment and is not user-editable
  in MVP. applies_to_species filters presentation per pet.
- Soft delete only: deleted_at is set; rows are never removed.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .pet import Pet
    from .user import User


class HealthObservation(Base):
    """
    A logged health observation for a single pet on a specific date.

    Scale reference:
      energy_level:      1-10  Higher = more energetic. 5 = baseline normal.
      digestion_comfort: 1-10  Higher = better. 1 = severe distress.
      stool_quality:     1-7   Purina Fecal Score. 3 = ideal formed stool.
      reaction_severity: 0-10  Higher = worse reaction. 0 = confirmed clear.
                               NULL = not assessed (distinct from 0).
    """

    __tablename__ = "health_observations"
    __table_args__ = (
        CheckConstraint(
            "energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10)",
            name="ck_energy_level",
        ),
        CheckConstraint(
            "digestion_comfort IS NULL OR (digestion_comfort >= 1 AND digestion_comfort <= 10)",
            name="ck_digestion_comfort",
        ),
        CheckConstraint(
            "stool_quality IS NULL OR (stool_quality >= 1 AND stool_quality <= 7)",
            name="ck_stool_quality",
        ),
        CheckConstraint(
            "reaction_severity IS NULL OR (reaction_severity >= 0 AND reaction_severity <= 10)",
            name="ck_reaction_severity",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pet_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pets.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    logged_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    # Timestamp at which the observation was entered into the system (UTC).
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # The date the observation pertains to. Indexed for date-range queries
    # and future temporal correlation with meal logs.
    observation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Scored metrics - all nullable; partial observations are valid
    energy_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    digestion_comfort: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stool_quality: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reaction_severity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pet: Mapped[Pet] = relationship("Pet", back_populates="health_observations")
    logged_by_user: Mapped[User] = relationship(
        "User",
        back_populates="health_observations",
        foreign_keys=[logged_by],
    )
    symptoms: Mapped[list[HealthObservationSymptom]] = relationship(
        "HealthObservationSymptom",
        back_populates="observation",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<HealthObservation id={self.id} "
            f"pet_id={self.pet_id} "
            f"date={self.observation_date}>"
        )


class Symptom(Base):
    """
    Fixed symptom catalogue. Seeded at deployment; not user-editable in MVP.

    applies_to_species controls which symptoms are available when logging
    an observation for a given pet. Dog-specific symptoms (e.g. paw gnawing)
    are filtered out for the cat.
    """

    __tablename__ = "symptoms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    # Clinical description shown alongside the name in the UI.
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # 'dog' = dogs only.  'all' = available for all species.
    applies_to_species: Mapped[str] = mapped_column(String, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    observation_links: Mapped[list[HealthObservationSymptom]] = relationship(
        "HealthObservationSymptom", back_populates="symptom"
    )

    def __repr__(self) -> str:
        return (
            f"<Symptom id={self.id} name={self.name!r} "
            f"species={self.applies_to_species!r}>"
        )


class HealthObservationSymptom(Base):
    """
    Junction table: links a HealthObservation to one or more Symptoms.

    The per-symptom notes field captures specifics critical for longitudinal
    pattern tracking (e.g. 'Right rear paw only, started after dinner').
    """

    __tablename__ = "health_observation_symptoms"
    __table_args__ = (
        UniqueConstraint(
            "health_observation_id",
            "symptom_id",
            name="uq_observation_symptom",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    health_observation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("health_observations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    symptom_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("symptoms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Per-symptom note: degree, location, duration, context.
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    observation: Mapped[HealthObservation] = relationship(
        "HealthObservation", back_populates="symptoms"
    )
    symptom: Mapped[Symptom] = relationship(
        "Symptom", back_populates="observation_links"
    )

    def __repr__(self) -> str:
        return (
            f"<HealthObservationSymptom "
            f"observation_id={self.health_observation_id} "
            f"symptom_id={self.symptom_id}>"
        )
