import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Reads from environment variables, or defaults to the local file
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ecoverse.db")

# connect_args is needed specifically for SQLite in FastAPI
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# This creates database sessions for our API endpoints to use
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# This is the base class we will use to create our database tables
Base = declarative_base()