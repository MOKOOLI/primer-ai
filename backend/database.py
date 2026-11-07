import databases
import sqlalchemy

# آدرس دیتابیس (یک فایل در پوشه بک‌اند ساخته می‌شود)
DATABASE_URL = "sqlite:///./primerai.db"

database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

# تعریف جدول بازخوردها
feedback_table = sqlalchemy.Table(
    "feedbacks",
    metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("primer_sequence", sqlalchemy.String),
    sqlalchemy.Column("rating", sqlalchemy.Integer),
    sqlalchemy.Column("comment", sqlalchemy.String),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, server_default=sqlalchemy.func.now()),
)

engine = sqlalchemy.create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
metadata.create_all(engine)