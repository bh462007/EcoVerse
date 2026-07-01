from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True)
    total_emissions_kg = Column(Float, default=0.0)

    # Relationships to link users to their scans and badges
    scans = relationship("Scan", back_populates="owner")
    badges = relationship("UserBadge", back_populates="owner")

class Scan(Base):
    __tablename__ = "scans"
    
    id = Column(Integer, primary_key=True, index=True)
    # FIX: Added index and made it required (nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    product_name = Column(String, index=True)
    category = Column(String)
    carbon_footprint_kg = Column(Float)
    scanned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="scans")

class UserBadge(Base):
    __tablename__ = "user_badges"
    # FIX: Prevent duplicate badges for the same user
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),)
    
    id = Column(Integer, primary_key=True, index=True)
    # FIX: Added index and made it required
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    badge_id = Column(String, index=True)
    earned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="badges")