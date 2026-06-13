"""Initial schema: all tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000

Creates all 13 tables in dependency order:
  users, pets, pet_meal_schedule_slots,
  food_categories, ingredients, food_items,
  food_item_ingredients, food_item_edit_history,
  meal_logs, meal_log_items,
  symptoms, health_observations, health_observation_symptoms
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # --- pets ---
    op.create_table(
        "pets",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("species", sa.String(), nullable=False),
        sa.Column("breed", sa.String(), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- pet_meal_schedule_slots ---
    op.create_table(
        "pet_meal_schedule_slots",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("meal_type", sa.String(), nullable=False),
        sa.Column("window_start", sa.Time(), nullable=False),
        sa.Column("window_end", sa.Time(), nullable=False),
        sa.Column("reason_required_on_deviation", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pet_meal_schedule_slots_pet_id", "pet_meal_schedule_slots", ["pet_id"])

    # --- food_categories ---
    op.create_table(
        "food_categories",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, default=0),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # --- ingredients ---
    op.create_table(
        "ingredients",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("is_common_allergen", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # --- food_items ---
    op.create_table(
        "food_items",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("food_category_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, default=False),
        sa.Column("previous_version_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["food_category_id"], ["food_categories.id"]),
        sa.ForeignKeyConstraint(["previous_version_id"], ["food_items.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- food_item_ingredients ---
    op.create_table(
        "food_item_ingredients",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("food_item_id", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["food_item_id"], ["food_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ingredient_id"], ["ingredients.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("food_item_id", "ingredient_id", name="uq_food_item_ingredient"),
    )
    op.create_index("ix_food_item_ingredients_food_item_id", "food_item_ingredients", ["food_item_id"])
    op.create_index("ix_food_item_ingredients_ingredient_id", "food_item_ingredients", ["ingredient_id"])

    # --- food_item_edit_history ---
    op.create_table(
        "food_item_edit_history",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("food_item_id", sa.Integer(), nullable=False),
        sa.Column("changed_by", sa.Integer(), nullable=False),
        sa.Column("snapshot_before", sa.JSON(), nullable=False),
        sa.Column("snapshot_after", sa.JSON(), nullable=False),
        sa.Column("change_reason", sa.String(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["food_item_id"], ["food_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_food_item_edit_history_food_item_id", "food_item_edit_history", ["food_item_id"])

    # --- meal_logs ---
    op.create_table(
        "meal_logs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("logged_by", sa.Integer(), nullable=False),
        sa.Column("meal_type", sa.String(), nullable=False),
        sa.Column("fed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deviation_minutes", sa.Integer(), nullable=True),
        sa.Column("deviation_reason", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("corrects_log_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["logged_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["corrects_log_id"], ["meal_logs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_logs_pet_id", "meal_logs", ["pet_id"])
    op.create_index("ix_meal_logs_fed_at", "meal_logs", ["fed_at"])
    # Composite index for temporal correlation queries: all meals for a pet in a date range
    op.create_index("ix_meal_logs_pet_id_fed_at", "meal_logs", ["pet_id", "fed_at"])

    # --- meal_log_items ---
    op.create_table(
        "meal_log_items",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("meal_log_id", sa.Integer(), nullable=False),
        sa.Column("food_item_id", sa.Integer(), nullable=False),
        sa.Column("portion_grams", sa.Float(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["meal_log_id"], ["meal_logs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["food_item_id"], ["food_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_log_items_meal_log_id", "meal_log_items", ["meal_log_id"])
    op.create_index("ix_meal_log_items_food_item_id", "meal_log_items", ["food_item_id"])

    # --- symptoms ---
    op.create_table(
        "symptoms",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("applies_to_species", sa.String(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, default=0),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # --- health_observations ---
    op.create_table(
        "health_observations",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("logged_by", sa.Integer(), nullable=False),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("energy_level", sa.Integer(), nullable=True),
        sa.Column("digestion_comfort", sa.Integer(), nullable=True),
        sa.Column("stool_quality", sa.Integer(), nullable=True),
        sa.Column("reaction_severity", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10)",
            name="ck_energy_level",
        ),
        sa.CheckConstraint(
            "digestion_comfort IS NULL OR (digestion_comfort >= 1 AND digestion_comfort <= 10)",
            name="ck_digestion_comfort",
        ),
        sa.CheckConstraint(
            "stool_quality IS NULL OR (stool_quality >= 1 AND stool_quality <= 7)",
            name="ck_stool_quality",
        ),
        sa.CheckConstraint(
            "reaction_severity IS NULL OR (reaction_severity >= 0 AND reaction_severity <= 10)",
            name="ck_reaction_severity",
        ),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["logged_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_health_observations_pet_id", "health_observations", ["pet_id"])
    op.create_index("ix_health_observations_observation_date", "health_observations", ["observation_date"])
    # Composite index for temporal correlation: all observations for a pet in a date range
    op.create_index(
        "ix_health_observations_pet_id_date",
        "health_observations",
        ["pet_id", "observation_date"],
    )

    # --- health_observation_symptoms ---
    op.create_table(
        "health_observation_symptoms",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("health_observation_id", sa.Integer(), nullable=False),
        sa.Column("symptom_id", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["health_observation_id"],
            ["health_observations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["symptom_id"], ["symptoms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "health_observation_id",
            "symptom_id",
            name="uq_observation_symptom",
        ),
    )
    op.create_index(
        "ix_health_observation_symptoms_health_observation_id",
        "health_observation_symptoms",
        ["health_observation_id"],
    )
    op.create_index(
        "ix_health_observation_symptoms_symptom_id",
        "health_observation_symptoms",
        ["symptom_id"],
    )


def downgrade() -> None:
    op.drop_table("health_observation_symptoms")
    op.drop_table("health_observations")
    op.drop_table("symptoms")
    op.drop_table("meal_log_items")
    op.drop_table("meal_logs")
    op.drop_table("food_item_edit_history")
    op.drop_table("food_item_ingredients")
    op.drop_table("food_items")
    op.drop_table("ingredients")
    op.drop_table("food_categories")
    op.drop_table("pet_meal_schedule_slots")
    op.drop_table("pets")
    op.drop_table("users")
