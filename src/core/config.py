from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
database_url: str
telegram_bot_token: str
slot_duration_min: int = 45
reminder_minutes_before: int = 30


class Config:
env_prefix = ''
env_file = '.env'


settings = Settings(
database_url=os.getenv('DATABASE_URL'),
telegram_bot_token=os.getenv('TELEGRAM_BOT_TOKEN')
)