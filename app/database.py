import os
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

default_db_path = "/tmp/telemedicine.db" if (os.environ.get("VERCEL") or os.environ.get("AWS_EXECUTION_ENV")) else "./telemedicine.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{default_db_path}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
