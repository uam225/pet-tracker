"""
Shared Pydantic schema building blocks.

The key piece here is ResponseBase, which fixes a timezone-serialisation
problem specific to SQLite.

Background: our datetime columns are declared DateTime(timezone=True) and we
store UTC values. SQLite, however, does not persist timezone information, so
when SQLAlchemy reads the values back they are *naive* datetimes (tzinfo is
None) even though the underlying value is UTC. Pydantic then serialises a
naive datetime to JSON with no offset, e.g. "2026-06-22T17:03:00". A browser
parsing that string with `new Date(...)` treats it as *local* time, not UTC,
which shifts every displayed time by the client's UTC offset (one hour in
the UK during BST).

ResponseBase normalises this on output: any naive datetime is assumed to be
UTC and serialised with an explicit "Z"/offset, so clients parse it correctly.
Response schemas should inherit from ResponseBase instead of BaseModel.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_serializer


class ResponseBase(BaseModel):
    """Base for all API response models.

    Enables ORM attribute population and guarantees that datetimes are
    serialised with explicit UTC timezone information.
    """

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def _serialise_datetimes_as_utc(self, value: object) -> object:
        """Stamp naive datetimes as UTC so JSON output carries an offset.

        Applies to every field, but only transforms datetime values; all
        other field types pass through unchanged. A datetime that already
        carries tzinfo is converted to UTC rather than assumed.
        """
        if isinstance(value, datetime):
            if value.tzinfo is None:
                # Stored value is UTC but lost its tzinfo via SQLite.
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return value
