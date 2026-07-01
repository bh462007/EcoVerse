from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List

# Import our new database files
import models
from database import engine, SessionLocal

# Create the database tables automatically when the app starts
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EcoVerse AI Services - Stateful",
    description="Database-driven Carbon Analytics and Gamification",
    version="0.3.0"
)

# --- DATABASE DEPENDENCY ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- MODELS (Simplified since the DB handles the heavy lifting) ---
class ProductData(BaseModel):
    product_name: str
    category: str
    weight_g: float = Field(default=100.0, gt=0)

class ScanCreate(BaseModel):
    user_id: str = Field(min_length=1)
    product_name: str
    category: str
    carbon_footprint_kg: float = Field(ge=0)

class LeaderboardRequest(BaseModel):
    requesting_user_id: str = Field(min_length=1)

class AnalyticsRequest(BaseModel):
    user_id: str = Field(min_length=1)

# --- ENDPOINT 1: Estimation (Remains Stateless) ---
@app.post("/api/estimate")
async def estimate_carbon(product: ProductData):
    category_multipliers = {"food": 2.5, "electronics": 15.0, "cosmetics": 5.0, "clothing": 10.0}
    multiplier = category_multipliers.get(product.category.strip().lower(), 5.0)
    estimated_kg_co2 = (product.weight_g / 1000) * multiplier
    
    return {
        "success": True,
        "product": product.product_name,
        "estimated_kg_co2": round(estimated_kg_co2, 2)
    }

# --- NEW ENDPOINT: Save a Scan to the Database ---
@app.post("/api/scans")
async def create_scan(scan_data: ScanCreate, db: Session = Depends(get_db)):
    # 1. Ensure user exists in the database
    user = db.query(models.User).filter(models.User.id == scan_data.user_id).first()
    if not user:
        user = models.User(id=scan_data.user_id, total_emissions_kg=0.0)
        db.add(user)
    
    # 2. Add the scan to the database
    new_scan = models.Scan(
        user_id=scan_data.user_id,
        product_name=scan_data.product_name,
        category=scan_data.category,
        carbon_footprint_kg=scan_data.carbon_footprint_kg
    )
    db.add(new_scan)
    
    # 3. Update the user's total emissions
    user.total_emissions_kg += scan_data.carbon_footprint_kg
    
    db.commit()
    return {"success": True, "message": "Scan logged to database!"}

# --- ENDPOINT 2: Analytics (Now reads from the DB!) ---
@app.post("/api/analytics")
async def get_analytics(data: AnalyticsRequest, db: Session = Depends(get_db)):
    scans = db.query(models.Scan).filter(models.Scan.user_id == data.user_id).all()
    
    if not scans:
        raise HTTPException(status_code=404, detail="No scan history found for this user.")

    category_totals = {}
    total_emissions = 0.0

    for scan in scans:
        cat = scan.category.title()
        category_totals[cat] = category_totals.get(cat, 0.0) + scan.carbon_footprint_kg
        total_emissions += scan.carbon_footprint_kg

    top_category = max(category_totals, key=category_totals.get)
    penalty = (total_emissions / 10.0) * 15  
    score = max(1, min(100, 100 - penalty)) 

    return {
        "success": True,
        "user_id": data.user_id,
        "total_emissions_kg": round(total_emissions, 2),
        "sustainability_score": round(score),
        "top_emitting_category": top_category
    }

# --- ENDPOINT 3: Leaderboard (Now reads from the DB!) ---
@app.post("/api/leaderboard")
async def get_leaderboard(data: LeaderboardRequest, db: Session = Depends(get_db)):
    all_users = db.query(models.User).order_by(models.User.total_emissions_kg.asc()).all()
    
    if not all_users:
        raise HTTPException(status_code=404, detail="No users in database.")

    requesting_user = next((u for u in all_users if u.id == data.requesting_user_id), None)
    if not requesting_user:
        raise HTTPException(status_code=404, detail="User not found.")

    req_emissions = requesting_user.total_emissions_kg
    user_rank = 1 + sum(1 for u in all_users if u.total_emissions_kg < req_emissions)
    people_beaten = sum(1 for u in all_users if u.total_emissions_kg > req_emissions)
    
    others = len(all_users) - 1
    percentile = (people_beaten / others) * 100 if others > 0 else 100.0

    top_10 = [{"rank": i + 1, "user_id": u.id, "emissions_kg": u.total_emissions_kg} for i, u in enumerate(all_users[:10])]

    return {
        "success": True,
        "leaderboard": top_10,
        "stats": {
            "user_rank": user_rank,
            "percentile_score": round(percentile, 1),
            "status_message": f"You are beating {round(percentile)}% of users!"
        }
    }