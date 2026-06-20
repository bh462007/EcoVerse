from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="EcoVerse AI Carbon Estimator",
    description="Microservice to calculate product carbon footprints",
    version="0.1.0"
)

class ProductData(BaseModel):
    product_name: str
    category: str
    barcode: str | None = None
    weight_g: float = 100.0

@app.post("/api/estimate")
async def estimate_carbon(product: ProductData):
    category_multipliers = {
        "Food": 2.5,
        "Electronics": 15.0,
        "Cosmetics": 5.0,
        "Clothing": 10.0
    }
    
    multiplier = category_multipliers.get(product.category, 5.0)
    estimated_kg_co2 = (product.weight_g / 1000) * multiplier
    
    return {
        "success": True,
        "product": product.product_name,
        "category": product.category,
        "estimated_kg_co2": round(estimated_kg_co2, 2),
        "confidence_score": 0.85,
        "engine": "v1_rule_based"
    }