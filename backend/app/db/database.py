"""SQLAlchemy database configuration."""

from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_PATH = Path(__file__).resolve().parents[2] / "luna_reg.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
	DATABASE_URL,
	connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
	pass


def get_db() -> Generator[Session, None, None]:
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()
